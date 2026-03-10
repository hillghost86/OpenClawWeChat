# 更新日志

本文档记录 OpenClawWeChat 插件的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

##  [1.2.4] - 2026-03-10

###  新增
  - 新增语音输入功能

###  优化
  - 优化openclaw发送语音文件与语音回复逻辑
  - 优化媒体文件发送与接收逻辑
  - 按openclaw要求设计媒体文件默认下载地址

###  修复
  - 修复语音文件按文档发送的bug


## 【1.2.3】 - 2026-03-06

### 优化
  - 优化

## 【1.2.2】 - 2026-03-06

### 新增
  - bot之间相互@回复，即Bot—To-Bot的通话功能。Bot—To-Bot必须@才会回复。

### 优化
  - 优化群聊天的sessionKey设置，严格遵守官方文档的要求 agent::<channel>:group:<groupId> 的形式。
  - 完善日志打印功能，根据配置文件打印日志。

## 【1.2.1】 - 2026-03-06

修复 BRIDGE_URL 错误

## [1.2.0] - 2026-03-06

### 新增
- ✨ 新增群组消息，可在微信小程序ClawChat中创建群组
- ✨ 群组支持添加ClawChat Bot和ClawChat小程序用户，即多用户，多Bot群组

### 改进
- 🔧 卸载脚本支持 NPM 与 GitHub 两种安装路径：`openclawwechat` 与 `OpenClawWeChat`，均可正确删除插件目录
- 🔧 README 修正 Windows PowerShell 路径拼写错误（`$env:USERPROFILE%` → `$env:USERPROFILE\`）
- 🔧 配置示例 `openclaw.config.example.json` 更新为 `openclawwechat` 与 `accounts` 新结构

## [1.1.0] - 2026-02-18

### 新增
- ✨ 多账户配置模型：统一使用 `plugins.entries.openclawwechat.config.accounts`（单账户也使用 `accounts.default`）
- ✨ `config-init.js` 新交互流程：
  - `1) 初始化/更新 ApiKey`
  - `2) 新增 ApiKey`
  - `3) 删除 ApiKey`（不允许删除 `default`）
- ✨ 多账户轮询稳定性增强：
  - 账户级隔离清理（按 `accountId`）
  - 错误分类处理（401/403、429、5xx、网络错误）
  - 指数退避 + jitter 重试
  - 短期去重缓存（按 update_id）

### 改进
- 🔧 配置脚本统一输出推荐结构，默认值不落盘（仅保存用户自定义项）
- 🔧 API Key 校验策略收敛为“输入阶段 + 保存阶段”双重严格校验
- 🔧 README / 配置文档同步多账户结构与脚本流程
- 🔧 类型与编译上下文增强，`tsc --noEmit` 可通过（不改变核心业务行为）

### 修复
- 🐛 修复轮询调用 `injectMessage` 的参数类型不匹配问题（移除无效 `bridgeUrl` 传参）
- 🐛 修复版本号不一致问题（`package.json` / `constants.ts` / `openclaw.plugin.json` 统一为 `1.1.0`）

## [1.0.13] - 2026-02-21

### 修复
- 🐛 修复 auto-restart 导致多实例并行轮询、次数异常的问题（增加 cleanup、stopped 标志，stopAccount 调用 runPollingCleanup）
- 🐛 修复 getUpdates、markProcessed 请求中 API Key 未 URL 编码的问题（冒号等特殊字符可能导致请求失败）

### 改进
- 🔧 默认轮询间隔由 2 秒调整为 5 秒（constants、openclaw.plugin.json、config-init.js）
- 🔧 启动时输出当前轮询间隔日志，便于排查配置是否生效

## [1.0.12] - 2026-02-16

### 改进
- 🔧 重构会话session设置，默认使用 `agent:main:main`。
- 🔧 配置项 `sessionKeyPrefix` 更名为 `sessionKey`，默认值 `agent:main:main`
- 🔧 `config-init.js` 增加 Session Key 格式校验（需符合 OpenClaw：`agent:<agentId>:<rest>`）
- 🔧 插件运行时校验 sessionKey 格式，无效时回退默认值

### 兼容
- 🔄 兼容旧配置项 `sessionKeyPrefix`，读取时优先 `sessionKey`，未配置时使用 `sessionKeyPrefix`

## [1.0.11] - 2026-02-12

### 新增
- 新增 openclaw 思考状态显示

## [1.0.10] - 2026-02-11

### 改进
- 🔧 移除 `channel.ts` 中只支持回复图片类型的限制
- 🔧 优化媒体类型检测逻辑，支持本地路径和 URL 两种方式
- 🔧 改进错误日志，包含媒体类型信息

### 修复
- 🐛 修复音频文件无法发送的问题（之前会抛出 "Unsupported media type" 错误）

## [1.0.9] - 2026-02-10

### 新增
- ✨ 支持使用 openclaw plugins update openclawwechat 更新插件
### 改进
- 🔧 优化轮询机制
- 🔧 改进错误处理和日志记录

---

## 版本说明

- **新增 (Added)** - 新功能
- **改进 (Changed)** - 现有功能的变更
- **弃用 (Deprecated)** - 即将移除的功能
- **移除 (Removed)** - 已移除的功能
- **修复 (Fixed)** - 问题修复
- **安全 (Security)** - 安全相关更新
