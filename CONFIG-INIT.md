# 配置初始化脚本使用指南

## 📋 概述

`config-init.js` 是一个交互式配置脚本，用于在安装插件后自动配置 OpenClawWeChat 插件，避免手动编辑 JSON 配置文件。

## 🔑 获取 API Key

在运行配置脚本之前，你需要先获取 API Key：

1. 打开微信小程序 **ClawChat**
2. 进入设置或账户页面
3. 找到并复制你的 API Key（格式：`bot_id:secret`）

> 💡 **提示：** API Key 是连接 OpenClaw 和微信小程序的凭证，请妥善保管。

## 🚀 快速开始

### 推荐方式：使用 npm script

#### macOS / Linux

```bash
cd ~/.openclaw/extensions/openclawwechat
npm run config-init
```

#### Windows

```powershell
# PowerShell
cd $env:USERPROFILE\.openclaw\extensions\openclawwechat
npm run config-init
```

```cmd
# CMD
cd %USERPROFILE%\.openclaw\extensions\openclawwechat
npm run config-init
```

### 直接运行脚本

#### macOS / Linux

```bash
node ~/.openclaw/extensions/openclawwechat/scripts/config-init.js
```

#### Windows

```powershell
# PowerShell
node $env:USERPROFILE\.openclaw\extensions\openclawwechat\scripts\config-init.js
```

```cmd
# CMD
node %USERPROFILE%\.openclaw\extensions\openclawwechat\scripts\config-init.js
```

## 📝 配置流程

运行脚本后，会先进入模式选择：

1. `初始化/更新 ApiKey`（默认）
   - 用于首次安装或存量升级
   - 维护 `accounts.default`
2. `新增 ApiKey`
   - 在现有配置基础上新增非 `default` 账户
3. `删除 ApiKey`
   - 删除非 `default` 账户（`default` 不允许删除）

输入规则：
- API Key 格式必须为 `bot_id:secret`
- 非 `default` 账户 `sessionKey` 必填，且格式必须为 `agent:<agentId>:<rest>`
- `apiKey` 与 `sessionKey` 在账户间必须唯一

## 🎯 生成的配置

脚本会在配置文件中添加或更新（只保存非默认值）：

- **macOS / Linux**: `~/.openclaw/openclaw.json`
- **Windows**: `%USERPROFILE%\.openclaw\openclaw.json`

**示例（最小配置，单账户）：**

```json
{
  "plugins": {
    "entries": {
      "openclawwechat": {
        "enabled": true,
        "config": {
          "accounts": {
            "default": {
              "apiKey": "20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345"
            }
          }
        }
      }
    }
  }
}
```

**示例（多账户）：**

```json
{
  "plugins": {
    "entries": {
      "openclawwechat": {
        "enabled": true,
        "config": {
          "defaults": {
            "pollIntervalMs": 5000,
            "debug": false
          },
          "accounts": {
            "default": {
              "apiKey": "20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345"
            },
            "bot2": {
              "apiKey": "20231228:EXAMPLE_SECRET_KEY_35_CHARS_LONG_67890",
              "sessionKey": "agent:main:wechat:bot2"
            }
          }
        }
      }
    }
  }
}
```

## 🔍 验证配置

配置完成后：

```bash
# 验证配置格式
openclaw config validate

# 重启 Gateway
openclaw gateway restart

# 查看日志（macOS/Linux）
openclaw logs --follow | grep "openclawwechat"

# 查看日志（Windows PowerShell）
openclaw logs --follow | Select-String "openclawwechat"
```

## 🐛 常见问题

### 脚本无法运行

**解决：**
```bash
# 确保 Node.js 已安装
node --version

# 使用 node 直接运行
node scripts/config-init.js
```

**Windows 执行策略问题：**
```powershell
# 使用 node 直接运行（推荐）
node scripts\config-init.js
```

### Session Key 格式错误

- 格式需为：`agent:<agentId>:<rest>`（至少 3 段）
- 示例：`agent:main:main`、`agent:main:direct:user123`
- `default` 账户可为空（回落默认值）
- 非 `default` 账户必须填写合法 `sessionKey`

### API Key 验证失败

- 确认格式为：`bot_id:secret`
- `bot_id` 应为数字
- `secret` 应为 35 位字符
- 从微信小程序 ClawChat 中获取
- 不能与已有账户重复

### 配置文件不存在

脚本会自动创建配置文件。如果失败，手动创建目录：

**macOS / Linux:**
```bash
mkdir -p ~/.openclaw
```

**Windows:**
```powershell
New-Item -ItemType Directory -Force -Path $env:USERPROFILE\.openclaw
```

## 💡 使用技巧

- **首次安装/升级**：先选 `初始化/更新 ApiKey`
- **扩容账户**：再次运行脚本，选择 `新增 ApiKey`
- **下线账户**：选择 `删除 ApiKey`
- **最小化配置**：默认值不写入配置文件，配置更简洁

## 📚 相关文档

- [README.md](./README.md) - 插件使用说明（含安装指南）
- [CONFIG.md](./CONFIG.md) - 配置说明
