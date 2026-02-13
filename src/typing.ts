/**
 * Typing 状态通知模块
 * 
 * 在 OpenClaw 开始处理消息时，通知后端广播「正在输入」状态给小程序
 */

import { BRIDGE_URL } from "./constants.js";

/**
 * 通知后端：正在输入状态
 * 后端会通过 WebSocket 广播给对应用户，小程序显示「正在输入」
 */
export async function notifyTyping(
  apiKey: string,
  status: "start" | "stop",
  log?: { info?: (msg: string) => void; error?: (msg: string) => void }
): Promise<void> {
  const encodedAPIKey = apiKey.replace(/:/g, "%3A");
  const url = `${BRIDGE_URL}/bot${encodedAPIKey}/typing`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      log?.error?.(`typing notify failed: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    log?.error?.(`typing notify failed: ${err}`);
  }
}
