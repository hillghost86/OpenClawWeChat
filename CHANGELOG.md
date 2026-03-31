# 更新日志

本文档记录 OpenClawWeChat 插件的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.3.2] - 2026-04-01

### 修复
- 修复 `channelConfigs.openclawwechat.schema` 未声明 `mode` 字段的问题，避免宿主在校验 `channels.openclawwechat.mode = "polling"` 哨兵时将其误判为非法额外属性

## [1.3.1] - 2026-03-28

### 新增
- 新增 `ensure-sentinel.ts`，插件被宿主加载时自动检查并补写 `channels.openclawwechat.mode = "polling"` 哨兵，解决从 1.2.x 升级后通道无法激活的问题


## [1.3.0] - 2026-03-28

本版本完成与 OpenClaw 2026.3.24+ 官方插件系统的完整对齐，插件方式完全遵守openclaw官方要求，使用OpenClaw 官方 SDK 标准实现插件的所有功能。

### 新增
- 插件入口改为官方标准 `defineChannelPluginEntry(...)` 注册方式
- 新增声明式 `setupWizard`，支持通过 `openclaw configure --section channels` 在宿主内完成配置
- 新增 `setup` adapter（`ChannelSetupAdapter`），处理向导输入验证与配置写回
- 新增 `setup-entry.ts`，为 setup-only 装载模式预留入口
- 新增 `src/log-redaction.ts`，日志中自动脱敏 API Key 等敏感信息
- 新增 `TESTING.md` 验证清单文档，记录完整 smoke test 结果
- channel meta 补齐 `id`、`selectionLabel`、`docsPath`、`docsLabel`，支持宿主通道选择列表展示

### 优化
- `openclaw.plugin.json` 重构为新版 manifest 顶层字段：`channels`、`uiHints`、`channelConfigs`
- `uiHints` 补齐嵌套账户字段（`accounts.*`）的 label、help、placeholder、sensitive、advanced 标记
- `channelConfigs` 补齐 `blurb`、`docsPath`、`docsLabel`、`aliases`
- `package.json` 补齐 `openclaw.channel`（含 `selectionLabel`、`aliases`）、`openclaw.install.minHostVersion >= 2026.3.24`
- SDK 引用从根 `openclaw/plugin-sdk` 收敛到 `openclaw/plugin-sdk/core`、`openclaw/plugin-sdk/channel-setup`、`openclaw/plugin-sdk/setup` 子路径
- 配置读取/写入统一收敛到 canonical `defaults + accounts` 结构
- 为 gateway 启动阶段自动写入 `channels.openclawwechat.mode = "polling"` 通道哨兵
- 卸载脚本同步清理 `channels.openclawwechat`，避免残留配置导致校验失败
- README / CONFIG 文档重写，主路径调整为宿主配置优先、CLI 降级为 fallback
- 轮询生命周期改为长生命周期 Promise，符合宿主对 gateway 任务的预期

### 修复
- 修复日志中暴露完整 API Key URL 的安全问题
- 修复 `setupWizard` 验证函数对 `undefined` 输入的 `trim` 崩溃问题
- 修复 channel 缺少 `meta.id` 导致宿主通道选择列表报 `trim` 错误的问题
- 修复 channel 缺少 `meta.docsPath` 导致选择 Finished 时报 `trim` 错误的问题

### 兼容
- 继续兼容旧配置结构读取（平铺字段、单账户写法、极旧结构），升级无需手动迁移

## [1.2.5] - 2026-03-28

### 优化
- 优化语音文件逻辑，后端给插件下发 message.voice 时，除了 file_id 和 duration，现在还会带上 mime_type 和 file_name。这样插件不需要再盲猜语音格式。

## [1.2.4] - 2026-03-10

### 新增
- 新增语音输入功能

### 优化
- 优化 openclaw 发送语音文件与语音回复逻辑
- 优化媒体文件发送与接收逻辑
- 按 openclaw 要求设计媒体文件默认下载地址

### 修复
- 修复语音文件按文档发送的 bug

## [1.2.3] - 2026-03-06

### 优化
- 优化

## [1.2.2] - 2026-03-06

### 新增
- Bot 之间相互 @回复，即 Bot-To-Bot 的通话功能。Bot-To-Bot 必须 @才会回复。

### 优化
- 优化群聊天的 sessionKey 设置，严格遵守官方文档的要求 `agent::<channel>:group:<groupId>` 的形式
- 完善日志打印功能，根据配置文件打印日志

## [1.2.1] - 2026-03-06

### 修复
- 修复 BRIDGE_URL 错误

## [1.2.0] - 2026-03-06

### 新增
- 新增群组消息，可在微信小程序 ClawChat 中创建群组
- 群组支持添加 ClawChat Bot 和 ClawChat 小程序用户，即多用户、多 Bot 群组

### 改进
- 卸载脚本支持 NPM 与 GitHub 两种安装路径：`openclawwechat` 与 `OpenClawWeChat`，均可正确删除插件目录
- README 修正 Windows PowerShell 路径拼写错误
- 配置示例更新为 `openclawwechat` 与 `accounts` 新结构

## [1.1.0] - 2026-02-18

### 新增
- 多账户配置模型：统一使用 `plugins.entries.openclawwechat.config.accounts`（单账户也使用 `accounts.default`）
- `config-init.js` 新交互流程：初始化/更新 ApiKey、新增 ApiKey、删除 ApiKey
- 多账户轮询稳定性增强：账户级隔离清理、错误分类处理、指数退避 + jitter 重试、短期去重缓存

### 改进
- 配置脚本统一输出推荐结构，默认值不落盘
- API Key 校验策略收敛为输入阶段 + 保存阶段双重严格校验
- README / 配置文档同步多账户结构与脚本流程

### 修复
- 修复轮询调用 `injectMessage` 的参数类型不匹配问题
- 修复版本号不一致问题（`package.json` / `constants.ts` / `openclaw.plugin.json` 统一为 `1.1.0`）

## [1.0.13] - 2026-02-21

### 修复
- 修复 auto-restart 导致多实例并行轮询的问题
- 修复 getUpdates、markProcessed 请求中 API Key 未 URL 编码的问题

### 改进
- 默认轮询间隔由 2 秒调整为 5 秒
- 启动时输出当前轮询间隔日志

## [1.0.12] - 2026-02-16

### 改进
- 重构会话 session 设置，默认使用 `agent:main:main`
- 配置项 `sessionKeyPrefix` 更名为 `sessionKey`
- `config-init.js` 增加 Session Key 格式校验
- 插件运行时校验 sessionKey 格式，无效时回退默认值

### 兼容
- 兼容旧配置项 `sessionKeyPrefix`，读取时优先 `sessionKey`

## [1.0.11] - 2026-02-12

### 新增
- 新增 openclaw 思考状态显示

## [1.0.10] - 2026-02-11

### 改进
- 移除 `channel.ts` 中只支持回复图片类型的限制
- 优化媒体类型检测逻辑，支持本地路径和 URL 两种方式

### 修复
- 修复音频文件无法发送的问题

## [1.0.9] - 2026-02-10

### 新增
- 支持使用 `openclaw plugins update openclawwechat` 更新插件

### 改进
- 优化轮询机制
- 改进错误处理和日志记录
