declare module "openclaw/plugin-sdk" {
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
}
