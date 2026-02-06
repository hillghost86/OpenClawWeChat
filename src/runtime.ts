/**
 * Runtime 管理模块
 * 
 * 用于存储和访问 OpenClaw Plugin Runtime
 */

import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

/**
 * 设置 Runtime
 * 
 * @param next - Plugin Runtime 实例
 */
export function setWechatMiniprogramRuntime(next: PluginRuntime) {
  runtime = next;
}

/**
 * 获取 Runtime
 * 
 * @returns Plugin Runtime 实例
 * @throws 如果 Runtime 未初始化则抛出错误
 */
export function getWechatMiniprogramRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("WeChat MiniProgram runtime not initialized");
  }
  return runtime;
}
