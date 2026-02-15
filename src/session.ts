/**
 * Session 管理模块
 *
 * 直接使用 sessionKey 作为 session（默认为 agent:main:main）
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { getPluginConfig } from "./config.js";
import { DEFAULT_CONFIG } from "./constants.js";

export interface SessionResult {
  sessionKey: string;
  mainSessionKey: string;
  agentId: string;
  fromRoute: boolean;
}

/** OpenClaw 要求：agent:<agentId>:<rest>，至少 3 段 */
function isValidSessionKeyFormat(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  const raw = key.trim();
  if (!raw) return false;
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3) return false;
  if (parts[0]?.toLowerCase() !== "agent") return false;
  if (!parts[1]?.trim()) return false;
  const rest = parts.slice(2).join(":");
  if (!rest.trim()) return false;
  return true;
}

function parseAgentIdFromSessionKey(sessionKey: string): string {
  const parts = (sessionKey || "").trim().split(":");
  if (parts.length >= 2 && parts[0]?.toLowerCase() === "agent") {
    return parts[1]?.trim() || "main";
  }
  return "main";
}

/**
 * 解析 session，直接使用 sessionKey
 */
export function resolveSession(params: {
  cfg: OpenClawConfig;
  apiKey: string;
  accountId: string;
  openid: string;
  runtime?: unknown;
}): SessionResult {
  const pluginConfig = getPluginConfig(params.cfg);
  const raw = (pluginConfig.sessionKey ?? "").trim();
  const sessionKey =
    raw && isValidSessionKeyFormat(raw) ? raw : DEFAULT_CONFIG.sessionKey;

  const agentId = parseAgentIdFromSessionKey(sessionKey);
  return {
    sessionKey,
    mainSessionKey: sessionKey,
    agentId,
    fromRoute: false,
  };
}
