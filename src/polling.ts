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

/** 每个账户独立清理函数，避免账户间互相清理 */
const activeCleanupByAccount = new Map<string, () => void>();

const LONG_POLL_TIMEOUT_SECONDS = 25;
const REQUEST_TIMEOUT_MS = 35_000;
const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 60_000;
const RETRY_JITTER_RATIO = 0.2;
const RECENT_UPDATE_ID_CACHE_SIZE = 2_000;

type PollErrorKind =
  | "auth"
  | "rate_limit"
  | "server"
  | "network"
  | "abort"
  | "invalid_response"
  | "unknown";

type PollError = {
  kind: PollErrorKind;
  message: string;
  status?: number;
  retryAfterMs?: number;
  retriable: boolean;
  stopAccount: boolean;
};

type PollHealth = {
  pollCount: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastSuccessAt?: number;
  lastErrorAt?: number;
  lastErrorKind?: PollErrorKind;
};

function buildJitteredDelay(baseDelayMs: number): number {
  const jitter = Math.round(baseDelayMs * RETRY_JITTER_RATIO * Math.random());
  return Math.max(500, baseDelayMs + jitter);
}

function computeRetryDelayMs(consecutiveFailures: number): number {
  const exp = Math.max(0, consecutiveFailures - 1);
  const base = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** exp);
  return buildJitteredDelay(base);
}

function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const asSeconds = Number(headerValue);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(BASE_RETRY_DELAY_MS, Math.round(asSeconds * 1000)));
  }
  const asDateMs = Date.parse(headerValue);
  if (!Number.isNaN(asDateMs)) {
    const delta = asDateMs - Date.now();
    if (delta > 0) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.max(BASE_RETRY_DELAY_MS, delta));
    }
  }
  return undefined;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  abortSignal: AbortSignal,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  const onAbort = () => timeoutController.abort();
  abortSignal.addEventListener("abort", onAbort);
  try {
    return await fetch(url, {
      ...options,
      signal: timeoutController.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    abortSignal.removeEventListener("abort", onAbort);
  }
}

function classifyPollError(error: unknown): PollError {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === "ABORTED" || msg.includes("aborted")) {
    return {
      kind: "abort",
      message: msg,
      retriable: false,
      stopAccount: false,
    };
  }
  if (msg.startsWith("HTTP_")) {
    const status = Number(msg.replace("HTTP_", ""));
    if (status === 401 || status === 403) {
      return {
        kind: "auth",
        message: `HTTP ${status}`,
        status,
        retriable: false,
        stopAccount: true,
      };
    }
    if (status === 429) {
      return {
        kind: "rate_limit",
        message: "HTTP 429",
        status,
        retriable: true,
        stopAccount: false,
      };
    }
    if (status >= 500) {
      return {
        kind: "server",
        message: `HTTP ${status}`,
        status,
        retriable: true,
        stopAccount: false,
      };
    }
  }
  if (msg.startsWith("RATE_LIMIT:")) {
    const raw = msg.replace("RATE_LIMIT:", "").trim();
    const retryAfterMs = raw ? Number(raw) : NaN;
    return {
      kind: "rate_limit",
      message: "Rate limit",
      status: 429,
      retryAfterMs: Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : undefined,
      retriable: true,
      stopAccount: false,
    };
  }
  if (msg.startsWith("API_ERROR:")) {
    return {
      kind: "invalid_response",
      message: msg,
      retriable: true,
      stopAccount: false,
    };
  }
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("timed out")) {
    return {
      kind: "network",
      message: msg,
      retriable: true,
      stopAccount: false,
    };
  }
  return {
    kind: "unknown",
    message: msg,
    retriable: true,
    stopAccount: false,
  };
}

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

  // 仅清理同一 account 的旧实例，避免多账户互相影响
  const previousCleanup = activeCleanupByAccount.get(account.accountId);
  if (previousCleanup) {
    log?.info?.(`[${account.accountId}] Cleaning up previous polling instance`);
    previousCleanup();
    activeCleanupByAccount.delete(account.accountId);
  }

  const encodedAPIKey = apiKey.replace(/:/g, "%3A");

  let offset = 0;
  let pollingTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let accountBlocked = false;
  const health: PollHealth = {
    pollCount: 0,
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
  };
  const recentUpdateIds = new Set<number>();
  const recentUpdateIdQueue: number[] = [];

  const rememberUpdateId = (updateId: number) => {
    if (recentUpdateIds.has(updateId)) return;
    recentUpdateIds.add(updateId);
    recentUpdateIdQueue.push(updateId);
    if (recentUpdateIdQueue.length > RECENT_UPDATE_ID_CACHE_SIZE) {
      const oldest = recentUpdateIdQueue.shift();
      if (typeof oldest === "number") recentUpdateIds.delete(oldest);
    }
  };

  const scheduleNext = (delayMs: number) => {
    if (!abortSignal.aborted && !stopped && !accountBlocked) {
      pollingTimer = setTimeout(poll, delayMs);
    }
  };

  /**
   * 轮询函数
   */
  const poll = async () => {
    if (abortSignal.aborted || stopped || accountBlocked) {
      log?.info?.(`[${account.accountId}] Polling stopped (aborted)`);
      return;
    }
    
    health.pollCount++;
    const pollUrl = `${BRIDGE_URL}/bot${encodedAPIKey}/getUpdates?offset=${offset}&limit=100&timeout=${LONG_POLL_TIMEOUT_SECONDS}`;
    
    if (debug && health.pollCount % 10 === 0) {
      log?.info?.(
        `[${account.accountId}] Polling #${health.pollCount}: offset=${offset}, consecutiveFailures=${health.consecutiveFailures}`,
      );
    }
    
    try {
      // 1. 调用中转服务器 API 获取新消息（Telegram Bot API 兼容格式）
      const response = await fetchWithTimeout(pollUrl, {
        signal: abortSignal,
        headers: {
          'Content-Type': 'application/json',
        },
      }, REQUEST_TIMEOUT_MS, abortSignal);
      
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
          throw new Error(`RATE_LIMIT:${retryAfterMs ?? ""}`);
        }
        throw new Error(`HTTP_${response.status}`);
      }
      
      const data = await response.json();
      
      if (debug && data.result?.length === 0) {
        log?.info?.(`[${account.accountId}] Polling response: ok=${data.ok}, result.length=0`);
      }
      
      if (!data.ok) {
        const errorCode = Number(data.error_code);
        const description = data.description || 'Unknown error';
        if (errorCode === 429) {
          const retryAfterSec = Number(data.parameters?.retry_after);
          const retryAfterMs =
            Number.isFinite(retryAfterSec) && retryAfterSec > 0
              ? Math.round(retryAfterSec * 1000)
              : undefined;
          throw new Error(`RATE_LIMIT:${retryAfterMs ?? ""}`);
        }
        if (errorCode === 401 || errorCode === 403) {
          throw new Error(`HTTP_${errorCode}`);
        }
        throw new Error(`API_ERROR:${description}`);
      }
      
      // 2. 处理返回的消息
      if (data.result && data.result.length > 0) {
        const updates = data.result;
        let maxUpdateId = 0;
        let processedCount = 0;
        
        for (const update of updates) {
          if (typeof update?.update_id === "number" && recentUpdateIds.has(update.update_id)) {
            if (debug) {
              log?.info?.(`[${account.accountId}] Skip duplicated update_id=${update.update_id}`);
            }
            maxUpdateId = Math.max(maxUpdateId, update.update_id);
            continue;
          }
          // 3. 解析消息
          const parsedMessage = parseTelegramUpdate(update, account.accountId, log);
          if (!parsedMessage) {
            if (debug) {
              log?.info?.(`[${account.accountId}] Skipping update without message: update_id=${update.update_id}, type=${Object.keys(update).join(',')}`);
            }
            if (typeof update?.update_id === "number") {
              rememberUpdateId(update.update_id);
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
          rememberUpdateId(parsedMessage.updateId);
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
      health.successCount += 1;
      health.consecutiveFailures = 0;
      health.lastSuccessAt = Date.now();
      scheduleNext(pollInterval);
    } catch (error) {
      const classified = classifyPollError(error);
      if (classified.kind === "abort" || abortSignal.aborted || stopped) {
        return;
      }
      health.failureCount += 1;
      health.consecutiveFailures += 1;
      health.lastErrorAt = Date.now();
      health.lastErrorKind = classified.kind;

      if (classified.stopAccount) {
        accountBlocked = true;
        log?.error?.(
          `[${account.accountId}] Polling stopped due to auth error (${classified.status ?? "unknown"}). Please check API Key.`,
        );
        return;
      }

      const retryDelay =
        classified.retryAfterMs ??
        (classified.kind === "rate_limit"
          ? buildJitteredDelay(10_000)
          : computeRetryDelayMs(health.consecutiveFailures));
      log?.warn?.(
        `[${account.accountId}] Polling error kind=${classified.kind}, status=${classified.status ?? "-"}, message=${classified.message}; retry in ${retryDelay}ms`,
      );
      scheduleNext(retryDelay);
    }
  };
  
  // 开始第一次轮询
  poll();
  
  const cleanup = () => {
    stopped = true;
    accountBlocked = true;
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = null;
    }
    activeCleanupByAccount.delete(account.accountId);
    log?.info?.(`[${account.accountId}] Polling service cleaned up`);
  };

  activeCleanupByAccount.set(account.accountId, cleanup);

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
export function runPollingCleanup(accountId?: string): void {
  if (accountId) {
    const cleanup = activeCleanupByAccount.get(accountId);
    if (cleanup) {
      cleanup();
      activeCleanupByAccount.delete(accountId);
    }
    return;
  }

  for (const [id, cleanup] of activeCleanupByAccount.entries()) {
    cleanup();
    activeCleanupByAccount.delete(id);
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

  runPollingCleanup(account.accountId);

  return {
    running: false,
    lastStopAt: Date.now(),
  };
}
