/**
 * 媒体处理模块
 *
 * 负责媒体下载和路径解析。
 * 与 Telegram 通道对齐：下载的媒体保存到 <stateDir>/media/inbound/。
 */

import { getWechatMiniprogramRuntime } from "./runtime.js";
import path from "node:path";
import fs from "fs";

export interface MediaInfo {
  mediaUrls: string[];
  mediaTypes: string[];
  mediaPaths: string[];
}

/** 与 Telegram 一致：inbound 媒体保存目录名 */
const MEDIA_INBOUND_DIR = "media/inbound";

/** 根据 MIME 类型返回常见扩展名 */
function getExtensionFromMime(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "application/pdf": ".pdf",
  };
  if (map[base]) return map[base];
  if (base.startsWith("image/")) return ".jpg";
  if (base.startsWith("video/")) return ".mp4";
  if (base.startsWith("audio/")) return ".mp3";
  return "";
}

function getExtensionFromFileName(fileName?: string): string {
  if (!fileName) return "";
  const ext = path.extname(fileName).trim().toLowerCase();
  return ext || "";
}

/** 使用 Node fetch 直接下载 URL 到 buffer（插件内自实现，不依赖 channel.media） */
async function fetchUrlToBuffer(url: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
  return { buffer, contentType };
}

/**
 * 下载媒体到本地，保存到 <stateDir>/media/inbound/（与 Telegram 对齐）
 * 优先使用 runtime.channel.media.fetchRemoteMedia；若不可用则用 fetch 直接下载。
 *
 * @param mediaUrls - 媒体 URL 数组
 * @param mediaTypes - 媒体类型数组
 * @param accountId - 账户 ID（用于日志）
 * @param log - 日志函数（含 info 时会打出保存路径，便于排查）
 * @returns 媒体信息（包含下载后的本地绝对路径）
 */
export async function downloadMedia(
  mediaUrls: string[],
  mediaTypes: string[],
  mediaFileNames: string[] = [],
  accountId: string,
  log?: { info?: (msg: string) => void; warn?: (msg: string) => void; error?: (msg: string) => void }
): Promise<MediaInfo> {
  const mediaPaths: string[] = [];

  if (mediaUrls.length === 0) {
    return { mediaUrls, mediaTypes, mediaPaths };
  }

  try {
    const runtime = getWechatMiniprogramRuntime();
    const stateDir = runtime.state.resolveStateDir();
    const inboundDir = path.join(stateDir, MEDIA_INBOUND_DIR);
    fs.mkdirSync(inboundDir, { recursive: true });

    log?.info?.(`[${accountId}] Downloading ${mediaUrls.length} media to ${inboundDir}`);

    const maxBytes = 10 * 1024 * 1024; // 10MB 限制
    const hasFetchRemote =
      runtime.channel?.media && typeof runtime.channel.media.fetchRemoteMedia === "function";

    for (let i = 0; i < mediaUrls.length; i++) {
      const mediaUrl = mediaUrls[i];
      const mediaType = mediaTypes[i] || "image/jpeg";
      const mediaFileName = mediaFileNames[i] || "";

      try {
        let buffer: ArrayBuffer;
        let contentType: string;

        if (hasFetchRemote) {
          const fetched = await runtime.channel.media.fetchRemoteMedia({ url: mediaUrl });
          buffer = fetched.buffer instanceof ArrayBuffer ? fetched.buffer : (fetched.buffer as ArrayBuffer);
          contentType = fetched.contentType || mediaType;
        } else {
          const fetched = await fetchUrlToBuffer(mediaUrl);
          buffer = fetched.buffer;
          contentType = fetched.contentType || mediaType;
        }

        if (buffer.byteLength > maxBytes) {
          log?.error?.(`[${accountId}] Media ${i + 1}/${mediaUrls.length} exceeds ${maxBytes} bytes, skipped`);
          continue;
        }

        const declaredExt = getExtensionFromFileName(mediaFileName) || getExtensionFromMime(mediaType);
        const detectedExt = getExtensionFromMime(contentType);
        const ext = declaredExt || detectedExt || ".bin";
        const name = `${Date.now()}_${i}${ext}`;
        const filePath = path.join(inboundDir, name);
        fs.writeFileSync(filePath, new Uint8Array(buffer));

        mediaPaths.push(filePath);
        log?.info?.(
          `[${accountId}] Saved media ${i + 1}/${mediaUrls.length} to ${filePath} (declared=${mediaType || "-"}, detected=${contentType || "-"})`
        );
      } catch (downloadError) {
        log?.error?.(`[${accountId}] Failed to download media ${i + 1}/${mediaUrls.length}: ${downloadError}`);
        // 下载失败时保留 URL，由 OpenClaw 直接访问
      }
    }
  } catch (error) {
    log?.error?.(`[${accountId}] Failed to download media: ${error}`);
  }

  return { mediaUrls, mediaTypes, mediaPaths };
}

/**
 * 解析相对路径为绝对路径。
 * 相对路径优先解析为 <stateDir>/media/inbound/，其次 <stateDir>/workspace/。
 *
 * @param mediaPath - 媒体路径（可能是相对路径或绝对路径）
 * @returns 解析后的绝对路径
 */
export function resolveMediaPath(mediaPath: string): string {
  if (path.isAbsolute(mediaPath) || mediaPath.startsWith("~")) {
    return mediaPath;
  }

  const runtime = getWechatMiniprogramRuntime();
  const stateDir = runtime.state.resolveStateDir();
  // 与 Telegram 对齐：先尝试 media/inbound，再 workspace
  const inboundDir = path.join(stateDir, MEDIA_INBOUND_DIR);
  const workspaceDir = path.join(stateDir, "workspace");
  const fromInbound = path.resolve(inboundDir, mediaPath);
  if (fs.existsSync(fromInbound)) {
    return fromInbound;
  }
  return path.resolve(workspaceDir, mediaPath);
}
