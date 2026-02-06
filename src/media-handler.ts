/**
 * 媒体处理模块
 * 
 * 负责媒体下载和路径解析
 */

import { getWechatMiniprogramRuntime } from "./runtime.js";
import path from "node:path";

export interface MediaInfo {
  mediaUrls: string[];
  mediaTypes: string[];
  mediaPaths: string[];
}

/**
 * 下载媒体到本地
 * 
 * @param mediaUrls - 媒体 URL 数组
 * @param mediaTypes - 媒体类型数组
 * @param accountId - 账户 ID（用于日志）
 * @param log - 日志函数
 * @returns 媒体信息（包含下载后的本地路径）
 */
export async function downloadMedia(
  mediaUrls: string[],
  mediaTypes: string[],
  accountId: string,
  log?: { error?: (msg: string) => void }
): Promise<MediaInfo> {
  const mediaPaths: string[] = [];

  if (mediaUrls.length === 0) {
    return { mediaUrls, mediaTypes, mediaPaths };
  }

  try {
    const runtime = getWechatMiniprogramRuntime();
    const maxBytes = 10 * 1024 * 1024; // 10MB限制

    for (let i = 0; i < mediaUrls.length; i++) {
      const mediaUrl = mediaUrls[i];
      const mediaType = mediaTypes[i] || "image/jpeg";

      try {
        // 使用 runtime.channel.media.fetchRemoteMedia 下载媒体
        const fetched = await runtime.channel.media.fetchRemoteMedia({ url: mediaUrl });

        // 使用 runtime.channel.media.saveMediaBuffer 保存到本地
        const saved = await runtime.channel.media.saveMediaBuffer(
          fetched.buffer,
          fetched.contentType || mediaType,
          "inbound",
          maxBytes,
        );

        mediaPaths.push(saved.path);
      } catch (downloadError) {
        log?.error?.(`[${accountId}] Failed to download media ${i + 1}/${mediaUrls.length}: ${downloadError}`);
        // 如果下载失败，仍然保留URL，让OpenClaw尝试直接访问
      }
    }
  } catch (error) {
    log?.error?.(`[${accountId}] Failed to download media: ${error}`);
  }

  return { mediaUrls, mediaTypes, mediaPaths };
}

/**
 * 解析相对路径为绝对路径（相对于 workspace 目录）
 * 
 * @param mediaPath - 媒体路径（可能是相对路径或绝对路径）
 * @returns 解析后的绝对路径
 */
export function resolveMediaPath(mediaPath: string): string {
  // 如果已经是绝对路径或 ~ 开头，直接返回
  if (path.isAbsolute(mediaPath) || mediaPath.startsWith('~')) {
    return mediaPath;
  }

  // 解析为相对于 workspace 目录的绝对路径
  const runtime = getWechatMiniprogramRuntime();
  const stateDir = runtime.state.resolveStateDir();
  const workspaceDir = path.join(stateDir, 'workspace');
  return path.resolve(workspaceDir, mediaPath);
}
