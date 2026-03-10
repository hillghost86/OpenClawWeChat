/**
 * 回复发送模块
 * 
 * 负责将 OpenClaw 生成的回复发送回用户
 */

import { getWechatMiniprogramRuntime } from "./runtime.js";
import { resolveMediaPath } from "./media-handler.js";
import { BRIDGE_URL } from "./constants.js";
import path from "node:path";

/**
 * MP3 按常见码率估算时长（秒）。OpenClaw 未传 mediaDurations 时用此值落库。
 * 约 96kbps，且至少 1 秒。
 */
function estimateMp3DurationSeconds(byteLength: number): number {
  const bytesPerSec = 12 * 1024;
  return Math.max(1, Math.round(byteLength / bytesPerSec));
}

/**
 * 从音频 buffer 估算时长（秒）。仅支持 MP3 按大小估算；其他格式返回 undefined。
 */
function getAudioDurationFromBuffer(
  buffer: Uint8Array | ArrayBuffer,
  mimeType?: string
): number | undefined {
  const mime = (mimeType || "").toLowerCase();
  if (!mime.includes("mpeg") && !mime.includes("mp3")) return undefined;
  const byteLength = buffer instanceof ArrayBuffer ? buffer.byteLength : buffer.byteLength;
  return estimateMp3DurationSeconds(byteLength);
}

export interface ReplyConfig {
  bridgeUrl?: string;
  apiKey: string;
  uploadAPIURL?: string;
  uploadVideoAPIURL?: string;
  uploadDocumentAPIURL?: string;
  uploadVoiceAPIURL?: string; // 语音消息上传 API URL（sendVoice）
}

/**
 * 发送回复（媒体和文本）
 * 
 * @param payload - OpenClaw 生成的回复负载
 * @param openid - 用户 openid
 * @param updateId - 原始消息的 update_id（用于回复）
 * @param config - 配置信息
 * @param accountId - 账户 ID（用于日志）
 * @param log - 日志函数
 */
/** 回复目标：私聊为 openid 字符串，群聊为 chat_id 负整数 */
type ReplyTarget = string | number;

export async function sendReply(
  payload: {
    text?: string;
    mediaUrls?: string[];
    mediaUrl?: string;
    mediaTypes?: string[];
    mediaNames?: string[];
    /** 媒体时长（秒），与 mediaUrls 一一对应；语音/音频会传给后端落库 */
    mediaDurations?: number[];
  },
  target: ReplyTarget, // openid (私聊) 或 chat_id (群聊负整数)
  updateId: number | undefined,
  config: ReplyConfig,
  accountId: string,
  log?: { error?: (msg: string) => void }
): Promise<void> {
  const { apiKey, uploadAPIURL, uploadVideoAPIURL, uploadVoiceAPIURL } = config;
  // bridgeUrl 使用代码常量，不从配置读取

  if (!apiKey) {
    throw new Error("API Key not configured");
  }

  const mediaUrls = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
  const mediaTypes = payload.mediaTypes || [];
  const mediaNames = payload.mediaNames;
  const mediaDurations = payload.mediaDurations || [];
  const text = payload.text ?? "";

  try {
    // 如果有媒体，先发送媒体（第一张图片/视频的caption包含文本）
    if (mediaUrls.length > 0) {
      let first = true;
      for (let i = 0; i < mediaUrls.length; i++) {
        const mediaSource = mediaUrls[i];
        const mediaType = mediaTypes[i] || "";
        const caption = first ? text : ""; // 第一个媒体带caption，其他不带
        first = false;

        const isVideo = mediaType.startsWith("video/");
        const isImage = mediaType.startsWith("image/");
        const isVoice = mediaType.startsWith("audio/"); // 语音（含 TTS）走 sendVoice
        const isDocument = !isVideo && !isImage && !isVoice;

        const suggestedFileName = mediaNames?.[i];
        const durationSeconds = mediaDurations[i] != null ? Math.max(0, Math.round(mediaDurations[i])) : undefined;
        await sendMedia(mediaSource, caption, target, updateId, config, accountId, isVideo, isDocument, isVoice, suggestedFileName, durationSeconds, log);
      }
    }

    // 如果有文本但没有媒体，或者文本太长需要单独发送
    if (text && (mediaUrls.length === 0 || text.length > 1024)) {
      await sendText(text, target, updateId, config, accountId, log);
    }
  } catch (sendError) {
    log?.error?.(`[${accountId}] Failed to send reply: ${sendError}`);
    throw sendError;
  }
}

/** 清洗文件名：去路径、长度限制，避免注入与过长 */
function sanitizeFileName(name: string, maxLen = 200): string {
  let s = name.replace(/\\/g, "_").replace(/\//g, "_").replace(/\.\./g, "_").trim();
  if (s.length > maxLen) s = s.slice(-maxLen);
  return s || "document";
}

/** 根据 MIME 推断音频扩展名 */
function getAudioExt(contentType: string): string {
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("aac")) return "aac";
  return "mp3";
}

/** 根据 MIME 推断图片扩展名 */
function getImageExt(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

/** 根据 MIME 推断视频扩展名 */
function getVideoExt(contentType: string): string {
  if (contentType.includes("quicktime") || contentType.includes("mov")) return "mov";
  if (contentType.includes("webm")) return "webm";
  return "mp4";
}

/** 常见音频扩展名（小写），用于 URL/文件名兜底推断，避免误走 sendDocument 导致 media_type=document */
const AUDIO_EXTENSIONS = new Set([
  "mp3", "m4a", "wav", "ogg", "aac", "weba", "opus", "flac",
]);

function looksLikeAudioFileNameOrUrl(nameOrUrl: string): boolean {
  const s = (nameOrUrl || "").trim().toLowerCase();
  if (!s) return false;
  const ext = s.includes(".") ? s.slice(s.lastIndexOf(".") + 1).split(/[?#]/)[0] : "";
  return AUDIO_EXTENSIONS.has(ext);
}

/**
 * 发送媒体消息（图片、视频或文档）
 */
async function sendMedia(
  mediaSource: string,
  caption: string,
  target: string | number,
  updateId: number | undefined,
  config: ReplyConfig,
  accountId: string,
  isVideo: boolean,
  isDocument: boolean,
  isVoice: boolean,
  suggestedFileName: string | undefined,
  durationSeconds: number | undefined, // 语音/音频时长（秒），供后端落库
  log?: { error?: (msg: string) => void }
): Promise<void> {
  const { apiKey, uploadAPIURL, uploadVideoAPIURL, uploadDocumentAPIURL, uploadVoiceAPIURL } = config;

  // 兜底：payload 未传 mediaTypes 或标错时，按文件名/URL 推断为音频则走 sendVoice，避免落库为 document
  if (isDocument && !isVoice && (looksLikeAudioFileNameOrUrl(suggestedFileName ?? "") || looksLikeAudioFileNameOrUrl(mediaSource))) {
    isDocument = false;
    isVoice = true;
  }

  const isLocalPath = !mediaSource.startsWith('http://') && !mediaSource.startsWith('https://');
  const encodedAPIKey = apiKey.replace(/:/g, '%3A');
  let sendMediaURL: string;
  let fieldName: string;
  let defaultFileName: string;

  if (isVideo) {
    sendMediaURL = uploadVideoAPIURL || `${BRIDGE_URL}/bot${encodedAPIKey}/sendVideo`;
    fieldName = "video";
    defaultFileName = "video.mp4";
  } else if (isVoice) {
    sendMediaURL = uploadVoiceAPIURL || `${BRIDGE_URL}/bot${encodedAPIKey}/sendVoice`;
    fieldName = "voice";
    const ts = Math.floor(Date.now() / 1000);
    defaultFileName = `voice_${ts}.${getAudioExt("audio/mpeg")}`;
  } else if (isDocument) {
    sendMediaURL = uploadDocumentAPIURL || `${BRIDGE_URL}/bot${encodedAPIKey}/sendDocument`;
    fieldName = "document";
    defaultFileName = "document";
  } else {
    sendMediaURL = uploadAPIURL || `${BRIDGE_URL}/bot${encodedAPIKey}/sendPhoto`;
    fieldName = "photo";
    defaultFileName = "image.jpg";
  }

  let response: Response;

  if (isLocalPath) {
    // 本地路径：使用multipart/form-data上传
    const runtime = getWechatMiniprogramRuntime();

    // 解析相对路径为绝对路径（相对于workspace目录）
    const resolvedMediaPath = resolveMediaPath(mediaSource);

    // 使用loadWebMedia加载本地文件
    const media = await runtime.media.loadWebMedia(resolvedMediaPath);

    // 兜底：本地文件按实际 mime_type 纠正端口（payload 未标明或标错时，图片/视频/语音走对应接口，其余如 PDF、压缩包仍走 document）
    const fileMime = (media.contentType || "").trim().toLowerCase();
    if (isDocument && fileMime) {
      if (fileMime.indexOf("image/") === 0) {
        isDocument = false;
        isVideo = false;
        isVoice = false;
        sendMediaURL = uploadAPIURL || `${BRIDGE_URL}/bot${encodedAPIKey}/sendPhoto`;
        fieldName = "photo";
        defaultFileName = `image_${Math.floor(Date.now() / 1000)}.${getImageExt(media.contentType)}`;
      } else if (fileMime.indexOf("video/") === 0) {
        isDocument = false;
        isVoice = false;
        isVideo = true;
        sendMediaURL = uploadVideoAPIURL || `${BRIDGE_URL}/bot${encodedAPIKey}/sendVideo`;
        fieldName = "video";
        defaultFileName = `video_${Math.floor(Date.now() / 1000)}.${getVideoExt(media.contentType)}`;
      } else if (fileMime.indexOf("audio/") === 0) {
        isDocument = false;
        isVoice = true;
        sendMediaURL = uploadVoiceAPIURL || `${BRIDGE_URL}/bot${encodedAPIKey}/sendVoice`;
        fieldName = "voice";
        defaultFileName = `voice_${Math.floor(Date.now() / 1000)}.${getAudioExt(media.contentType)}`;
      }
      // 其他（application/pdf、application/zip 等）保持 document
    }

    // 真实 Content-Type（P0-3）；后端据此推断 media_type
    const contentType = media.contentType ||
      (isVideo ? 'video/mp4' : isDocument ? 'application/octet-stream' : 'image/jpeg');

    let fileName = defaultFileName;
    const trimmedSuggested = (suggestedFileName ?? "").trim();
    if (trimmedSuggested && trimmedSuggested.toLowerCase() !== "document") {
      fileName = sanitizeFileName(trimmedSuggested);
    } else if ((isVoice || (isDocument && media.contentType?.startsWith("audio/"))) && media.contentType) {
      const ts = Math.floor(Date.now() / 1000);
      const ext = getAudioExt(media.contentType);
      fileName = `voice_${ts}.${ext}`;
    }

    // 手动构建multipart/form-data请求体
    const boundary = `----formdata-openclaw-${Date.now()}`;
    const parts: Uint8Array[] = [];
    const encoder = new TextEncoder();

    // 添加媒体字段（photo、video 或 document）
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n`));
    parts.push(encoder.encode(`Content-Type: ${contentType}\r\n\r\n`));
    parts.push(media.buffer);
    parts.push(encoder.encode(`\r\n`));

    // 添加chat_id字段（支持 openid 或群 chat_id）
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="chat_id"\r\n\r\n`));
    parts.push(encoder.encode(String(target)));
    parts.push(encoder.encode(`\r\n`));

    // 添加 file_size 字段，供后端落库（不依赖 len(fileData)）
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="file_size"\r\n\r\n`));
    parts.push(encoder.encode(String(media.buffer.byteLength)));
    parts.push(encoder.encode(`\r\n`));

    // 语音/音频：优先用 payload 的 mediaDurations，否则按 MP3 大小估算时长
    let effectiveDuration: number | undefined =
      durationSeconds != null && durationSeconds >= 0 ? durationSeconds : undefined;
    if (isVoice && effectiveDuration == null) {
      effectiveDuration = getAudioDurationFromBuffer(media.buffer, media.contentType);
    }
    let documentDuration: number | undefined =
      durationSeconds != null && durationSeconds >= 0 ? durationSeconds : undefined;
    if (isDocument && documentDuration == null && (media.contentType || "").toLowerCase().startsWith("audio/")) {
      documentDuration = getAudioDurationFromBuffer(media.buffer, media.contentType);
    }
    if (isVoice && effectiveDuration != null && effectiveDuration >= 0) {
      parts.push(encoder.encode(`--${boundary}\r\n`));
      parts.push(encoder.encode(`Content-Disposition: form-data; name="duration"\r\n\r\n`));
      parts.push(encoder.encode(String(effectiveDuration)));
      parts.push(encoder.encode(`\r\n`));
    }
    // document 若为音频（含从 buffer 解析的时长）也传 duration，供后端落库
    if (isDocument && documentDuration != null && documentDuration >= 0) {
      parts.push(encoder.encode(`--${boundary}\r\n`));
      parts.push(encoder.encode(`Content-Disposition: form-data; name="duration"\r\n\r\n`));
      parts.push(encoder.encode(String(documentDuration)));
      parts.push(encoder.encode(`\r\n`));
    }

    // 添加caption字段（如果有）
    if (caption) {
      parts.push(encoder.encode(`--${boundary}\r\n`));
      parts.push(encoder.encode(`Content-Disposition: form-data; name="caption"\r\n\r\n`));
      parts.push(encoder.encode(caption));
      parts.push(encoder.encode(`\r\n`));
    }

    // 添加reply_to_message_id字段（如果有）
    if (updateId) {
      parts.push(encoder.encode(`--${boundary}\r\n`));
      parts.push(encoder.encode(`Content-Disposition: form-data; name="reply_to_message_id"\r\n\r\n`));
      parts.push(encoder.encode(String(parseInt(String(updateId)))));
      parts.push(encoder.encode(`\r\n`));
    }

    // 结束boundary
    parts.push(encoder.encode(`--${boundary}--\r\n`));

    // 合并所有部分
    const totalLength = parts.reduce((acc, part) => acc + part.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.length;
    }

    response = await fetch(sendMediaURL, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: body,
    });
  } else {
    // URL：使用JSON格式，后端会下载
    const jsonBody: any = {
      chat_id: target, // openid 或群 chat_id
      caption: caption || undefined,
      reply_to_message_id: updateId ? parseInt(String(updateId)) : undefined,
    };
    if ((isVoice || isDocument) && durationSeconds != null && durationSeconds >= 0) {
      jsonBody.duration = durationSeconds;
    }
    if (isVideo) {
      jsonBody.video = mediaSource;
    } else if (isVoice) {
      jsonBody.voice = mediaSource;
    } else if (isDocument) {
      jsonBody.document = mediaSource;
    } else {
      jsonBody.photo = mediaSource;
    }
    
    response = await fetch(sendMediaURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jsonBody),
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    const mediaTypeName = isVideo ? 'video' : isVoice ? 'voice' : isDocument ? 'document' : 'photo';
    throw new Error(`Failed to send ${mediaTypeName}: ${response.status} ${response.statusText}, body=${errorText}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`API error: ${data.description || 'Unknown error'}`);
  }
}

/**
 * 发送文本消息
 */
async function sendText(
  text: string,
  target: string | number,
  updateId: number | undefined,
  config: ReplyConfig,
  accountId: string,
  log?: { error?: (msg: string) => void }
): Promise<void> {
  const { apiKey } = config;

  // 构建sendMessage API URL（使用BRIDGE_URL常量和apiKey）
  // 确保API Key中的冒号被URL编码（后端路由会解码）
  const encodedAPIKey = apiKey.replace(/:/g, '%3A');
  const sendMessageURL = `${BRIDGE_URL}/bot${encodedAPIKey}/sendMessage`;

  const response = await fetch(sendMessageURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: target, // openid 或群 chat_id
      text: text,
      reply_to_message_id: updateId ? parseInt(String(updateId)) : undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`API error: ${data.description || 'Unknown error'}`);
  }
}
