# 更新日志

本文档记录 OpenClawWeChat 插件的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.0.11] - 2026-02-12
### 新增
- 新增openclaw 思考状态显示

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
