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

import type { GatewayStartContext } from "openclaw/plugin-sdk/core";
import { parseTelegramUpdate } from "./message-parser.js";
import { downloadMedia } from "./media-handler.js";
import { injectMessage } from "./message-injector.js";
import { DEFAULT_CONFIG, BRIDGE_URL } from "./constants.js";
import { redactUploadApiUrl } from "./log-redaction.js";

/** 插件日志接口：info/warn 仅在 debug 时输出，error 始终输出 */
type PluginLog = {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
};

/**
 * 根据 config.debug 包装原始 log：debug=true 时 info/warn 照常，debug=false 时 info/warn 不输出，error 始终输出
 */
function wrapLogByDebug(raw: PluginLog | undefined, debug: boolean): PluginLog {
  if (!raw) return {};
  return {
    info: debug && raw.info ? (msg) => raw.info?.(msg) : () => {},
    warn: debug && raw.warn ? (msg) => raw.warn?.(msg) : () => {},
    error: raw.error ? (msg) => raw.error?.(msg) : undefined,
  };
}

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
  const { account, abortSignal, log: rawLog, deps } = ctx;
  const config = account.config;
  const debug = config.debug ?? DEFAULT_CONFIG.debug;
  const log = wrapLogByDebug(rawLog, debug);
  const setStatus =
    typeof (ctx as { setStatus?: unknown }).setStatus === "function"
      ? ((ctx as { setStatus: (patch: Record<string, unknown>) => void }).setStatus)
      : undefined;

  log?.info?.(`[${account.accountId}] Starting WeChat MiniProgram polling service`);

  // bridgeUrl 使用代码常量，不从配置读取
  const apiKey = config.apiKey;
  const pollInterval = config.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs;
  log?.info?.(`[${account.accountId}] Polling interval: ${pollInterval}ms`);

  // 预先读取 Gateway 配置（用于 HTTP API 备选方案）
  const gatewayConfig = deps?.config?.gateway || {};
  const gatewayPort = gatewayConfig.port || 18789;
  const gatewayToken = gatewayConfig.auth?.token || "";
  log?.info?.(`[${account.accountId}] Gateway config: port=${gatewayPort}, token=${gatewayToken ? '***' + gatewayToken.slice(-4) : 'NOT FOUND'}`);

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
  const accountId = account.accountId;

  let offset = 0;
  let pollingTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let accountBlocked = false;
  let finished = false;
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

  const emitStatus = (patch: Record<string, unknown>) => {
    setStatus?.({
      accountId,
      ...patch,
    });
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
    
    if (health.pollCount % 10 === 0) {
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
      emitStatus({
        running: true,
        connected: true,
        lastEventAt: Date.now(),
        lastError: null,
      });
      
      if (data.result?.length === 0) {
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
            log?.info?.(`[${account.accountId}] Skip duplicated update_id=${update.update_id}`);
            maxUpdateId = Math.max(maxUpdateId, update.update_id);
            continue;
          }
          // 3. 解析消息
          const parsedMessage = parseTelegramUpdate(update, account.accountId, log);
          if (!parsedMessage) {
            log?.info?.(`[${account.accountId}] Skipping update without message: update_id=${update.update_id}, type=${Object.keys(update).join(',')}`);
            if (typeof update?.update_id === "number") {
              rememberUpdateId(update.update_id);
            }
            continue;
          }
          
          // 记录 uploadAPIURL（用于调试）
          if (parsedMessage.uploadAPIURL) {
            log?.info?.(
              `[${account.accountId}] Backend provided upload API URL: ${redactUploadApiUrl(parsedMessage.uploadAPIURL)}`,
            );
          } else {
            log?.warn?.(`[${account.accountId}] No upload API URL provided for update_id=${parsedMessage.updateId}`);
          }
          
          try {
            // 4. 下载媒体（如果有）
            const mediaInfo = await downloadMedia(
              parsedMessage.mediaUrls,
              parsedMessage.mediaTypes,
              parsedMessage.mediaFileNames || [],
              account.accountId,
              log
            );
            
            // 5. 下载/拉取完成后立即标记已处理，避免 injectMessage 耗时期间 gateway 重启导致同一条被再次拉取、重复下载（injectMessage 会等 Agent 回复，可能很久）
            try {
              await fetch(`${BRIDGE_URL}/bot${encodedAPIKey}/markProcessed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message_ids: [parsedMessage.updateId] }),
              });
            } catch (markErr) {
              log?.warn?.(`[${account.accountId}] Failed to mark update_id=${parsedMessage.updateId} as processed: ${markErr}`);
            }
            
            // 6. 注入消息到 OpenClaw（可能耗时较长）
            await injectMessage(
              {
                openid: parsedMessage.openid,
                updateId: parsedMessage.updateId,
                text: parsedMessage.text,
                mediaUrls: mediaInfo.mediaUrls,
                mediaTypes: parsedMessage.mediaTypes,
                mediaPaths: mediaInfo.mediaPaths,
                uploadAPIURL: parsedMessage.uploadAPIURL,
                isVoice: parsedMessage.isVoice,
                chatId: parsedMessage.chatId,
                chatType: parsedMessage.chatType,
                needReply: parsedMessage.needReply,
              },
              {
                accountId: account.accountId,
                apiKey,
              },
              log
            );
            
            processedCount++;
            emitStatus({
              running: true,
              connected: true,
              lastInboundAt: Date.now(),
              lastEventAt: Date.now(),
              lastError: null,
            });
          } catch (error) {
            log?.error?.(`[${account.accountId}] Failed to process message: update_id=${parsedMessage.updateId}, error=${error}`);
            // 继续处理其他消息，不中断轮询
          }
          
          // 7. 更新 maxUpdateId 与去重缓存
          maxUpdateId = Math.max(maxUpdateId, parsedMessage.updateId);
          rememberUpdateId(parsedMessage.updateId);
        }
        
        // 8. 推进 offset
        if (maxUpdateId > 0) {
          offset = maxUpdateId + 1;
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
        emitStatus({
          running: false,
          connected: false,
          lastError: classified.message,
        });
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
  emitStatus({
    running: true,
    connected: true,
    lastStartAt: Date.now(),
    lastStopAt: null,
    lastError: null,
  });
  poll();
  
  const cleanup = () => {
    if (finished) {
      return;
    }
    finished = true;
    stopped = true;
    accountBlocked = true;
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = null;
    }
    activeCleanupByAccount.delete(account.accountId);
    emitStatus({
      running: false,
      connected: false,
      lastStopAt: Date.now(),
    });
    log?.info?.(`[${account.accountId}] Polling service cleaned up`);
  };

  activeCleanupByAccount.set(account.accountId, cleanup);
  await new Promise<void>((resolve) => {
    const finish = () => {
      cleanup();
      resolve();
    };
    abortSignal.addEventListener("abort", finish, { once: true });
  });
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
  const { account, log: rawLog } = ctx;
  const debug = account?.config?.debug ?? DEFAULT_CONFIG.debug;
  const log = wrapLogByDebug(rawLog, debug);

  log?.info?.(`[${account.accountId}] Stopping WeChat MiniProgram polling service`);

  runPollingCleanup(account.accountId);

  return {
    running: false,
    lastStopAt: Date.now(),
  };
}
