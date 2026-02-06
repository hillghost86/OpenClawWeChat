/**
 * 回复发送模块
 * 
 * 负责将 OpenClaw 生成的回复发送回用户
 */

import { getWechatMiniprogramRuntime } from "./runtime.js";
import { resolveMediaPath } from "./media-handler.js";
import { BRIDGE_URL } from "./constants.js";
import path from "node:path";

export interface ReplyConfig {
  // bridgeUrl 字段保留用于兼容性，但实际使用 BRIDGE_URL 常量
  bridgeUrl?: string; // 可选，实际使用 BRIDGE_URL 常量
  apiKey: string;
  uploadAPIURL?: string;
  uploadVideoAPIURL?: string; // 视频上传API URL
  uploadDocumentAPIURL?: string; // 文档上传API URL
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
export async function sendReply(
  payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string; mediaTypes?: string[] },
  openid: string,
  updateId: number | undefined,
  config: ReplyConfig,
  accountId: string,
  log?: { error?: (msg: string) => void }
): Promise<void> {
  const { apiKey, uploadAPIURL, uploadVideoAPIURL } = config;
  // bridgeUrl 使用代码常量，不从配置读取

  if (!apiKey) {
    throw new Error("API Key not configured");
  }

  const mediaUrls = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
  const mediaTypes = payload.mediaTypes || [];
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

        // 判断媒体类型
        const isVideo = mediaType.startsWith("video/");
        const isImage = mediaType.startsWith("image/");
        const isDocument = !isVideo && !isImage; // 非图片/视频的文档

        await sendMedia(mediaSource, caption, openid, updateId, config, accountId, isVideo, isDocument, log);
      }
    }

    // 如果有文本但没有媒体，或者文本太长需要单独发送
    if (text && (mediaUrls.length === 0 || text.length > 1024)) {
      await sendText(text, openid, updateId, config, accountId, log);
    }
  } catch (sendError) {
    log?.error?.(`[${accountId}] Failed to send reply: ${sendError}`);
    throw sendError;
  }
}

/**
 * 发送媒体消息（图片、视频或文档）
 */
async function sendMedia(
  mediaSource: string,
  caption: string,
  openid: string,
  updateId: number | undefined,
  config: ReplyConfig,
  accountId: string,
  isVideo: boolean,
  isDocument: boolean,
  log?: { error?: (msg: string) => void }
): Promise<void> {
  const { apiKey, uploadAPIURL, uploadVideoAPIURL, uploadDocumentAPIURL } = config;
  // bridgeUrl 使用代码常量，不从配置读取

  // 检查是否是本地路径（不是http://或https://开头）
  const isLocalPath = !mediaSource.startsWith('http://') && !mediaSource.startsWith('https://');

  // 构建API URL（优先使用后端提供的URL）
  // 如果使用配置构建，确保API Key中的冒号被URL编码
  const encodedAPIKey = apiKey.replace(/:/g, '%3A');
  let sendMediaURL: string;
  let fieldName: string;
  let defaultFileName: string;
  
  if (isVideo) {
    sendMediaURL = uploadVideoAPIURL || `${BRIDGE_URL}/bot${encodedAPIKey}/sendVideo`;
    fieldName = "video";
    defaultFileName = "video.mp4";
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

    // 手动构建multipart/form-data请求体
    const boundary = `----formdata-openclaw-${Date.now()}`;
    const parts: Uint8Array[] = [];
    const encoder = new TextEncoder();

    // 添加媒体字段（photo、video 或 document）
    const contentType = media.contentType || 
      (isVideo ? 'video/mp4' : isDocument ? 'application/octet-stream' : 'image/jpeg');
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="${fieldName}"; filename="${defaultFileName}"\r\n`));
    parts.push(encoder.encode(`Content-Type: ${contentType}\r\n\r\n`));
    parts.push(media.buffer);
    parts.push(encoder.encode(`\r\n`));

    // 添加chat_id字段
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="chat_id"\r\n\r\n`));
    parts.push(encoder.encode(openid));
    parts.push(encoder.encode(`\r\n`));

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
      chat_id: openid, // 使用 openid 作为 chat_id
      caption: caption || undefined,
      reply_to_message_id: updateId ? parseInt(String(updateId)) : undefined,
    };
    
    if (isVideo) {
      jsonBody.video = mediaSource; // 视频URL，后端会下载并上传到US3
    } else if (isDocument) {
      jsonBody.document = mediaSource; // 文档URL，后端会下载并上传到US3
    } else {
      jsonBody.photo = mediaSource; // 图片URL，后端会下载并上传到US3
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
    const mediaTypeName = isVideo ? 'video' : isDocument ? 'document' : 'photo';
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
  openid: string,
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
      chat_id: openid, // 使用 openid 作为 chat_id
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
