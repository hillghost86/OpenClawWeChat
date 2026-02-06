/**
 * 消息解析模块
 * 
 * 负责从 Telegram Bot API 兼容格式的 update 中提取消息内容
 */

export interface ParsedMessage {
  openid: string;
  updateId: number;
  text: string;
  mediaUrls: string[];
  mediaTypes: string[];
  uploadAPIURL?: string;
  isVideo?: boolean; // 标记是否为视频
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
  log?: { warn?: (msg: string) => void }
): ParsedMessage | null {
  if (!update.message) {
    return null;
  }

  // 提取 openid
  const openid = update.message.from?.username || update.message.from?.id?.toString();
  if (!openid) {
    log?.warn?.(`[${accountId}] Skipping message without openid: update_id=${update.update_id}`);
    return null;
  }

  const updateId = update.update_id;
  const uploadAPIURL = (update.message.chat as any)?.upload_api_url;
  
  // 调试：记录是否获取到 upload_api_url
  if (!uploadAPIURL) {
    log?.warn?.(`[${accountId}] No upload_api_url found in chat object for update_id=${updateId}, chat=${JSON.stringify(update.message.chat)}`);
  }

  // 提取媒体信息
  const mediaUrls: string[] = [];
  const mediaTypes: string[] = [];

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
  } else if (update.message.document) {
    // 检测文档消息（包括图片、视频和其他文档）
    const doc = update.message.document;
    const mimeType = doc.mime_type || "";

    if (doc.file_id) {
      // 所有文档类型都添加到媒体列表
      mediaUrls.push(doc.file_id);
      mediaTypes.push(mimeType || "application/octet-stream");
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
  const isVideo = mediaTypes.some(type => type.startsWith("video/"));
  const isImage = mediaTypes.some(type => type.startsWith("image/"));
  const isDocument = mediaTypes.length > 0 && !isVideo && !isImage; // 非图片/视频的文档

  return {
    openid,
    updateId,
    text: messageText,
    mediaUrls,
    mediaTypes,
    uploadAPIURL,
    isVideo,
    isDocument,
  };
}
