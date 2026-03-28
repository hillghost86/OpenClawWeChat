import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { ChannelSetupWizard } from "openclaw/plugin-sdk/channel-setup";
import type { ChannelSetupAdapter, ChannelSetupInput } from "openclaw/plugin-sdk/setup";
import { createStandardChannelSetupStatus } from "openclaw/plugin-sdk/setup";
import { CHANNEL_ID, DEFAULT_CONFIG } from "./constants.js";
import {
  applyCanonicalPluginConfigToOpenClawConfig,
  getCanonicalPluginConfigShape,
  isPluginConfigured,
} from "./config.js";

function validateApiKey(value: string | null | undefined): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return "API Key 不能为空";
  const parts = raw.split(":");
  if (parts.length !== 2) return "格式应为 bot_id:secret";
  if (!/^\d+$/.test(parts[0] ?? "")) return "bot_id 应为数字";
  if (!(parts[1] ?? "").trim()) return "secret 不能为空";
  return undefined;
}

function validateSessionKey(value: string | null | undefined): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3) return "格式应为 agent:<agentId>:<rest>";
  if ((parts[0] ?? "").toLowerCase() !== "agent") return "必须以 agent: 开头";
  if (!(parts[1] ?? "").trim()) return "agentId 不能为空";
  if (!parts.slice(2).join(":").trim()) return "第三段及之后不能为空";
  return undefined;
}

function parsePollInterval(raw: string | null | undefined, fallback: number): { value: number; error?: string } {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { value: fallback };
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 60000) {
    return { value: fallback, error: "轮询间隔必须在 2000-60000 毫秒之间" };
  }
  return { value: parsed };
}

function parseDebugInput(raw: string | null | undefined): { value: boolean; error?: string } {
  const trimmed = String(raw ?? "").trim().toLowerCase();
  if (["y", "yes", "true", "1", "on"].includes(trimmed)) {
    return { value: true };
  }
  if (["n", "no", "false", "0", "off"].includes(trimmed)) {
    return { value: false };
  }
  return { value: false, error: "请输入 y/yes/true 或 n/no/false" };
}

function patchDefaultAccountConfig(params: {
  cfg: OpenClawConfig;
  patch?: {
    apiKey?: string;
    sessionKey?: string | null;
    pollIntervalMs?: number;
    debug?: boolean;
  };
}): OpenClawConfig {
  const canonical = getCanonicalPluginConfigShape(params.cfg);
  const currentDefaults = canonical.defaults ?? {};
  const currentDefault = canonical.accounts.default ?? {};
  const patch = params.patch ?? {};

  const nextDefault = {
    ...currentDefault,
    enabled: true,
    ...(patch.apiKey !== undefined ? { apiKey: patch.apiKey.trim() } : {}),
    ...(patch.sessionKey === undefined
      ? {}
      : patch.sessionKey === null
        ? {}
        : patch.sessionKey.trim()
          ? { sessionKey: patch.sessionKey.trim() }
          : {}),
  };

  if (patch.sessionKey === null) {
    delete nextDefault.sessionKey;
  }

  const nextDefaults = {
    ...currentDefaults,
    ...(patch.pollIntervalMs !== undefined ? { pollIntervalMs: patch.pollIntervalMs } : {}),
    ...(patch.debug !== undefined ? { debug: patch.debug } : {}),
  };

  return applyCanonicalPluginConfigToOpenClawConfig({
    cfg: params.cfg,
    payload: {
      defaults: nextDefaults,
      accounts: {
        ...canonical.accounts,
        default: nextDefault,
      },
    },
  });
}

function inspectDefaultAccount(cfg: OpenClawConfig) {
  const canonical = getCanonicalPluginConfigShape(cfg);
  return {
    defaults: canonical.defaults ?? {},
    account: canonical.accounts.default ?? {},
  };
}

type WechatSetupInput = ChannelSetupInput & {
  token?: string;
  httpPort?: string;
  userId?: string;
  code?: string;
};

export const wechatMiniprogramSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: () => "default",
  validateInput: ({ input }: { input: ChannelSetupInput }) => {
    const typedInput = input as WechatSetupInput;

    if (typeof typedInput.token === "string") {
      return validateApiKey(typedInput.token) ?? null;
    }
    if (typeof typedInput.httpPort === "string") {
      return parsePollInterval(typedInput.httpPort, DEFAULT_CONFIG.pollIntervalMs).error ?? null;
    }
    if (typeof typedInput.userId === "string") {
      return validateSessionKey(typedInput.userId) ?? null;
    }
    if (typeof typedInput.code === "string") {
      return parseDebugInput(typedInput.code).error ?? null;
    }
    return null;
  },
  applyAccountConfig: ({ cfg, input }: { cfg: OpenClawConfig; input: ChannelSetupInput }) => {
    const typedInput = input as WechatSetupInput;

    if (typeof typedInput.token === "string") {
      return patchDefaultAccountConfig({
        cfg,
        patch: { apiKey: typedInput.token },
      });
    }

    if (typeof typedInput.httpPort === "string") {
      const parsed = parsePollInterval(typedInput.httpPort, DEFAULT_CONFIG.pollIntervalMs);
      return patchDefaultAccountConfig({
        cfg,
        patch: { pollIntervalMs: parsed.value },
      });
    }

    if (typeof typedInput.userId === "string") {
      return patchDefaultAccountConfig({
        cfg,
        patch: { sessionKey: typedInput.userId.trim() ? typedInput.userId : null },
      });
    }

    if (typeof typedInput.code === "string") {
      const parsed = parseDebugInput(typedInput.code);
      return patchDefaultAccountConfig({
        cfg,
        patch: { debug: parsed.value },
      });
    }

    return patchDefaultAccountConfig({ cfg });
  },
};

export const wechatMiniprogramSetupWizard: ChannelSetupWizard = {
  channel: CHANNEL_ID,
  status: createStandardChannelSetupStatus({
    channelLabel: "OpenClawWeChat",
    configuredLabel: "已配置",
    unconfiguredLabel: "未配置",
    configuredHint: "已配置 default 账户，可直接使用。",
    unconfiguredHint: "需要先配置 ClawChat API Key 才能使用。",
    includeStatusLine: true,
    resolveConfigured: async ({ cfg }: { cfg: OpenClawConfig }) => isPluginConfigured(cfg),
    resolveExtraStatusLines: ({ cfg }: { cfg: OpenClawConfig }) => {
      const canonical = getCanonicalPluginConfigShape(cfg);
      return [`Accounts: ${Object.keys(canonical.accounts ?? {}).length}`];
    },
  }),
  introNote: {
    title: "OpenClawWeChat",
    lines: [
      "本向导当前先完成 default 账户与默认配置初始化。",
      "多账户增删改需要使用 config-init CLI 工具进行配置，进入插件目录，执行：npm run config-init",
    ],
  },
  resolveAccountIdForConfigure: () => "default",
  credentials: [
    {
      inputKey: "token",
      providerHint: CHANNEL_ID,
      credentialLabel: "ClawChat API Key",
      helpTitle: "ClawChat API Key",
      helpLines: [
        "API Key 格式：bot_id:secret",
        "API Key 可从微信小程序 ClawChat 中获取，并复制使用。",
      ],
      envPrompt: "检测到环境变量中的 ClawChat API Key。使用它吗？",
      keepPrompt: "当前 ClawChat API Key 已配置，保留它吗？",
      inputPrompt: "请输入 ClawChat API Key",
      inspect: ({ cfg }: { cfg: OpenClawConfig }) => {
        const { account } = inspectDefaultAccount(cfg);
        const apiKey = typeof account.apiKey === "string" ? account.apiKey.trim() : "";
        return {
          accountConfigured: Boolean(apiKey),
          hasConfiguredValue: Boolean(apiKey),
          resolvedValue: apiKey || undefined,
        };
      },
    },
  ],
  textInputs: [
    {
      inputKey: "httpPort",
      message: "默认轮询间隔（毫秒）",
      placeholder: String(DEFAULT_CONFIG.pollIntervalMs),
      currentValue: ({ cfg }: { cfg: OpenClawConfig }) => {
        const { defaults } = inspectDefaultAccount(cfg);
        return String(defaults.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs);
      },
      validate: ({ value, cfg }: { value: string; cfg: OpenClawConfig }) =>
        parsePollInterval(
          value,
          inspectDefaultAccount(cfg).defaults.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs,
        ).error,
    },
    {
      inputKey: "code",
      message: "启用调试日志？(y/n)",
      placeholder: DEFAULT_CONFIG.debug ? "y" : "n",
      currentValue: ({ cfg }: { cfg: OpenClawConfig }) => {
        const { defaults } = inspectDefaultAccount(cfg);
        return defaults.debug ?? DEFAULT_CONFIG.debug ? "y" : "n";
      },
      validate: ({ value }: { value: string }) => parseDebugInput(value).error,
      normalizeValue: ({ value }: { value: string }) => (parseDebugInput(value).value ? "y" : "n"),
      keepPrompt: (value: string) =>
        `调试日志当前为 ${parseDebugInput(value).value ? "开启" : "关闭"}，保留吗？`,
    },
    {
      inputKey: "userId",
      message: "default.sessionKey（可空）",
      placeholder: DEFAULT_CONFIG.sessionKey,
      required: false,
      applyEmptyValue: true,
      currentValue: ({ cfg }: { cfg: OpenClawConfig }) => {
        const { account } = inspectDefaultAccount(cfg);
        return typeof account.sessionKey === "string" ? account.sessionKey : "";
      },
      validate: ({ value }: { value: string }) => validateSessionKey(value),
      keepPrompt: (value: string) => `default.sessionKey 当前为 ${value}，保留吗？`,
    },
  ],
  completionNote: {
    title: "OpenClawWeChat",
    lines: [
      "OpenClawWeChat 已写入 canonical 配置。",
      "如需新增 / 删除多账户，请使用 config-init CLI 工具进行配置。",
      "进入插件目录，执行：npm run config-init",
    ],
  },
};
