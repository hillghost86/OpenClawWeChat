/**
 * OpenClaw Channel Plugin 入口文件
 * 
 * 这是插件的入口点，负责：
 * 1. 定义插件元数据
 * 2. 注册 Channel Plugin
 * 3. 初始化 Runtime
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { wechatMiniprogramPlugin } from "./src/channel.js";
import { setWechatMiniprogramRuntime } from "./src/runtime.js";
import { PLUGIN_ID, PLUGIN_VERSION } from "./src/constants.js";

const plugin = {
  id: PLUGIN_ID,
  name: "WeChat MiniProgram",
  description: "WeChat MiniProgram channel plugin for OpenClaw",
  version: PLUGIN_VERSION,
  
  // 配置 Schema
  // 如果不需要配置，使用 emptyPluginConfigSchema()
  // 如果需要配置，定义 JSON Schema
  configSchema: emptyPluginConfigSchema(),
  
  /**
   * 插件注册函数
   * OpenClaw 加载插件时会调用此函数
   * 
   * @param api - OpenClaw Plugin API
   */
  register(api: OpenClawPluginApi) {
    // 1. 设置 Runtime（用于访问 OpenClaw 运行时）
    setWechatMiniprogramRuntime(api.runtime);
    
    // 2. 注册 Channel Plugin
    // Channel Plugin 的消息处理通过 inbound 和 outbound 接口完成
    // 不需要手动监听 chat 事件
    api.registerChannel({ plugin: wechatMiniprogramPlugin });
  },
};

export default plugin;
