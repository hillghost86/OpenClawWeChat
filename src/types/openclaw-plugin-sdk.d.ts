// 本地 openclaw plugin-SDK 类型声明（精准子集）。
//
// openclaw 的真实类型经 `openclaw/plugin-sdk/*` 导出，指向其构建产物 dist/*.d.ts；
// 本仓库未构建 openclaw dist，无法解析真实声明。此文件按 openclaw 2026.7.2 的真实
// 契约（src/channels/plugins/types.{plugin,adapters,core}.ts、src/plugins/runtime/*）
// 手写本插件实际用到的子集，以恢复类型检查。
//
// 策略：对「本次 SDK 迁移会变形的面」严格建模（ChannelPlugin 对象形状、
// ChannelGatewayContext、ChannelAccountSnapshot、ChannelMeta），以便 tsc 兜住不匹配；
// 对「插件仅消费、且未变更」的面（PluginRuntime 注入帮助函数、config/outbound/status
// 的回调入参、OpenClawConfig 深层字段、setup 三件套）保持宽松，避免插件自有的
// *Like 宽松入参类型触发假阳性。

declare module "openclaw/plugin-sdk/core" {
  // ---- 基础别名 ----
  export type ChannelId = string;
  export type ChatType = "direct" | "group";

  /** CLI/IO 环境句柄（仅 log/error/exit），不能用于调用 gateway。 */
  export type RuntimeEnv = { log: unknown; error: unknown; exit: unknown };

  /** 宽松的全局配置形状：插件深层读写 plugins.entries / channels / session.store 等。 */
  export type OpenClawConfig = { [key: string]: any };

  export type OpenClawPluginApi = { [key: string]: any };

  /** channelRuntime 最小兼容面；运行时注入完整 PluginRuntimeChannel。 */
  export type ChannelRuntimeSurface = { [key: string]: any };

  export type ChannelLogSink = {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug?: (msg: string) => void;
  };

  // ---- 展示元数据（严格：字段名需与真实契约一致）----
  export type ChannelMeta = {
    id: ChannelId;
    label: string;
    selectionLabel: string;
    docsPath: string;
    docsLabel?: string;
    blurb: string;
    order?: number;
    aliases?: readonly string[];
    markdownCapable?: boolean;
    showConfigured?: boolean;
    showInSetup?: boolean;
  };

  export type ChannelCapabilities = {
    chatTypes: ReadonlyArray<ChatType | "thread" | string>;
    polls?: boolean;
    reactions?: boolean;
    edit?: boolean;
    unsend?: boolean;
    reply?: boolean;
    groupManagement?: boolean;
    threads?: boolean;
    media?: boolean;
    nativeCommands?: boolean;
    blockStreaming?: boolean;
  };

  // ---- 账户状态快照（严格：setStatus/getStatus/status adapter 均用它）----
  export type ChannelAccountSnapshot = {
    accountId: string;
    name?: string;
    enabled?: boolean;
    configured?: boolean;
    statusState?: string;
    linked?: boolean;
    running?: boolean;
    connected?: boolean;
    restartPending?: boolean;
    reconnectAttempts?: number;
    lastConnectedAt?: number | null;
    lastDisconnect?:
      | string
      | { at: number; status?: number; error?: string; loggedOut?: boolean }
      | null;
    lastMessageAt?: number | null;
    lastEventAt?: number | null;
    lastError?: string | null;
    healthState?: string;
    terminalDisconnect?: boolean;
    lastStartAt?: number | null;
    lastStopAt?: number | null;
    lastInboundAt?: number | null;
    lastOutboundAt?: number | null;
    busy?: boolean;
    activeRuns?: number;
    mode?: string;
    dmPolicy?: string;
    allowFrom?: string[];
    webhookPath?: string;
    webhookUrl?: string;
    baseUrl?: string;
    port?: number | null;
    probe?: unknown;
    audit?: unknown;
  };

  // ---- 各 Adapter ----
  // config：必填 listAccountIds/resolveAccount 保真；其余可选回调宽松入参避免假阳性。
  export type ChannelConfigAdapter<ResolvedAccount = any> = {
    listAccountIds: (cfg: any) => string[];
    resolveAccount: (cfg: any, accountId?: any) => ResolvedAccount;
    defaultAccountId?: (cfg: any) => string;
    isEnabled?: (account: ResolvedAccount, cfg: any) => boolean;
    isConfigured?: (
      account: ResolvedAccount,
      cfg: any,
    ) => boolean | Promise<boolean>;
    describeAccount?: (account: ResolvedAccount, cfg: any) => ChannelAccountSnapshot;
    resolveAllowFrom?: (params: any) => Array<string | number> | undefined;
    resolveDefaultTo?: (params: any) => string | undefined;
  };

  export type ChannelOutboundAdapter = {
    deliveryMode: "direct" | "gateway" | "hybrid";
    resolveTarget?: (params: any) => any;
    sendText?: (ctx: any) => any;
    sendMedia?: (ctx: any) => any;
    sendPayload?: (ctx: any) => any;
    chunker?: unknown;
    sanitizeText?: (text: string) => string;
  };

  export type ChannelStatusAdapter<ResolvedAccount = any, Probe = unknown> = {
    defaultRuntime?: ChannelAccountSnapshot;
    buildChannelSummary?: (params: any) => any;
    probeAccount?: (params: any) => Promise<Probe>;
    buildAccountSnapshot?: (
      params: any,
    ) => ChannelAccountSnapshot | Promise<ChannelAccountSnapshot>;
  };

  export type ChannelMessagingAdapter = {
    targetPrefixes?: readonly string[];
    normalizeTarget?: (raw: string) => string | undefined;
    inferTargetChatType?: (params: any) => any;
    targetResolver?: {
      looksLikeId?: (raw: string) => boolean;
      hint?: string;
      resolveTarget?: (params: any) => any;
    };
    resolveSessionConversation?: (params: any) => any;
    resolveOutboundSessionRoute?: (params: any) => any;
  };

  // ---- gateway 启动上下文（严格：迁移核心，polling.ts 依赖）----
  export type ChannelGatewayContext<ResolvedAccount = unknown> = {
    cfg: OpenClawConfig;
    accountId: string;
    account: ResolvedAccount;
    runtime: RuntimeEnv;
    abortSignal: AbortSignal;
    log?: ChannelLogSink;
    getStatus: () => ChannelAccountSnapshot;
    setStatus: (next: ChannelAccountSnapshot) => void;
    channelRuntime?: ChannelRuntimeSurface;
  };

  export type ChannelGatewayAdapter<ResolvedAccount = unknown> = {
    startAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<unknown>;
    stopAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<void>;
    resolveGatewayAuthBypassPaths?: (params: { cfg: OpenClawConfig }) => string[];
  };

  // setup adapter（宽松：插件实现字段多且非迁移关注点）。
  export type ChannelSetupAdapter = { [key: string]: any };

  // ---- ChannelPlugin 根对象（严格：仅声明插件设置的字段；缺失 inbound 以强制其移除）----
  export type ChannelPlugin<ResolvedAccount = any, Probe = unknown> = {
    id: ChannelId;
    meta: ChannelMeta;
    capabilities: ChannelCapabilities;
    reload?: { configPrefixes: string[]; noopPrefixes?: string[] };
    setup?: ChannelSetupAdapter;
    setupWizard?: unknown;
    config: ChannelConfigAdapter<ResolvedAccount>;
    configSchema?: unknown;
    outbound?: ChannelOutboundAdapter;
    status?: ChannelStatusAdapter<ResolvedAccount, Probe>;
    gatewayMethods?: string[];
    gateway?: ChannelGatewayAdapter<ResolvedAccount>;
    messaging?: ChannelMessagingAdapter;
  };

  // ---- 注入式运行时（宽松：插件仅消费；用到的面结构化，叶子留 index signature）----
  export type PluginRuntime = {
    gateway: {
      isAvailable: () => Promise<boolean>;
      request: <T = unknown>(
        method: string,
        params?: Record<string, unknown>,
        options?: { timeoutMs?: number; scopes?: string[] },
      ) => Promise<T>;
      [key: string]: any;
    };
    config: {
      loadConfig?: () => OpenClawConfig;
      [key: string]: any;
    };
    media: {
      loadWebMedia: (path: string) => Promise<any>;
      mediaKindFromMime: (mime: string) => string;
      [key: string]: any;
    };
    state: {
      resolveStateDir: () => string;
      [key: string]: any;
    };
    channel: {
      media: { [key: string]: any };
      session: {
        resolveStorePath: (store: unknown, opts: { agentId?: string }) => string;
        recordInboundSession: (params: any) => Promise<void> | void;
        [key: string]: any;
      };
      reply: {
        finalizeInboundContext: (params: any) => any;
        dispatchReplyWithBufferedBlockDispatcher: (params: any) => Promise<void>;
        [key: string]: any;
      };
      inbound?: { [key: string]: any };
      routing?: { [key: string]: any };
      [key: string]: any;
    };
    [key: string]: any;
  };

  // ---- 入口 helper ----
  export type DefineChannelPluginEntryOptions<TPlugin> = {
    id: string;
    name: string;
    description: string;
    plugin: TPlugin;
    configSchema?: unknown;
    setRuntime?: (runtime: PluginRuntime) => void;
    registerCliMetadata?: (api: OpenClawPluginApi) => void;
    registerFull?: (api: OpenClawPluginApi) => void;
  };

  export function defineChannelPluginEntry<TPlugin>(
    opts: DefineChannelPluginEntryOptions<TPlugin>,
  ): TPlugin & { version?: string; register: (api: OpenClawPluginApi) => unknown };

  export const defineSetupPluginEntry: any;
}

declare module "openclaw/plugin-sdk/channel-setup" {
  export type ChannelSetupWizard = { [key: string]: any };
}

declare module "openclaw/plugin-sdk/setup" {
  export type ChannelSetupAdapter = { [key: string]: any };
  export type ChannelSetupInput = { [key: string]: any };
  export const createStandardChannelSetupStatus: (params: any) => any;
}
