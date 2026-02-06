/**
 * 配置工具函数
 * 
 * 统一读取和解析插件配置，使用 configSchema 中定义的默认值
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { PLUGIN_ID, DEFAULT_CONFIG, BRIDGE_URL } from "./constants.js";

/**
 * 插件配置类型
 */
export interface PluginConfig {
  bridgeUrl: string; // 从常量读取，不在配置中
  apiKey?: string;
  pollIntervalMs: number;
  sessionKeyPrefix: string;
  debug: boolean;
}

/**
 * 从 OpenClaw 配置中读取插件配置
 * 
 * @param cfg - OpenClaw 配置对象
 * @returns 解析后的插件配置
 */
export function getPluginConfig(cfg?: OpenClawConfig): PluginConfig {
  const pluginConfig = cfg?.plugins?.entries?.[PLUGIN_ID]?.config || {};
  
  return {
    bridgeUrl: BRIDGE_URL, // 使用代码常量，不从配置读取
    apiKey: pluginConfig.apiKey,
    pollIntervalMs: pluginConfig.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs,
    sessionKeyPrefix: pluginConfig.sessionKeyPrefix || DEFAULT_CONFIG.sessionKeyPrefix,
    debug: pluginConfig.debug ?? DEFAULT_CONFIG.debug,
  };
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
