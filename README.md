# OpenClawWeChat

[![Version](https://img.shields.io/npm/v/openclawwechat?color=blue&style=flat-square)](https://www.npmjs.com/package/openclawwechat)
[![Downloads](https://img.shields.io/npm/dt/openclawwechat?style=flat-square)](https://www.npmjs.com/package/openclawwechat)
[![License](https://img.shields.io/github/license/hillghost86/OpenClawWeChat?style=flat-square)](LICENSE)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-Compatible-green?style=flat-square)](https://openclaw.ai)

## 概述

`OpenClawWeChat` 是一个 OpenClaw channel 插件，用于将 OpenClaw 与 ClawChat 微信小程序连接起来，实现通过微信小程序与 OpenClaw 进行个人对话和群聊交互。

当前版本已完成新版 OpenClaw 插件系统对齐，支持以下能力：

- 文本消息收发
- 图片 / 文档 / 语音消息发送
- 群消息链路
- 多账户独立轮询

## 兼容要求

- **OpenClaw 宿主版本**：`>=2026.3.24`
- **运行前提**：OpenClaw Gateway 已安装并运行

### 获取 ClawChat API Key

1. 打开微信小程序 **ClawChat**
2. 进入"我的"页面 → **Bot 管理**
3. 复制目标 Bot 的 API Key（格式：`bot_id:secret`）


## 安装

### npm 安装（推荐）

```bash
# npm 安装（推荐）
openclaw plugins install openclawwechat
```
### github 安装

```bash
# 本地安装（开发 / 调试）
cd ~/.openclaw/extensions
git clone https://github.com/hillghost86/OpenClawWeChat.git openclawwechat
```

## 配置

安装完成后，需要配置 ClawChat API Key 才能使用。API Key 从微信小程序 ClawChat → 我的 → Bot 管理中获取，格式为 `bot_id:secret`。

### 方式 1：OpenClaw 配置向导（推荐）

```bash
openclaw configure --section channels
```

在通道列表中选择 **OpenClawWeChat（微信小程序 ClawChat）**，按提示依次填写：

1. **ClawChat API Key** — 格式 `bot_id:secret`，从微信小程序 ClawChat 获取
2. **默认轮询间隔** — 单位毫秒，默认 5000，通常无需修改
3. **调试日志** — 是否开启详细日志，默认关闭
4. **default.sessionKey** — 可留空，默认 `agent:main:main`

完成后选择 **Finished** 即可，向导会自动写入所有配置。

> 当前向导仅支持 `default` 账户的初始化。多账户管理请使用方式 2。

### 方式 2：CLI 配置工具 （推荐）

适用于多账户管理、旧配置迁移、或向导不可用的场景：

**macOS / Linux**：

```bash
cd ~/.openclaw/extensions/openclawwechat
npm run config-init
```

**Windows（CMD）**：

```cmd
cd %USERPROFILE%\.openclaw\extensions\openclawwechat
npm run config-init
```

**Windows（PowerShell）**：

```powershell
cd "$env:USERPROFILE\.openclaw\extensions\openclawwechat"
npm run config-init
```

支持：

- **初始化/更新 ApiKey** — 配置或修改默认账户
- **新增 ApiKey** — 添加额外账户（多 Bot 场景）
- **删除 ApiKey** — 移除指定账户


### 方式 3：手动编辑配置文件 （备用）

编辑 `~/.openclaw/openclaw.json`（Windows: `%USERPROFILE%\.openclaw\openclaw.json`），最小配置：

```json
{
  "plugins": {
    "entries": {
      "openclawwechat": {
        "enabled": true,
        "config": {
          "accounts": {
            "default": {
              "apiKey": "YOUR_BOT_ID:YOUR_SECRET_KEY"
            }
          }
        }
      }
    }
  },
  "channels": {
    "openclawwechat": { "mode": "polling" }
  }
}
```

> 完整配置项、多账户示例及字段说明参见 [CONFIG.md](./CONFIG.md)。

## 启动与验证

配置完成后重启 gateway：

```bash
openclaw gateway restart
```

### 验证步骤

```bash
# 1. 校验配置
openclaw config validate

# 2. 查看插件状态（预期：openclawwechat 为 loaded）
openclaw plugins list

# 3. 查看运行状态（预期：OpenClawWeChat 为 ON / OK）
openclaw status --deep

# 4. 查看日志
openclaw logs --follow
```

正常日志示例：

```text
Starting WeChat MiniProgram polling service
Polling response: ok=true, result.length=0
```

### 小程序侧验证

在 ClawChat 小程序中检查：

- Bot 是否在线（链接状态为绿色）
- 发送文本消息，确认能正常收到回复

## 升级

```bash
# 自动升级
openclaw plugins update openclawwechat
openclaw gateway restart
```

## 卸载

### 使用插件卸载脚本

```bash
cd ~/.openclaw/extensions/openclawwechat
npm run uninstall
```

### 手动卸载

1. 删除插件目录：

```bash
rm -rf ~/.openclaw/extensions/openclawwechat
```

2. 编辑 `~/.openclaw/openclaw.json`，删除以下配置项：

- `plugins.entries.openclawwechat`
- `plugins.installs.openclawwechat`
- `channels.openclawwechat`

3. 重启 gateway：

```bash
openclaw gateway restart
```

## 常见问题

| 问题 | 排查方法 |
|------|---------|
| 插件未加载 | `openclaw plugins list` 确认状态；检查 `apiKey` 和 `channels.openclawwechat.mode` 是否存在 |
| 小程序离线 | `openclaw logs --follow` 检查是否有轮询日志；确认 API Key 正确且 gateway 已重启 |
| 多账户不生效 | 非 `default` 账户必须有唯一 `sessionKey`；修改后需重启 gateway |

## 相关文档

- [CONFIG.md](./CONFIG.md) — 配置详解（字段说明、多账户、示例）
- [CONFIG-INIT.md](./CONFIG-INIT.md) — CLI 配置工具说明
- [TESTING.md](./TESTING.md) — 验证清单与测试记录
- [CHANGELOG.md](./CHANGELOG.md) — 版本变更记录

## 许可证

MIT
