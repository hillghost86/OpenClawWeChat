# 更新日志

本文档记录 OpenClawWeChat 插件的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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
