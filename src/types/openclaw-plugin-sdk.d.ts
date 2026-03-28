declare module "openclaw/plugin-sdk/core" {
  export type OpenClawConfig = any;
  export type PluginRuntime = any;
  export type OpenClawPluginApi = any;
  export type GatewayStartContext = any;

  export type ChannelPlugin<TAccount = any, TProbe = any> = any;
  export type ChannelConfig<TAccount = any> = any;
  export type ChannelInbound<TAccount = any> = any;
  export type ChannelOutbound<TAccount = any> = any;
  export type ChannelStatus<TAccount = any, TProbe = any> = any;
  export type ChannelGateway<TAccount = any> = any;
  export type ChannelMeta = any;

  export const defineChannelPluginEntry: any;
  export const defineSetupPluginEntry: any;
}

declare module "openclaw/plugin-sdk/channel-setup" {
  export type ChannelSetupWizard = any;
}

declare module "openclaw/plugin-sdk/setup" {
  export type ChannelSetupAdapter = any;
  export type ChannelSetupInput = any;
  export const createStandardChannelSetupStatus: any;
}
