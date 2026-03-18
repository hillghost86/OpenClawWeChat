/**
 * 消息解析模块
 * 
 * 负责从 Telegram Bot API 兼容格式的 update 中提取消息内容
 */

export type ChatType = "private" | "group";

export interface ParsedMessage {
  openid: string;
  updateId: number;
  text: string;
  mediaUrls: string[];
  mediaTypes: string[];
  mediaFileNames?: string[];
  uploadAPIURL?: string;
  isVideo?: boolean; // 标记是否为视频
  isDocument?: boolean; // 标记是否为文档
  isVoice?: boolean; // 标记是否为语音消息（message.voice，与 document 互斥）
  chatId?: number; // 群聊时为负整数，私聊为 undefined
  chatType?: ChatType; // private | group
  /** 是否需要触发回复；need_reply=false 时仅写入会话历史，不调用 LLM */
  needReply?: boolean;
}

/**
 * 解析 Telegram 格式的 update 消息
 * 
 * @param update - Telegram Bot API 兼容格式的 update 对象
 * @param accountId - 账户 ID（用于日志）
 * @param log - 日志函数
 * @returns 解析后的消息对象，如果消息无效则返回 null
 */
export function parseTelegramUpdate(
  update: any,
  accountId: string,
  log?: { info?: (msg: string) => void; warn?: (msg: string) => void }
): ParsedMessage | null {
  if (!update.message) {
    return null;
  }

  // 提取 openid：优先 open_id（阶段一新增），兼容旧后端 username/id
  const openid = (update.message.from as any)?.open_id ?? update.message.from?.username ?? update.message.from?.id?.toString();
  if (!openid) {
    log?.warn?.(`[${accountId}] Skipping message without openid: update_id=${update.update_id}`);
    return null;
  }

  const updateId = update.update_id;
  const chat = update.message.chat;
  const uploadAPIURL = (chat as any)?.upload_api_url;
  // 解析 chatId、chatType：私聊 chat.id 通常为正或不存在，群聊为负整数
  let chatId: number | undefined;
  let chatType: "private" | "group" | undefined;
  if (chat && typeof (chat as any).id === "number") {
    const cid = (chat as any).id;
    if (cid < 0) {
      chatId = cid;
      chatType = ((chat as any).type === "supergroup") ? "group" : "group";
    } else {
      chatType = "private";
    }
  } else {
    chatType = "private";
  }
  // 排查 Bot 回复到主 session：记录 chat 解析结果
  log?.info?.(`[${accountId}] parseTelegramUpdate: update_id=${updateId}, chat.id=${(chat as any)?.id}, chat.type=${(chat as any)?.type}, chatId=${chatId}, chatType=${chatType}, from.is_bot=${(update.message.from as any)?.is_bot}, need_reply=${(update.message as any).need_reply}`);
  
  // 调试：记录是否获取到 upload_api_url
  if (!uploadAPIURL) {
    log?.warn?.(`[${accountId}] No upload_api_url found in chat object for update_id=${updateId}, chat=${JSON.stringify(update.message.chat)}`);
  }

  // 提取媒体信息
  const mediaUrls: string[] = [];
  const mediaTypes: string[] = [];
  const mediaFileNames: string[] = [];

  const inferMimeTypeFromFileName = (fileName?: string): string | undefined => {
    if (!fileName) return undefined;
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".mp3")) return "audio/mpeg";
    if (lower.endsWith(".m4a")) return "audio/mp4";
    if (lower.endsWith(".aac")) return "audio/aac";
    if (lower.endsWith(".ogg")) return "audio/ogg";
    if (lower.endsWith(".wav")) return "audio/wav";
    if (lower.endsWith(".webm")) return "audio/webm";
    if (lower.endsWith(".mp4")) return "video/mp4";
    return undefined;
  };

  // 检测视频消息（优先从 video 字段提取）
  if (update.message.video) {
    const video = update.message.video;
    if (video.file_id) {
      mediaUrls.push(video.file_id);
      mediaTypes.push(video.mime_type || "video/mp4");
    }
  }
  // 检测图片消息（优先从 photo 字段提取）
  else if (update.message.photo && Array.isArray(update.message.photo) && update.message.photo.length > 0) {
    // Telegram 格式：photo 是一个数组，取最大尺寸的图片
    const largestPhoto = update.message.photo[update.message.photo.length - 1];
    if (largestPhoto.file_id) {
      // file_id 在后端实现中是访问 URL（CDN URL）
      mediaUrls.push(largestPhoto.file_id);
      mediaTypes.push("image/jpeg"); // 默认 JPEG，实际类型可能不同
    }
  }
  // 检测语音消息（message.voice，与 document 互斥）
  else if (update.message.voice) {
    const voice = update.message.voice;
    if (voice.file_id) {
      mediaUrls.push(voice.file_id);
      mediaTypes.push(voice.mime_type || inferMimeTypeFromFileName(voice.file_name) || "audio/mpeg");
      mediaFileNames.push(voice.file_name || "");
    }
  } else if (update.message.document) {
    // 检测文档消息（包括图片、视频和其他文档）
    const doc = update.message.document;
    const mimeType = doc.mime_type || "";

    if (doc.file_id) {
      // 所有文档类型都添加到媒体列表
      mediaUrls.push(doc.file_id);
      mediaTypes.push(mimeType || "application/octet-stream");
      mediaFileNames.push(doc.file_name || "");
    }
  }

  // 提取文本消息：优先使用 text，如果没有则使用 caption
  // 但如果 caption 中包含媒体 URL（与 mediaUrls 中的 URL 相同），则忽略 caption 中的 URL
  let messageText = update.message.text || '';
  let captionText = update.message.caption || '';

  // 如果 caption 中包含媒体 URL，移除它（因为媒体 URL 已经在 MediaUrls 中了）
  if (captionText && mediaUrls.length > 0) {
    for (const mediaUrl of mediaUrls) {
      // 移除 caption 中的媒体 URL（可能是完整 URL 或部分 URL）
      if (captionText.includes(mediaUrl)) {
        captionText = captionText.replace(mediaUrl, '').trim();
        // 如果 caption 只剩下换行符或空字符串，清空它
        if (captionText === '\n' || captionText === '') {
          captionText = '';
        }
      }
    }
  }

  // 移除 caption 中的 upload_api_url 标记（这是后端添加的回传地址信息，不应该出现在用户消息中）
  if (captionText) {
    // 移除 [upload_api_url: ...] 格式的内容
    captionText = captionText.replace(/\[upload_api_url:\s*[^\]]+\]/gi, '').trim();
    // 清理多余的换行符
    captionText = captionText.replace(/\n+/g, '\n').trim();
    if (captionText === '\n' || captionText === '') {
      captionText = '';
    }
  }

  // 合并 text 和清理后的 caption
  messageText = messageText || captionText;

  // 判断媒体类型
  const isVoice = !!(update.message.voice && update.message.voice.file_id);
  const isVideo = mediaTypes.some(type => type.startsWith("video/"));
  const isImage = mediaTypes.some(type => type.startsWith("image/"));
  const isDocument = mediaTypes.length > 0 && !isVideo && !isImage && !isVoice; // 非图片/视频/语音的文档

  // need_reply：Bridge 返回，缺省为 true（兼容旧版、私聊恒为 true）
  const needReply = update.message.need_reply !== false;

  return {
    openid,
    updateId,
    text: messageText,
    mediaUrls,
    mediaTypes,
    mediaFileNames,
    uploadAPIURL,
    isVideo,
    isDocument,
    isVoice,
    chatId,
    chatType,
    needReply,
  };
}
