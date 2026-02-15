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

运行脚本后，会依次提示：

1. **输入 API Key** - 自动验证格式
2. **配置其他选项**（可选，直接回车使用默认值）：
   - 轮询间隔（默认：2000ms）
   - Session Key（默认：agent:main:main，格式：`agent:<agentId>:<rest>`）
   - 调试模式（默认：false）
3. **确认保存** - 显示配置预览后保存

## 🎯 生成的配置

脚本会在配置文件中添加或更新（只保存非默认值的配置项）：

- **macOS / Linux**: `~/.openclaw/openclaw.json`
- **Windows**: `%USERPROFILE%\.openclaw\openclaw.json`

**示例（最小配置）：**

```json
{
  "plugins": {
    "entries": {
      "openclawwechat": {
        "enabled": true,
        "config": {
          "apiKey": "20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345"
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
- 直接回车使用默认值 `agent:main:main`

### API Key 验证失败

- 确认格式为：`bot_id:secret`
- `bot_id` 应为数字
- `secret` 应为 35 位字符
- 从微信小程序 ClawChat 中获取

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

- **快速配置**：只输入 API Key，其他选项直接回车使用默认值
- **更新配置**：如果配置已存在，脚本会询问是否更新
- **最小化配置**：脚本只保存非默认值的配置项，让配置文件更简洁

## 📚 相关文档

- [INSTALL.md](./INSTALL.md) - 安装指南
- [CONFIG.md](./CONFIG.md) - 配置说明
- [README.md](./README.md) - 插件说明
