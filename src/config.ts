/**
 * 配置工具函数
 * 
 * 统一读取和解析插件配置，内部仅使用 canonical 结构：
 * - defaults
 * - accounts
 *
 * 旧格式仅在入口做一次映射，然后后续逻辑只读取 canonical。
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { PLUGIN_ID, DEFAULT_CONFIG, BRIDGE_URL } from "./constants.js";

type SingleAccountFields = {
  apiKey?: string;
  pollIntervalMs?: number;
  sessionKey?: string;
  sessionKeyPrefix?: string;
  debug?: boolean;
};

type DefaultsConfig = {
  pollIntervalMs?: number;
  debug?: boolean;
};

type AccountConfig = {
  apiKey?: string;
  pollIntervalMs?: number;
  sessionKey?: string;
  debug?: boolean;
  enabled?: boolean;
};

type PluginEntry = {
  config?: unknown;
  defaults?: unknown;
  accounts?: unknown;
  // 极旧遗留：字段直接写在 entries[PLUGIN_ID] 下
  apiKey?: unknown;
  pollIntervalMs?: unknown;
  sessionKey?: unknown;
  sessionKeyPrefix?: unknown;
  debug?: unknown;
};

/**
 * 插件配置类型
 */
export interface PluginConfig {
  bridgeUrl: string; // 从常量读取，不在配置中
  apiKey?: string;
  pollIntervalMs: number;
  sessionKey: string;
  debug: boolean;
}

type CanonicalPluginConfig = {
  defaults: DefaultsConfig;
  accounts: Record<string, AccountConfig>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getPluginEntry(cfg?: OpenClawConfig): PluginEntry | undefined {
  return cfg?.plugins?.entries?.[PLUGIN_ID] as PluginEntry | undefined;
}

function pickSingleAccountFields(value: unknown): SingleAccountFields {
  const obj = asRecord(value);
  const out: SingleAccountFields = {};
  if (typeof obj.apiKey === "string") out.apiKey = obj.apiKey;
  if (typeof obj.pollIntervalMs === "number") out.pollIntervalMs = obj.pollIntervalMs;
  if (typeof obj.sessionKey === "string") out.sessionKey = obj.sessionKey;
  if (typeof obj.sessionKeyPrefix === "string") out.sessionKeyPrefix = obj.sessionKeyPrefix;
  if (typeof obj.debug === "boolean") out.debug = obj.debug;
  return out;
}

function hasSingleFields(value: unknown): boolean {
  const picked = pickSingleAccountFields(value);
  return Object.keys(picked).length > 0;
}

function mapSingleToDefaultAccount(single: SingleAccountFields): AccountConfig {
  return {
    apiKey: single.apiKey,
    pollIntervalMs: single.pollIntervalMs,
    sessionKey: single.sessionKey ?? single.sessionKeyPrefix,
    debug: single.debug,
    enabled: true,
  };
}

function normalizePluginConfigShape(cfg?: OpenClawConfig): CanonicalPluginConfig {
  const entry = getPluginEntry(cfg);
  const payload = asRecord(entry?.config);
  const payloadConfig = asRecord(payload.config);
  const payloadDefaults = asRecord(payload.defaults) as DefaultsConfig;
  const payloadAccounts = asRecord(payload.accounts) as Record<string, AccountConfig>;
  const siblingDefaults = asRecord(entry?.defaults) as DefaultsConfig;
  const siblingAccounts = asRecord(entry?.accounts) as Record<string, AccountConfig>;
  const entryLevelSingle = pickSingleAccountFields(entry);
  const payloadSingle = pickSingleAccountFields(payload);
  const payloadConfigSingle = pickSingleAccountFields(payloadConfig);

  const out: CanonicalPluginConfig = {
    defaults: {},
    accounts: {},
  };

  // 1) 新结构：config.accounts/defaults
  if (Object.keys(payloadAccounts).length > 0 || Object.keys(payloadDefaults).length > 0) {
    out.defaults = payloadDefaults;
    out.accounts = payloadAccounts;
  } else if (Object.keys(payloadConfig).length > 0) {
    // 2) 新结构（单账户推荐写法）：config.config = {...single}
    // 或 config.config.accounts/defaults（容错）
    const nestedAccounts = asRecord(payloadConfig.accounts) as Record<string, AccountConfig>;
    const nestedDefaults = asRecord(payloadConfig.defaults) as DefaultsConfig;
    if (Object.keys(nestedAccounts).length > 0 || Object.keys(nestedDefaults).length > 0) {
      out.defaults = nestedDefaults;
      out.accounts = nestedAccounts;
    } else if (hasSingleFields(payloadConfig)) {
      out.accounts.default = mapSingleToDefaultAccount(payloadConfigSingle);
    }
  } else if (hasSingleFields(payload)) {
    // 3) 旧结构：entries[PLUGIN_ID].config 平铺单账户字段
    out.accounts.default = mapSingleToDefaultAccount(payloadSingle);
  } else if (Object.keys(siblingAccounts).length > 0 || Object.keys(siblingDefaults).length > 0) {
    // 4) 过渡结构：entries[PLUGIN_ID].accounts/defaults
    out.defaults = siblingDefaults;
    out.accounts = siblingAccounts;
  } else if (hasSingleFields(entry)) {
    // 5) 极旧结构：字段直接在 entries[PLUGIN_ID] 下
    out.accounts.default = mapSingleToDefaultAccount(entryLevelSingle);
  }

  // 若 multi 结构中缺 default，且检测到旧单账户字段，则用旧字段补 default。
  if (!out.accounts.default) {
    const fallbackSingle =
      hasSingleFields(payloadConfig)
        ? payloadConfigSingle
        : hasSingleFields(payload)
          ? payloadSingle
          : entryLevelSingle;
    if (fallbackSingle.apiKey) {
      out.accounts.default = mapSingleToDefaultAccount(fallbackSingle);
    }
  }

  return out;
}

function hasAccounts(accounts: Record<string, AccountConfig>): boolean {
  return Object.keys(accounts).length > 0;
}

function isAccountEnabledRaw(account?: AccountConfig): boolean {
  return account?.enabled !== false;
}

function resolveAccountSource(
  cfg?: OpenClawConfig,
  accountId = "default",
): {
  defaults: DefaultsConfig;
  account?: AccountConfig;
} {
  const { defaults, accounts } = normalizePluginConfigShape(cfg);

  if (!hasAccounts(accounts)) {
    return { defaults, account: undefined };
  }

  const account = accounts?.[accountId];
  return { defaults, account };
}

/**
 * 从 OpenClaw 配置中读取插件配置
 * 
 * @param cfg - OpenClaw 配置对象
 * @param accountId - 账户 ID（默认 default）
 * @returns 解析后的插件配置
 */
export function getPluginConfig(cfg?: OpenClawConfig, accountId = "default"): PluginConfig {
  const { defaults, account } = resolveAccountSource(cfg, accountId);
  const rawSessionKey = account?.sessionKey;

  return {
    bridgeUrl: BRIDGE_URL, // 使用代码常量，不从配置读取
    apiKey: account?.apiKey,
    pollIntervalMs: account?.pollIntervalMs ?? defaults.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs,
    sessionKey: rawSessionKey ?? DEFAULT_CONFIG.sessionKey,
    debug: account?.debug ?? defaults.debug ?? DEFAULT_CONFIG.debug,
  };
}

/**
 * 列举账户 ID（过滤 enabled=false）
 */
export function listAccountIds(cfg?: OpenClawConfig): string[] {
  const { accounts } = normalizePluginConfigShape(cfg);

  if (!hasAccounts(accounts)) {
    return ["default"];
  }

  const ids = Object.entries(accounts ?? {})
    .filter(([, account]) => isAccountEnabledRaw(account))
    .map(([id]) => id);

  return ids;
}

/**
 * 账户是否启用
 */
export function isAccountEnabled(cfg?: OpenClawConfig, accountId = "default"): boolean {
  const { accounts } = normalizePluginConfigShape(cfg);
  if (!hasAccounts(accounts)) {
    return true;
  }
  const account = accounts?.[accountId];
  return isAccountEnabledRaw(account);
}

function isValidSessionKeyFormat(key?: string): boolean {
  const raw = key?.trim();
  if (!raw) return false;
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3) return false;
  if (parts[0]?.toLowerCase() !== "agent") return false;
  if (!parts[1]?.trim()) return false;
  return Boolean(parts.slice(2).join(":").trim());
}

export function validatePluginConfig(cfg?: OpenClawConfig): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const { defaults, accounts } = normalizePluginConfigShape(cfg);

  if (!hasAccounts(accounts)) {
    errors.push("至少需要一个账户配置（accounts.default）");
    return { ok: false, errors };
  }

  if (defaults.pollIntervalMs !== undefined && (defaults.pollIntervalMs < 500 || defaults.pollIntervalMs > 60000)) {
    errors.push("defaults.pollIntervalMs 必须在 500-60000 之间");
  }

  const sessionKeys = new Set<string>();
  for (const [id, account] of Object.entries(accounts ?? {})) {
    if (!account || account.enabled === false) continue;
    if (!account.apiKey?.trim()) {
      errors.push(`accounts.${id}.apiKey 必填`);
    }
    if (
      account.pollIntervalMs !== undefined &&
      (account.pollIntervalMs < 500 || account.pollIntervalMs > 60000)
    ) {
      errors.push(`accounts.${id}.pollIntervalMs 必须在 500-60000 之间`);
    }
    if (id !== "default" && !account.sessionKey?.trim()) {
      errors.push(`accounts.${id}.sessionKey 必填（非 default 账户）`);
    }
    if (account.sessionKey?.trim()) {
      if (!isValidSessionKeyFormat(account.sessionKey)) {
        errors.push(`accounts.${id}.sessionKey 格式错误，应为 agent:<agentId>:<rest>`);
      } else {
        const normalized = account.sessionKey.trim();
        if (sessionKeys.has(normalized)) {
          errors.push(`sessionKey 重复：${normalized}`);
        }
        sessionKeys.add(normalized);
      }
    }
  }

  if (!accounts?.default?.apiKey?.trim()) {
    errors.push("accounts.default.apiKey 必填");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/**
 * 检查配置是否有效（API Key 是否存在）
 * 
 * @param config - 插件配置
 * @returns 是否已配置
 */
export function isConfigValid(config: PluginConfig): boolean {
  return Boolean(config.apiKey?.trim());
}
