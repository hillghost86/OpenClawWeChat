/**
 * 轮询服务实现（可选）
 * 
 * 如果你的通道平台不支持 Webhook，可以使用轮询方式获取新消息
 * 
 * 使用示例：
 * ```typescript
 * import { startPollingService } from "./polling.js";
 * 
 * gateway: {
 *   startAccount: async (ctx) => {
 *     return await startPollingService(ctx);
 *   },
 * }
 * ```
 */

import type { GatewayStartContext } from "openclaw/plugin-sdk";
import { parseTelegramUpdate } from "./message-parser.js";
import { downloadMedia } from "./media-handler.js";
import { injectMessage } from "./message-injector.js";
import { DEFAULT_CONFIG, BRIDGE_URL } from "./constants.js";

/** 存储清理函数，供 stopAccount 调用，避免 auto-restart 时多实例并行轮询 */
let activeCleanup: (() => void) | null = null;

/**
 * 启动轮询服务
 * 
 * @param ctx - Gateway 启动上下文
 * @returns 运行时状态
 */
export async function startPollingService(ctx: GatewayStartContext) {
  const { account, abortSignal, log, deps } = ctx;
  const config = account.config;
  
  log?.info?.(`[${account.accountId}] Starting WeChat MiniProgram polling service`);

  // bridgeUrl 使用代码常量，不从配置读取
  const apiKey = config.apiKey;
  const pollInterval = config.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs;
  log?.info?.(`[${account.accountId}] Polling interval: ${pollInterval}ms`);
  const debug = config.debug ?? DEFAULT_CONFIG.debug;
  
  // 预先读取 Gateway 配置（用于 HTTP API 备选方案）
  const gatewayConfig = deps?.config?.gateway || {};
  const gatewayPort = gatewayConfig.port || 18789;
  const gatewayToken = gatewayConfig.auth?.token || "";
  
  if (debug) {
    log?.info?.(`[${account.accountId}] Gateway config: port=${gatewayPort}, token=${gatewayToken ? '***' + gatewayToken.slice(-4) : 'NOT FOUND'}`);
  }
  
  if (!apiKey) {
    throw new Error("API Key not configured");
  }

  // 先清理旧实例，避免 auto-restart 时多实例并行
  if (activeCleanup) {
    log?.info?.(`[${account.accountId}] Cleaning up previous polling instance`);
    activeCleanup();
    activeCleanup = null;
  }

  const encodedAPIKey = apiKey.replace(/:/g, "%3A");

  let offset = 0;
  let pollingTimer: NodeJS.Timeout | null = null;
  let pollCount = 0;
  let stopped = false;

  /**
   * 轮询函数
   */
  const poll = async () => {
    if (abortSignal.aborted) {
      log?.info?.(`[${account.accountId}] Polling stopped (aborted)`);
      return;
    }
    
    pollCount++;
    const pollUrl = `${BRIDGE_URL}/bot${encodedAPIKey}/getUpdates?offset=${offset}&limit=100&timeout=1`;
    
    if (debug && pollCount % 10 === 0) {
      log?.info?.(`[${account.accountId}] Polling #${pollCount}: offset=${offset}`);
    }
    
    try {
      // 1. 调用中转服务器 API 获取新消息（Telegram Bot API 兼容格式）
      const response = await fetch(pollUrl, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        log?.error?.(`[${account.accountId}] Polling failed: HTTP ${response.status} ${response.statusText}`);
        throw new Error(`Polling failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (debug && data.result?.length === 0) {
        log?.info?.(`[${account.accountId}] Polling response: ok=${data.ok}, result.length=0`);
      }
      
      if (!data.ok) {
        log?.error?.(`[${account.accountId}] API error: ${data.error_code || 'unknown'} - ${data.description || 'Unknown error'}`);
        throw new Error(`API error: ${data.description || 'Unknown error'}`);
      }
      
      // 2. 处理返回的消息
      if (data.result && data.result.length > 0) {
        const updates = data.result;
        let maxUpdateId = 0;
        let processedCount = 0;
        
        for (const update of updates) {
          // 3. 解析消息
          const parsedMessage = parseTelegramUpdate(update, account.accountId, log);
          if (!parsedMessage) {
            if (debug) {
              log?.info?.(`[${account.accountId}] Skipping update without message: update_id=${update.update_id}, type=${Object.keys(update).join(',')}`);
            }
            continue;
          }
          
          // 记录 uploadAPIURL（用于调试）
          if (parsedMessage.uploadAPIURL) {
            log?.info?.(`[${account.accountId}] Backend provided upload API URL: ${parsedMessage.uploadAPIURL}`);
          } else {
            log?.warn?.(`[${account.accountId}] No upload API URL provided for update_id=${parsedMessage.updateId}`);
          }
          
          try {
            // 4. 下载媒体（如果有）
            const mediaInfo = await downloadMedia(
              parsedMessage.mediaUrls,
              parsedMessage.mediaTypes,
              account.accountId,
              log
            );
            
            // 5. 注入消息到 OpenClaw
            await injectMessage(
              {
                openid: parsedMessage.openid,
                updateId: parsedMessage.updateId,
                text: parsedMessage.text,
                mediaUrls: mediaInfo.mediaUrls,
                mediaTypes: parsedMessage.mediaTypes, // 使用解析出的媒体类型（包含视频信息）
                mediaPaths: mediaInfo.mediaPaths,
                uploadAPIURL: parsedMessage.uploadAPIURL,
              },
              {
                accountId: account.accountId,
                bridgeUrl: BRIDGE_URL,
                apiKey,
              },
              log
            );
            
            processedCount++;
          } catch (error) {
            log?.error?.(`[${account.accountId}] Failed to process message: update_id=${parsedMessage.updateId}, error=${error}`);
            // 继续处理其他消息，不中断轮询
          }
          
          // 6. 更新 maxUpdateId
          maxUpdateId = Math.max(maxUpdateId, parsedMessage.updateId);
        }
        
        // 7. 更新 offset（使用 maxUpdateId + 1）
        if (maxUpdateId > 0) {
          offset = maxUpdateId + 1;
          
          // 8. 标记消息为已处理（Telegram Bot API 兼容格式）
          try {
            const messageIds = updates.map((u: any) => u.update_id);
            await fetch(`${BRIDGE_URL}/bot${encodedAPIKey}/markProcessed`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ message_ids: messageIds }),
            });
          } catch (error) {
            log?.warn?.(`[${account.accountId}] Failed to mark messages as processed: ${error}`);
          }
        }
      }
    } catch (error) {
      log?.error?.(`[${account.accountId}] Polling error: ${error}`);

      if (!abortSignal.aborted && !stopped) {
        const retryDelay = pollInterval * 5;
        log?.warn?.(`[${account.accountId}] Retrying in ${retryDelay}ms...`);
        pollingTimer = setTimeout(poll, retryDelay);
      }
      return;
    }

    if (!abortSignal.aborted && !stopped) {
      pollingTimer = setTimeout(poll, pollInterval);
    }
  };
  
  // 开始第一次轮询
  poll();
  
  const cleanup = () => {
    stopped = true;
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = null;
    }
    if (activeCleanup === cleanup) {
      activeCleanup = null;
    }
    log?.info?.(`[${account.accountId}] Polling service cleaned up`);
  };

  activeCleanup = cleanup;

  return {
    running: true,
    lastStartAt: Date.now(),
    cleanup,
  };
}

/**
 * 执行轮询清理（清除 timer，停止后续轮询）
 * 供 stopAccount 调用，避免 auto-restart 时多实例并行
 */
export function runPollingCleanup(): void {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
}

/**
 * 停止轮询服务
 *
 * @param ctx - Gateway 停止上下文
 */
export async function stopPollingService(ctx: any) {
  const { account, log } = ctx;
  
  log?.info?.(`[${account.accountId}] Stopping WeChat MiniProgram polling service`);

  runPollingCleanup();

  return {
    running: false,
    lastStopAt: Date.now(),
  };
}
