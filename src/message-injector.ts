/**
 * 消息注入模块
 * 
 * 负责构建消息上下文并注入到 OpenClaw
 */

import { getWechatMiniprogramRuntime } from "./runtime.js";
import { sendReply, ReplyConfig } from "./reply-sender.js";
import { CHANNEL_ID, BRIDGE_URL } from "./constants.js";

export interface MessageToInject {
  openid: string;
  updateId: number;
  text: string;
  mediaUrls: string[];
  mediaTypes: string[];
  mediaPaths: string[];
  uploadAPIURL?: string;
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

  // 先解析 agent route 以获取正确的 sessionKey
  if (!cfg) {
    log?.warn?.(`[${config.accountId}] Config is undefined, cannot resolve route`);
    throw new Error("Config is undefined");
  }

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg: cfg,
    channel: CHANNEL_ID,
    accountId: config.accountId,
    peer: {
      kind: "dm",
      id: message.openid,
    },
  });

  // 使用 resolveAgentRoute 返回的 sessionKey（根据配置的 dmScope 自动构建）
  const sessionKey = route.sessionKey;

  // 解析 store path，用于记录会话
  const storePath = runtime.channel.session.resolveStorePath(
    cfg?.session?.store,
    { agentId: route.agentId }
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
  
  const finalBody = message.text || (message.mediaUrls.length > 0 ? mediaPlaceholder : "");

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
    ChatType: "direct",
    Timestamp: Date.now(),
    OriginatingChannel: CHANNEL_ID as const,
    OriginatingTo: `${CHANNEL_ID}:${message.openid}`,
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
      await runtime.channel.session.recordInboundSession({
        storePath,
        sessionKey: msgContext.SessionKey ?? sessionKey,
        ctx: msgContext,
        updateLastRoute: {
          sessionKey: route.mainSessionKey || sessionKey,
          channel: CHANNEL_ID,
          to: message.openid,
          accountId: config.accountId,
        },
        onRecordError: (err) => {
          log?.warn?.(`[${config.accountId}] Failed to record inbound session: ${err}`);
        },
      });
    } catch (recordError) {
      log?.error?.(`[${config.accountId}] Failed to record inbound session: ${recordError}`);
    }
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

  // 使用 runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher 注入消息
  // 跟踪已发送的回复数量，第一条回复使用回复ID，后续回复不使用回复ID
  let replyCount = 0;
  await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: msgContext,
    cfg: cfg,
    dispatcherOptions: {
      deliver: async (payload, info) => {
        // 当 AI 生成回复时，这个回调会被调用
        if (info.kind === "final") {
          replyCount++;
          // 第一条回复使用 updateId 作为回复ID，后续回复不使用回复ID（作为独立消息发送）
          const replyToUpdateId = replyCount === 1 ? message.updateId : undefined;
          
          // 传递媒体类型信息，以便 sendReply 判断是图片还是视频
          await sendReply(
            {
              ...payload,
              mediaTypes: message.mediaTypes, // 传递媒体类型
            },
            message.openid,
            replyToUpdateId,
            replyConfig,
            config.accountId,
            log
          );
        }
      },
      onError: (err, info) => {
        log?.error?.(`[${config.accountId}] Reply dispatch error: ${err}, kind=${info.kind}`);
      },
    },
  });
}
