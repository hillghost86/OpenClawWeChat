/**
 * 消息注入模块
 * 
 * 负责构建消息上下文并注入到 OpenClaw
 */

import { getWechatMiniprogramRuntime } from "./runtime.js";
import { sendReply, ReplyConfig } from "./reply-sender.js";
import { CHANNEL_ID, BRIDGE_URL } from "./constants.js";
import { notifyTyping } from "./typing.js";
import { resolveSession } from "./session.js";

export interface MessageToInject {
  openid: string;
  updateId: number;
  text: string;
  mediaUrls: string[];
  mediaTypes: string[];
  mediaPaths: string[];
  uploadAPIURL?: string;
  chatId?: number; // 群聊时为负整数
  chatType?: "private" | "group";
  /** 是否需要触发回复；false 时仅 recordInboundSession，不调用 dispatchReply */
  needReply?: boolean;
}

export interface InjectConfig {
  accountId: string;
  // bridgeUrl 不再从配置读取，使用代码常量 BRIDGE_URL
  apiKey: string;
}

/**
 * 注入消息到 OpenClaw
 * 
 * @param message - 要注入的消息
 * @param config - 配置信息
 * @param log - 日志函数
 */
export async function injectMessage(
  message: MessageToInject,
  config: InjectConfig,
  log?: { 
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
    info?: (msg: string) => void;
  }
): Promise<void> {
  const runtime = getWechatMiniprogramRuntime();

  // 记录 uploadAPIURL（用于调试）
  if (message.uploadAPIURL) {
    log?.info?.(`[${config.accountId}] Injecting message with upload API URL: ${message.uploadAPIURL}`);
  } else {
    log?.warn?.(`[${config.accountId}] Injecting message without upload API URL (update_id=${message.updateId})`);
  }

  // 使用 runtime.config.loadConfig() 获取完整配置
  const cfg = runtime.config?.loadConfig ? runtime.config.loadConfig() : undefined;

  // 检查 runtime.channel.reply 是否存在
  if (!runtime?.channel?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
    log?.error?.(`[${config.accountId}] dispatchReplyWithBufferedBlockDispatcher not available`);
    throw new Error("dispatchReplyWithBufferedBlockDispatcher not available");
  }

  // 解析 session（使用 sessionKey，默认为 agent:main:main）
  if (!cfg) {
    log?.warn?.(`[${config.accountId}] Config is undefined, cannot resolve session`);
    throw new Error("Config is undefined");
  }

  const sessionResult = resolveSession({
    cfg,
    apiKey: config.apiKey,
    accountId: config.accountId,
    openid: message.openid,
    chatId: message.chatId,
    runtime,
  });

  const sessionKey = sessionResult.sessionKey;
  const mainSessionKey = sessionResult.mainSessionKey;
  const agentId = sessionResult.agentId;
  // 排查 Bot 回复到主 session：记录注入参数
  log?.info?.(`[${config.accountId}] injectMessage: openid=${message.openid}, chatId=${message.chatId}, chatType=${message.chatType}, needReply=${message.needReply}, sessionKey=${sessionKey}`);

  // 解析 store path，用于记录会话
  const storePath = runtime.channel.session.resolveStorePath(
    cfg?.session?.store,
    { agentId }
  );

  // 构建消息体：如果没有文本但有媒体，设置占位符文本
  const hasVideo = message.mediaTypes.some(type => type.startsWith("video/"));
  const hasImage = message.mediaTypes.some(type => type.startsWith("image/"));
  const hasDocument = message.mediaTypes.some(type => !type.startsWith("video/") && !type.startsWith("image/"));
  
  let mediaPlaceholder = "";
  if (hasVideo) {
    mediaPlaceholder = `<media:video>${message.mediaUrls.length > 1 ? ` (${message.mediaUrls.length} videos)` : ""}`;
  } else if (hasImage) {
    mediaPlaceholder = `<media:image>${message.mediaUrls.length > 1 ? ` (${message.mediaUrls.length} images)` : ""}`;
  } else if (hasDocument) {
    mediaPlaceholder = `<media:document>${message.mediaUrls.length > 1 ? ` (${message.mediaUrls.length} documents)` : ""}`;
  }
  
  // 确保 body 非空：部分 LLM API（如 Zai/GLM）会拒绝 content[0].text 为空的消息
  const finalBody =
    message.text?.trim() ||
    (message.mediaUrls.length > 0 ? mediaPlaceholder : "") ||
    " "; // 兜底占位符，避免空字符串

  // 构建完整的 MsgContext（符合 OpenClaw SDK 的消息格式）
  const msgContext = runtime.channel.reply.finalizeInboundContext({
    Body: finalBody,
    BodyForAgent: finalBody,
    RawBody: message.text || finalBody,
    CommandBody: message.text || finalBody,
    BodyForCommands: message.text || finalBody,
    From: `${CHANNEL_ID}:${message.openid}`,
    To: `${CHANNEL_ID}:${message.openid}`,
    SessionKey: sessionKey,
    AccountId: config.accountId,
    MessageSid: String(message.updateId),
    Surface: CHANNEL_ID,
    Provider: CHANNEL_ID,
    ChatType: message.chatType === "group" ? "group" : "direct",
    Timestamp: Date.now(),
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `${CHANNEL_ID}:${message.openid}`,
    CommandSource: "text" as const, // 明确指定这是文本命令，确保 allowTextCommands 返回 true
    CommandAuthorized: true, // 授权命令执行，确保 isAuthorizedSender 为 true
    // 添加媒体信息（如果有）
    // 优先使用本地路径（MediaPaths），如果没有则使用URL（MediaUrls）
    MediaPaths: message.mediaPaths.length > 0 ? message.mediaPaths : undefined,
    MediaUrls: message.mediaUrls.length > 0 ? message.mediaUrls : undefined,
    MediaTypes: message.mediaTypes.length > 0 ? message.mediaTypes : undefined,
    MediaPath: message.mediaPaths.length > 0 ? message.mediaPaths[0] : (message.mediaUrls.length > 0 ? message.mediaUrls[0] : undefined),
    MediaUrl: message.mediaUrls.length > 0 ? message.mediaUrls[0] : undefined,
    MediaType: message.mediaTypes.length > 0 ? message.mediaTypes[0] : undefined,
  });

  // 验证 SessionKey 是否正确设置
  if (msgContext.SessionKey !== sessionKey) {
    log?.warn?.(`[${config.accountId}] SessionKey mismatch: expected=${sessionKey}, actual=${msgContext.SessionKey}`);
  }

  // 在调用 dispatchReplyWithBufferedBlockDispatcher 之前记录消息到会话存储
  if (runtime.channel.session.recordInboundSession && storePath) {
    try {
      const routeSessionKey =
        message.chatId != null && message.chatId < 0
          ? sessionKey // 群聊：保持 per-group session，不要覆盖回主会话
          : (mainSessionKey || sessionKey);
      await runtime.channel.session.recordInboundSession({
        storePath,
        sessionKey: msgContext.SessionKey ?? sessionKey,
        ctx: msgContext,
        updateLastRoute: {
          sessionKey: routeSessionKey,
          channel: CHANNEL_ID,
          to: message.openid,
          accountId: config.accountId,
        },
        onRecordError: (err: unknown) => {
          log?.warn?.(`[${config.accountId}] Failed to record inbound session: ${err}`);
        },
      });
    } catch (recordError) {
      log?.error?.(`[${config.accountId}] Failed to record inbound session: ${recordError}`);
    }
  }

  // need_reply=false：仅写入会话，不触发回复（polling 会在批次末尾 markProcessed）
  if (message.needReply === false) {
    log?.info?.(`[${config.accountId}] need_reply=false, skipping dispatch (update_id=${message.updateId})`);
    return;
  }

  // 构建回复发送配置
  // 从 uploadAPIURL 推断视频和文档上传URL（如果后端没有提供）
  // 后端现在会根据媒体类型提供正确的URL，但为了兼容性，仍然需要推断其他类型的URL
  let uploadVideoAPIURL: string | undefined;
  let uploadDocumentAPIURL: string | undefined;
  
  if (message.uploadAPIURL) {
    // 从后端提供的URL推断其他类型的URL
    // 支持 /sendPhoto, /sendVideo, /sendDocument 三种情况
    if (message.uploadAPIURL.includes('/sendPhoto')) {
      uploadVideoAPIURL = message.uploadAPIURL.replace('/sendPhoto', '/sendVideo');
      uploadDocumentAPIURL = message.uploadAPIURL.replace('/sendPhoto', '/sendDocument');
    } else if (message.uploadAPIURL.includes('/sendVideo')) {
      uploadVideoAPIURL = message.uploadAPIURL; // 已经是视频URL
      uploadDocumentAPIURL = message.uploadAPIURL.replace('/sendVideo', '/sendDocument');
    } else if (message.uploadAPIURL.includes('/sendDocument')) {
      uploadVideoAPIURL = message.uploadAPIURL.replace('/sendDocument', '/sendVideo');
      uploadDocumentAPIURL = message.uploadAPIURL; // 已经是文档URL
    } else {
      // 未知格式，尝试推断
      uploadVideoAPIURL = message.uploadAPIURL.replace(/\/send\w+$/, '/sendVideo');
      uploadDocumentAPIURL = message.uploadAPIURL.replace(/\/send\w+$/, '/sendDocument');
    }
  }
  
  const replyConfig: ReplyConfig = {
    bridgeUrl: BRIDGE_URL, // 使用代码常量，不从配置读取
    apiKey: config.apiKey,
    uploadAPIURL: message.uploadAPIURL,
    uploadVideoAPIURL: uploadVideoAPIURL,
    uploadDocumentAPIURL: uploadDocumentAPIURL,
  };

  // 开始处理前通知「正在输入」，后端通过 WebSocket 推送给小程序（群聊时传 chat_id）
  await notifyTyping(config.apiKey, "start", message.chatId, log);

  // 使用 runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher 注入消息
  // 跟踪已发送的回复数量，第一条回复使用回复ID，后续回复不使用回复ID
  let replyCount = 0;
  await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: msgContext,
    cfg: cfg,
    dispatcherOptions: {
      onReplyStart: async () => {
        // 模型开始生成时再次通知，保持 typing 在长任务期间不消失
        await notifyTyping(config.apiKey, "start", message.chatId, log);
      },
      deliver: async (payload: unknown, info: unknown) => {
        const replyKind =
          info && typeof info === "object" && "kind" in info
            ? (info as { kind?: string }).kind
            : undefined;
        if (replyKind === "final") {
          replyCount++;
          const replyToUpdateId = replyCount === 1 ? message.updateId : undefined;
          const payloadObj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
          const target = message.chatType === "group" && message.chatId != null ? message.chatId : message.openid;
          // 排查 Bot 回复到主 session：记录 sendReply 目标
          log?.info?.(`[${config.accountId}] sendReply: target=${target}, chatType=${message.chatType}, chatId=${message.chatId}, openid=${message.openid}, replyToUpdateId=${replyToUpdateId}`);

          await sendReply(
            {
              text: typeof payloadObj.text === "string" ? payloadObj.text : undefined,
              mediaUrl: typeof payloadObj.mediaUrl === "string" ? payloadObj.mediaUrl : undefined,
              mediaUrls: Array.isArray(payloadObj.mediaUrls) ? (payloadObj.mediaUrls as string[]) : undefined,
              mediaTypes: message.mediaTypes,
            },
            target,
            replyToUpdateId,
            replyConfig,
            config.accountId,
            log
          );
        }
      },
      onError: (err: unknown, info: unknown) => {
        const kind =
          info && typeof info === "object" && "kind" in info
            ? (info as { kind?: string }).kind
            : "unknown";
        log?.error?.(`[${config.accountId}] Reply dispatch error: ${err}, kind=${kind}`);
      },
    },
  });
}
