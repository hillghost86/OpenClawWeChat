/**
 * 自动补写 channels sentinel。
 *
 * 当插件被宿主加载时（模块 import），检查 openclaw.json 中是否已有
 * channels.openclawwechat 条目。若缺失则自动补写 { mode: "polling" }，
 * 确保升级场景（如 1.2.5 → 1.3.0）下通道能被宿主正确识别和激活。
 */

import fs from "fs";
import path from "node:path";
import { PLUGIN_ID } from "./constants.js";

declare const process: { env: Record<string, string | undefined> } | undefined;

function getConfigPath(): string {
  const home = process?.env?.HOME || process?.env?.USERPROFILE || "";
  return path.join(home, ".openclaw", "openclaw.json");
}

export function ensureChannelSentinel(): void {
  try {
    const cfgPath = getConfigPath();
    if (!fs.existsSync(cfgPath)) return;

    const raw = fs.readFileSync(cfgPath, "utf-8");
    const cfg = JSON.parse(raw);

    if (cfg?.channels?.[PLUGIN_ID]?.mode) return;

    if (!cfg.channels || typeof cfg.channels !== "object") {
      cfg.channels = {};
    }
    cfg.channels[PLUGIN_ID] = {
      ...(cfg.channels[PLUGIN_ID] ?? {}),
      mode: "polling",
    };

    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
  } catch {
    // 静默失败：不阻塞插件加载
  }
}
