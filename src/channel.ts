/**
 * Channel Plugin 实现
 * 
 * 这是 Channel Plugin 的核心实现，包括：
 * - 配置管理
 * - 消息接收（inbound）
 * - 消息发送（outbound）
 * - 状态管理
 * - Gateway 集成
 */

import type {
  ChannelPlugin,
  ChannelConfig,
  ChannelInbound,
  ChannelOutbound,
  ChannelStatus,
  ChannelGateway,
  ChannelMeta,
} from "openclaw/plugin-sdk";
import { resolveMediaPath } from "./media-handler.js";
import { getWechatMiniprogramRuntime } from "./runtime.js";
import { startPollingService } from "./polling.js";
import { PLUGIN_ID, CHANNEL_ID, BRIDGE_URL } from "./constants.js";
import { getPluginConfig, isConfigValid, type PluginConfig } from "./config.js";

// ==================== 类型定义 ====================

/**
 * 账户配置类型
 */
interface WeChatMiniprogramAccount {
  accountId: string;
  enabled: boolean;
  config: {
    // bridgeUrl 不再从配置读取，使用代码常量 BRIDGE_URL
    apiKey?: string;
    pollIntervalMs?: number;
    sessionKeyPrefix?: string;
    debug?: boolean;
  };
}

/**
 * 账户 Probe 类型（用于状态检查）
 */
interface WeChatMiniprogramProbe {
  ok: boolean;
  // 添加你的 Probe 字段
}

// ==================== Meta 配置 ====================

const meta: ChannelMeta = {
  label: "OpenClawWeChat",
  selectionLabel: "OpenClawWeChat",
  blurb: "Bridge for OpenClaw to WeChat MiniProgram via HTTP polling",
};

// ==================== Capabilities 配置 ====================

const capabilities = {
  chatTypes: ["direct"],
  reactions: false,
  threads: false,
  media: true,
  nativeCommands: false,
  blockStreaming: true,
};

// ==================== Messaging 配置 ====================

/**
 * 规范化目标地址
 * 处理 channel:openid 格式，提取出 openid
 */
function normalizeWeChatMiniprogramTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  
  // 处理 channel:openid 格式，提取 openid
  if (trimmed.startsWith(`${CHANNEL_ID}:`)) {
    const openid = trimmed.slice(CHANNEL_ID.length + 1);
    if (openid) {
      return openid;
    }
  }
  
  // 如果已经是纯 openid，直接返回
  return trimmed;
}

/**
 * 检查是否看起来像目标 ID
 * 识别 channel:openid 格式和纯 openid 格式
 */
function looksLikeWeChatMiniprogramTargetId(raw: string, normalized?: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  
  // 识别 channel:openid 格式
  if (trimmed.startsWith(`${CHANNEL_ID}:`)) {
    const openid = trimmed.slice(CHANNEL_ID.length + 1);
    if (openid && openid.length > 0) {
      return true;
    }
  }
  
  // 识别纯 openid 格式（openid 通常是字母数字下划线组合，长度较长）
  // 微信 openid 格式：通常是 28 个字符的字符串，包含字母、数字、下划线、连字符
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return true;
  }
  
  return false;
}

// ==================== Config 实现 ====================

const config: ChannelConfig<WeChatMiniprogramAccount> = {
  /**
   * 列出所有账户 ID
   */
  listAccountIds: (cfg) => {
    // 从配置中读取账户列表
    // 示例：返回 ["default"]
    return ["default"];
  },

  /**
   * 解析账户配置
   */
  resolveAccount: (cfg, accountId) => {
    // 使用统一的配置读取函数
    const pluginConfig = getPluginConfig(cfg);
    
    return {
      accountId: accountId || "default",
      enabled: true,
      config: {
        // bridgeUrl 不再存储在配置中，使用代码常量 BRIDGE_URL
        apiKey: pluginConfig.apiKey,
        pollIntervalMs: pluginConfig.pollIntervalMs,
        sessionKeyPrefix: pluginConfig.sessionKeyPrefix,
        debug: pluginConfig.debug,
      },
    };
  },

  /**
   * 检查账户是否已配置
   */
  isConfigured: (account) => {
    return isConfigValid(account.config as PluginConfig);
  },

  /**
   * 描述账户信息
   */
  describeAccount: (account) => ({
    accountId: account.accountId,
    enabled: account.enabled,
    configured: Boolean(account.config.apiKey?.trim()),
  }),
};

// ==================== Inbound 实现 ====================

export const inbound: ChannelInbound<WeChatMiniprogramAccount> = {
  /**
   * 接收消息处理器
   * 
   * 当外部平台有新消息时，OpenClaw 会调用此方法
   */
  receiveMessage: async (ctx) => {
    const { message, accountId, deps } = ctx;
    // 优先使用 deps.runtime（如果可用），否则使用 getWechatMiniprogramRuntime()
    const runtime = deps?.runtime || getWechatMiniprogramRuntime();
    
    // 1. 解析消息
    const userMessage = {
      // 根据你的消息格式解析
      openid: message.from?.id || message.from?.username,
      content: message.content || message.text,
      messageId: message.id,
      timestamp: message.timestamp || Date.now(),
    };
    
    // 2. 构建 Session Key
    // 确保 deps 和 deps.config 存在，如果不存在则使用 undefined（getPluginConfig 会处理）
    const pluginConfig = getPluginConfig(deps?.config);
    const sessionKey = `${pluginConfig.sessionKeyPrefix}${userMessage.openid}`;
    
    // 3. 调用 OpenClaw Gateway API
    try {
      // 检查 runtime.gateway 是否存在
      if (!runtime?.gateway?.call) {
        ctx.log?.error?.(`Gateway API not available: runtime.gateway.call is missing`);
        ctx.log?.error?.(`Runtime keys: ${Object.keys(runtime).join(', ')}`);
        if (runtime?.gateway) {
          ctx.log?.error?.(`Gateway keys: ${Object.keys(runtime.gateway).join(', ')}`);
        }
        throw new Error("Gateway API not available: runtime.gateway.call is missing");
      }
      
      const result = await runtime.gateway.call('chat.send', {
        sessionKey,
        message: userMessage.content,
      });
      
      return {
        channel: CHANNEL_ID,
        messageId: result.messageId || String(Date.now()),
      };
    } catch (error) {
      ctx.log?.error?.(`Failed to send message to OpenClaw: ${error}`);
      throw error;
    }
  },
};

// ==================== Outbound 实现 ====================

export const outbound: ChannelOutbound<WeChatMiniprogramAccount> = {
  // 直接发送模式（不缓冲）
  deliveryMode: "direct",
  
  /**
   * 解析目标地址
   * 
   * 处理 channel:openid 格式的 target，提取出 openid
   * 例如: "openclawwechat:onslD1wi_zoYBJggvREAPv-Dtl8E" -> "onslD1wi_zoYBJggvREAPv-Dtl8E"
   */
  resolveTarget: ({ to, allowFrom, mode }) => {
    const trimmed = to?.trim() ?? "";
    if (!trimmed) {
      // 如果没有提供 target，尝试使用 allowFrom 中的第一个
      if (allowFrom && allowFrom.length > 0) {
        const firstAllowed = String(allowFrom[0]).trim();
        if (firstAllowed) {
          // 处理 allowFrom 中的 channel:openid 格式
          if (firstAllowed.startsWith(`${CHANNEL_ID}:`)) {
            const openid = firstAllowed.slice(CHANNEL_ID.length + 1);
            if (openid) {
              return { ok: true, to: openid };
            }
          }
          return { ok: true, to: firstAllowed };
        }
      }
      return {
        ok: false,
        error: new Error(`Target is required for WeChat MiniProgram. Use format: "${CHANNEL_ID}:<openid>" or just "<openid>"`),
      };
    }
    
    // 处理 channel:openid 格式，提取 openid
    if (trimmed.startsWith(`${CHANNEL_ID}:`)) {
      const openid = trimmed.slice(CHANNEL_ID.length + 1);
      if (openid) {
        return { ok: true, to: openid };
      }
    }
    
    // 如果已经是纯 openid，直接返回
    return { ok: true, to: trimmed };
  },
  
  /**
   * 发送文本消息
   */
  sendText: async (ctx) => {
    const { to, text, accountId, cfg, replyToId } = ctx;
    // 使用统一的配置读取函数
    const pluginConfig = getPluginConfig(cfg);
    const apiKey = pluginConfig.apiKey;
    
    if (!apiKey) {
      throw new Error("API Key not configured");
    }
    
    // 调用中转服务器 API（Telegram Bot API 兼容格式）
    try {
      const response = await fetch(`${BRIDGE_URL}/bot${apiKey}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: to,
          text,
          reply_to_message_id: replyToId ? parseInt(replyToId) : undefined,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(`API error: ${data.description || 'Unknown error'}`);
      }
      
      return {
        channel: CHANNEL_ID,
        messageId: data.result?.message_id || String(Date.now()),
      };
    } catch (error) {
      ctx.log?.error?.(`Failed to send text message: ${error}`);
      throw error;
    }
  },
  
  /**
   * 发送媒体消息
   */
  sendMedia: async (ctx) => {
    const { to, text, mediaUrl, accountId, cfg, replyToId } = ctx;
    // 使用统一的配置读取函数
    // 使用 ctx.cfg 而不是 ctx.deps.config（与 sendText 保持一致）
    const pluginConfig = getPluginConfig(cfg);
    const apiKey = pluginConfig.apiKey;
    
    if (!apiKey) {
      throw new Error("API Key not configured");
    }
    
    if (!mediaUrl) {
      throw new Error("Media URL is required");
    }
    
    // 检查是否是本地路径（不是http://或https://开头）
    const isLocalPath = !mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://');
    
    // 构建API URL（确保API Key中的冒号被URL编码）
    const encodedAPIKey = apiKey.replace(/:/g, '%3A');
    
    try {
      const runtime = getWechatMiniprogramRuntime();
      let response: Response;
      
      // 先加载媒体文件以识别类型（本地路径和URL都需要）
      let media;
      let kind: string;
      let contentType: string;
      
      if (isLocalPath) {
        // 本地路径：解析相对路径为绝对路径（相对于workspace目录）
        const resolvedMediaPath = resolveMediaPath(mediaUrl);
        media = await runtime.media.loadWebMedia(resolvedMediaPath);
        kind = runtime.media.mediaKindFromMime(media.contentType);
        contentType = media.contentType || '';
        ctx.log?.info?.(`[${accountId || 'unknown'}] Sending media (local): path=${resolvedMediaPath}, kind=${kind}, contentType=${contentType || 'unknown'}`);
      } else {
        // URL：加载媒体文件以识别类型
        media = await runtime.media.loadWebMedia(mediaUrl);
        kind = runtime.media.mediaKindFromMime(media.contentType);
        contentType = media.contentType || '';
        ctx.log?.info?.(`[${accountId || 'unknown'}] Sending media (URL): url=${mediaUrl}, kind=${kind}, contentType=${contentType || 'unknown'}`);
      }
      
      // 根据媒体类型确定 API 端点、字段名和默认文件名
      let sendMediaURL: string;
      let fieldName: string;
      let defaultFileName: string;
      let jsonFieldName: string;
      
      if (kind === "image") {
        sendMediaURL = `${BRIDGE_URL}/bot${encodedAPIKey}/sendPhoto`;
        fieldName = "photo";
        jsonFieldName = "photo";
        defaultFileName = "image.jpg";
      } else if (kind === "video") {
        sendMediaURL = `${BRIDGE_URL}/bot${encodedAPIKey}/sendVideo`;
        fieldName = "video";
        jsonFieldName = "video";
        defaultFileName = "video.mp4";
      } else if (kind === "audio") {
        // 音频文件使用 sendDocument API（后端会将 audio 路由到 SendDocument）
        sendMediaURL = `${BRIDGE_URL}/bot${encodedAPIKey}/sendDocument`;
        fieldName = "document";
        jsonFieldName = "document";
        defaultFileName = "audio.mp3";
      } else {
        // 其他类型（document）使用 sendDocument API
        sendMediaURL = `${BRIDGE_URL}/bot${encodedAPIKey}/sendDocument`;
        fieldName = "document";
        jsonFieldName = "document";
        defaultFileName = "document";
      }
      
      if (isLocalPath) {
        // 本地路径：使用multipart/form-data上传
        const fileName = mediaUrl.split('/').pop() || defaultFileName;
        
        // 手动构建multipart/form-data请求体
        const boundary = `----formdata-openclaw-${Date.now()}`;
        const parts: Uint8Array[] = [];
        const encoder = new TextEncoder();
        
        // 添加媒体字段（photo、video 或 document）
        const finalContentType = contentType || 
          (kind === "video" ? 'video/mp4' : 
           kind === "audio" ? 'audio/mpeg' : 
           kind === "image" ? 'image/jpeg' : 
           'application/octet-stream');
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode(`Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n`));
        parts.push(encoder.encode(`Content-Type: ${finalContentType}\r\n\r\n`));
        parts.push(media.buffer);
        parts.push(encoder.encode(`\r\n`));
        
        // 添加chat_id字段
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode(`Content-Disposition: form-data; name="chat_id"\r\n\r\n`));
        parts.push(encoder.encode(to));
        parts.push(encoder.encode(`\r\n`));
        
        // 添加caption字段（如果有）
        if (text) {
          parts.push(encoder.encode(`--${boundary}\r\n`));
          parts.push(encoder.encode(`Content-Disposition: form-data; name="caption"\r\n\r\n`));
          parts.push(encoder.encode(text));
          parts.push(encoder.encode(`\r\n`));
        }
        
        // 添加reply_to_message_id字段（如果有）
        if (replyToId) {
          parts.push(encoder.encode(`--${boundary}\r\n`));
          parts.push(encoder.encode(`Content-Disposition: form-data; name="reply_to_message_id"\r\n\r\n`));
          parts.push(encoder.encode(String(parseInt(String(replyToId)))));
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
          chat_id: to,
          [jsonFieldName]: mediaUrl, // 使用原始 URL，后端会处理下载和上传
          caption: text || undefined,
          reply_to_message_id: replyToId ? parseInt(String(replyToId)) : undefined,
        };
        
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
        ctx.log?.error?.(`[${accountId || 'unknown'}] Failed to send ${kind}: ${response.status} ${response.statusText}, body=${errorText}`);
        throw new Error(`Failed to send media: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(`API error: ${data.description || 'Unknown error'}`);
      }
      
      ctx.log?.info?.(`[${accountId || 'unknown'}] ✅ Successfully sent ${kind} to ${to}, message_id=${data.result?.message_id}`);
      
      return {
        channel: CHANNEL_ID,
        messageId: data.result?.message_id || String(Date.now()),
      };
    } catch (error) {
      ctx.log?.error?.(`[${accountId || 'unknown'}] Failed to send media message: ${error}`);
      if (error instanceof Error) {
        ctx.log?.error?.(`[${accountId || 'unknown'}] Error stack: ${error.stack}`);
      }
      throw error;
    }
  },
};

// ==================== Status 实现 ====================

const status: ChannelStatus<WeChatMiniprogramAccount, WeChatMiniprogramProbe> = {
  /**
   * 默认运行时状态
   */
  defaultRuntime: {
    accountId: "default",
    running: false,
    lastStartAt: null,
    lastStopAt: null,
    lastError: null,
  },
  
  /**
   * 构建通道摘要
   */
  buildChannelSummary: ({ snapshot }) => ({
    configured: snapshot.configured ?? false,
    running: snapshot.running ?? false,
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastError: snapshot.lastError ?? null,
  }),
  
  /**
   * 构建账户快照
   */
  buildAccountSnapshot: ({ account, cfg, runtime }) => {
    return {
      accountId: account.accountId,
      enabled: account.enabled,
      configured: isConfigValid(account.config as PluginConfig),
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
    };
  },
};

// ==================== Gateway 实现 ====================

const gateway: ChannelGateway<WeChatMiniprogramAccount> = {
  /**
   * 启动账户
   * 
   * 当用户启用通道时，OpenClaw 会调用此方法
   * 启动轮询服务从中转服务器获取新消息
   */
  startAccount: async (ctx) => {
    const { account } = ctx;
    
    ctx.log?.info?.(`[${account.accountId}] Starting WeChat MiniProgram account`);
    
    // 检查配置
    if (!account.config.apiKey?.trim()) {
      throw new Error("API Key not configured");
    }
    
    // 启动轮询服务
    return await startPollingService(ctx);
  },
  
  /**
   * 停止账户
   * 
   * 当用户禁用通道时，OpenClaw 会调用此方法
   */
  stopAccount: async (ctx) => {
    const { account } = ctx;
    
    ctx.log?.info?.(`[${account.accountId}] Stopping WeChat MiniProgram account`);
    
    // 清理资源（停止轮询、关闭连接等）
    
    return {
      running: false,
      lastStopAt: Date.now(),
    };
  },
};

// ==================== Channel Plugin 导出 ====================

export const wechatMiniprogramPlugin: ChannelPlugin<WeChatMiniprogramAccount, WeChatMiniprogramProbe> = {
  id: CHANNEL_ID,
  meta,
  capabilities,
  config,
  inbound,
  outbound,
  status,
  gateway,
  messaging: {
    normalizeTarget: normalizeWeChatMiniprogramTarget,
    targetResolver: {
      looksLikeId: looksLikeWeChatMiniprogramTargetId,
      hint: `<openid> or "${CHANNEL_ID}:<openid>"`,
    },
  },
};
