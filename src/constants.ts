/**
 * 插件常量定义
 * 
 * 统一管理插件 ID、Channel ID、版本号等常量，避免硬编码
 */

/**
 * 插件版本号
 * 更新版本时，请同步更新以下文件：
 * - package.json
 * - openclaw.plugin.json
 * - index.ts（引用此常量）
 */
export const PLUGIN_VERSION = "1.0.11";

/**
 * 插件 ID（必须与 openclaw.plugin.json 中的 id 一致）
 */
export const PLUGIN_ID = "openclawwechat";

/**
 * Channel ID（必须与 openclaw.plugin.json 中的 openclaw.channel.id 一致）
 */
export const CHANNEL_ID = "openclawwechat";

/**
 * 中转服务器 URL（硬编码在代码中，不通过配置文件配置）
 * 这样升级时不需要修改配置文件
 */
export const BRIDGE_URL = "https://api.clawchat.mifengcdn.com";

/**
 * 配置默认值（与 openclaw.plugin.json 中的 configSchema.default 保持一致）
 */
export const DEFAULT_CONFIG = {
  pollIntervalMs: 2000,
  sessionKeyPrefix: "agent:main:wechat:miniprogram:",
  debug: false,
} as const;
