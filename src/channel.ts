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
  ChannelConfigAdapter,
  ChannelOutboundAdapter,
  ChannelStatusAdapter,
  ChannelGatewayAdapter,
  ChannelGatewayContext,
  ChannelMeta,
  ChannelCapabilities,
  ChannelAccountSnapshot,
  OpenClawConfig,
} from "openclaw/plugin-sdk/core";
import { resolveMediaPath } from "./media-handler.js";
import { getWechatMiniprogramRuntime } from "./runtime.js";
import { startPollingService, runPollingCleanup } from "./polling.js";
import { CHANNEL_ID, BRIDGE_URL } from "./constants.js";
import {
  wechatMiniprogramSetupAdapter,
  wechatMiniprogramSetupWizard,
} from "./setup-wizard.js";
import {
  getPluginConfig,
  isConfigValid,
  listAccountIds as listAccountIdsFromConfig,
  isAccountEnabled,
  validatePluginConfig,
  type PluginConfig,
} from "./config.js";

// ==================== 类型定义 ====================

/**
 * 账户配置类型
 */
export interface WeChatMiniprogramAccount {
  accountId: string;
  enabled: boolean;
    config: {
    // bridgeUrl 不再从配置读取，使用代码常量 BRIDGE_URL
    apiKey?: string;
    pollIntervalMs?: number;
    sessionKey?: string;
    debug?: boolean;
  };
}

/**
 * 账户 Probe 类型（用于状态检查）
 */
export interface WeChatMiniprogramProbe {
  ok: boolean;
  // 添加你的 Probe 字段
}

type LoggerLike = {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
};

type SendContextLike = {
  to: string;
  text?: string;
  mediaUrl?: string;
  accountId?: string;
  cfg?: OpenClawConfig;
  replyToId?: string | number;
  log?: LoggerLike;
};

// ==================== Meta 配置 ====================

const meta: ChannelMeta = {
  id: CHANNEL_ID,
  label: "OpenClawWeChat",
  selectionLabel: "OpenClawWeChat（微信小程序 ClawChat ）",
  blurb: "通过ClawChat微信小程序，与OpenClaw进行双向通讯。",
  docsPath: "/channels/openclawwechat",
  docsLabel: "openclawwechat",
};

// ==================== Capabilities 配置 ====================

const capabilities: ChannelCapabilities = {
  chatTypes: ["direct", "group"],
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

  // 识别群 chat_id（负整数）
  if (/^-?\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    if (n < 0) return true;
  }

  return false;
}

// ==================== Config 实现 ====================

const config: ChannelConfigAdapter<WeChatMiniprogramAccount> = {
  /**
   * 列出所有账户 ID
   */
  listAccountIds: (cfg: OpenClawConfig) => {
    return listAccountIdsFromConfig(cfg);
  },

  /**
   * 解析账户配置
   */
  resolveAccount: (cfg: OpenClawConfig, accountId: string) => {
    // 使用统一的配置读取函数
    const resolvedAccountId = accountId || "default";
    const pluginConfig = getPluginConfig(cfg, resolvedAccountId);
    
    return {
      accountId: resolvedAccountId,
      enabled: isAccountEnabled(cfg, resolvedAccountId),
      config: {
        // bridgeUrl 不再存储在配置中，使用代码常量 BRIDGE_URL
        apiKey: pluginConfig.apiKey,
        pollIntervalMs: pluginConfig.pollIntervalMs,
        sessionKey: pluginConfig.sessionKey,
        debug: pluginConfig.debug,
      },
    };
  },

  /**
   * 检查账户是否已配置
   */
  isConfigured: (account: WeChatMiniprogramAccount) => {
    return isConfigValid(account.config as PluginConfig);
  },

  /**
   * 描述账户信息
   */
  describeAccount: (account: WeChatMiniprogramAccount) => ({
    accountId: account.accountId,
    enabled: account.enabled,
    configured: Boolean(account.config.apiKey?.trim()),
  }),
};

// ==================== Outbound 实现 ====================
//
// 注：旧版的 `inbound.receiveMessage`（经 runtime.gateway.call('chat.send') 注入）已随
// 2026.7.2 SDK 移除——新版 ChannelPlugin 无 inbound 字段；真实入站流是 gateway.startAccount
// 启动的长轮询 → message-injector.injectMessage（经 runtime.channel.reply 注入 agent）。

export const outbound: ChannelOutboundAdapter = {
  // 直接发送模式（不缓冲）
  deliveryMode: "direct",
  
  /**
   * 解析目标地址
   * 
   * 处理 channel:openid 格式的 target，提取出 openid
   * 例如: "openclawwechat:onslD1wi_zoYBJggvREAPv-Dtl8E" -> "onslD1wi_zoYBJggvREAPv-Dtl8E"
   */
  resolveTarget: ({ to, allowFrom, mode: _mode }: { to?: string; allowFrom?: unknown[]; mode?: unknown }) => {
    const trimmed = to?.trim() ?? "";
    if (!trimmed) {
      // 如果没有提供 target，尝试使用 allowFrom 中的第一个
      if (allowFrom && allowFrom.length > 0) {
        const firstAllowed = String(allowFrom[0]).trim();
        if (firstAllowed) {
          // 处理 allowFrom 中的 channel:openid 格式
          if (firstAllowed.startsWith(`${CHANNEL_ID}:`)) {
            const rest = firstAllowed.slice(CHANNEL_ID.length + 1);
            if (rest) {
              // 群 chat_id 为负整数，需保持为 number
              const n = parseInt(rest, 10);
              if (!isNaN(n) && n < 0) {
                return { ok: true, to: n };
              }
              return { ok: true, to: rest };
            }
          }
          const n = parseInt(firstAllowed, 10);
          if (!isNaN(n) && n < 0) {
            return { ok: true, to: n };
          }
          return { ok: true, to: firstAllowed };
        }
      }
      return {
        ok: false,
        error: new Error(`Target is required for WeChat MiniProgram. Use format: "${CHANNEL_ID}:<openid>" or "${CHANNEL_ID}:<chat_id>" or "<openid>" or negative <chat_id>`),
      };
    }

    // 处理 channel:openid 或 channel:chatId 格式
    if (trimmed.startsWith(`${CHANNEL_ID}:`)) {
      const rest = trimmed.slice(CHANNEL_ID.length + 1);
      if (rest) {
        const n = parseInt(rest, 10);
        if (!isNaN(n) && n < 0) {
          return { ok: true, to: n };
        }
        return { ok: true, to: rest };
      }
    }

    // 群 chat_id 负整数
    if (/^-?\d+$/.test(trimmed)) {
      const n = parseInt(trimmed, 10);
      if (n < 0) return { ok: true, to: n };
    }

    // 纯 openid
    return { ok: true, to: trimmed };
  },
  
  /**
   * 发送文本消息
   */
  sendText: async (ctx: SendContextLike) => {
    const { to, text, accountId, cfg, replyToId } = ctx;
    // 使用统一的配置读取函数
    const pluginConfig = getPluginConfig(cfg, accountId || "default");
    const apiKey = pluginConfig.apiKey;
    
    if (!apiKey) {
      throw new Error("API Key not configured");
    }
    
    // 调用中转服务器 API（Telegram Bot API 兼容格式）
    const encodedAPIKey = apiKey.replace(/:/g, '%3A');
    try {
      const response = await fetch(`${BRIDGE_URL}/bot${encodedAPIKey}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: to,
          text,
          reply_to_message_id: replyToId ? Number(replyToId) : undefined,
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
  sendMedia: async (ctx: SendContextLike) => {
    const { to, text, mediaUrl, accountId, cfg, replyToId } = ctx;
    // 使用统一的配置读取函数
    // 使用 ctx.cfg 而不是 ctx.deps.config（与 sendText 保持一致）
    const pluginConfig = getPluginConfig(cfg, accountId || "default");
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
        
        // 添加chat_id字段（支持 openid 字符串或群 chat_id 数字）
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode(`Content-Disposition: form-data; name="chat_id"\r\n\r\n`));
        parts.push(encoder.encode(String(to)));
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
        const jsonBody: Record<string, unknown> = {
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

const status: ChannelStatusAdapter<WeChatMiniprogramAccount, WeChatMiniprogramProbe> = {
  /**
   * 默认运行时状态
   */
  defaultRuntime: {
    accountId: "default",
    running: false,
    connected: false,
    lastStartAt: null,
    lastStopAt: null,
    lastEventAt: null,
    lastInboundAt: null,
    lastError: null,
  },
  
  /**
   * 构建通道摘要
   */
  buildChannelSummary: ({ snapshot }: { snapshot: Partial<ChannelAccountSnapshot> }) => ({
    configured: snapshot.configured ?? false,
    running: snapshot.running ?? false,
    connected: snapshot.connected ?? false,
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastEventAt: snapshot.lastEventAt ?? null,
    lastInboundAt: snapshot.lastInboundAt ?? null,
    lastError: snapshot.lastError ?? null,
  }),
  
  /**
   * 构建账户快照
   */
  buildAccountSnapshot: ({ account, cfg: _cfg, runtime }: { account: WeChatMiniprogramAccount; cfg: unknown; runtime: Partial<ChannelAccountSnapshot> }) => {
    return {
      accountId: account.accountId,
      enabled: account.enabled,
      configured: isConfigValid(account.config as PluginConfig),
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastEventAt: runtime?.lastEventAt ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastError: runtime?.lastError ?? null,
    };
  },
};

// ==================== Gateway 实现 ====================

const gateway: ChannelGatewayAdapter<WeChatMiniprogramAccount> = {
  /**
   * 启动账户
   *
   * 当用户启用通道时，OpenClaw 会调用此方法
   * 启动轮询服务从中转服务器获取新消息
   */
  startAccount: async (ctx: ChannelGatewayContext<WeChatMiniprogramAccount>) => {
    const { account } = ctx;
    
    ctx.log?.info?.(`[${account.accountId}] Starting WeChat MiniProgram account`);

    const validation = validatePluginConfig(ctx.cfg);
    if (!validation.ok) {
      const errorMsg = validation.errors.join("; ");
      ctx.log?.error?.(`[${account.accountId}] Invalid plugin config: ${errorMsg}`);
      throw new Error(`Invalid plugin config: ${errorMsg}`);
    }
    
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
  stopAccount: async (ctx: ChannelGatewayContext<WeChatMiniprogramAccount>) => {
    const { account } = ctx;

    ctx.log?.info?.(`[${account.accountId}] Stopping WeChat MiniProgram account`);

    runPollingCleanup(account.accountId);
  },
};

// ==================== Channel Plugin 导出 ====================

export const wechatMiniprogramPlugin: ChannelPlugin<WeChatMiniprogramAccount, WeChatMiniprogramProbe> = {
  id: CHANNEL_ID,
  meta,
  setup: wechatMiniprogramSetupAdapter,
  setupWizard: wechatMiniprogramSetupWizard,
  capabilities,
  reload: {
    // 插件配置位于 plugins.entries.openclawwechat
    configPrefixes: ["plugins.entries.openclawwechat"],
  },
  config,
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
