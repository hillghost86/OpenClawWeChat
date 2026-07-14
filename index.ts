/**
 * OpenClaw Channel Plugin 标准入口。
 *
 * 使用官方 defineChannelPluginEntry helper 对齐新版插件系统：
 * - 设置 PluginRuntime
 * - 注册 channel capability
 * - 复用统一的 setup-only / full 模式装载逻辑
 */

import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { wechatMiniprogramPlugin } from "./src/channel.js";
import { setWechatMiniprogramRuntime } from "./src/runtime.js";
import { PLUGIN_ID } from "./src/constants.js";
import { ensureChannelSentinel } from "./src/ensure-sentinel.js";

const pluginConfigSchema = {
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      apiKey: { type: "string" },
      pollIntervalMs: { type: "number", minimum: 500, maximum: 60000 },
      sessionKey: { type: "string" },
      sessionKeyPrefix: { type: "string" },
      debug: { type: "boolean" },
      config: { type: "object" },
      defaults: { type: "object" },
      accounts: { type: "object" },
    },
    required: [],
  },
  uiHints: {
    apiKey: {
      label: "API Key",
      help: "兼容旧单账户配置，格式为 bot_id:secret。",
      sensitive: true,
    },
    pollIntervalMs: {
      label: "轮询间隔",
      help: "兼容旧单账户配置，单位毫秒。",
      advanced: true,
    },
    sessionKey: {
      label: "Session Key",
      help: "兼容旧单账户配置，建议格式 agent:<agentId>:<rest>。",
      advanced: true,
    },
    sessionKeyPrefix: {
      label: "Session Key Prefix",
      help: "已弃用，仅保留旧配置兼容。",
      advanced: true,
    },
    debug: {
      label: "调试日志",
      help: "兼容旧单账户配置，开启详细日志输出。",
      advanced: true,
    },
    config: {
      label: "单账户配置",
      help: "兼容单账户配置写法，后续推荐使用 defaults + accounts。",
    },
    defaults: {
      label: "默认配置",
      help: "多账户默认配置。",
    },
    accounts: {
      label: "账户列表",
      help: "多账户配置，推荐写法。",
    },
  },
} as const;

const plugin = defineChannelPluginEntry({
  id: PLUGIN_ID,
  name: "OpenClawWeChat",
  description: "OpenClawWeChat - WeChat MiniProgram channel plugin for OpenClaw",
  plugin: wechatMiniprogramPlugin,
  configSchema: pluginConfigSchema,
  setRuntime: setWechatMiniprogramRuntime,
});

// 插件展示版本以 openclaw.plugin.json（manifest）为准，宿主不读取导出对象上的 version 字段。

// 插件被宿主加载时自动补写 channels sentinel，确保升级场景下通道能被正确激活。
ensureChannelSentinel();

export default plugin;
