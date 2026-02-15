# OpenClawWeChat 插件配置说明

## 📋 快速开始

### 🔑 获取 API Key

在开始配置之前，你需要先获取 API Key：

1. 打开微信小程序 **ClawChat**
2. 进入我的页面 APIKey管理  复制API Key 
3. 找到并复制你的 API Key（格式：`bot_id:secret`）

> 💡 **提示：** API Key 是连接 OpenClaw 和微信小程序的凭证，请妥善保管。

### 推荐方式：使用配置脚本（最简单）

```bash
npm run config-init
# 或
node scripts/config-init.js
```

脚本会引导你完成配置，**只保存你自定义的配置项**，使用默认值的配置不会写入文件。

### 手动配置

配置文件位置：`~/.openclaw/openclaw.json`

## ⚙️ 配置项说明

| 配置项 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `apiKey` | string | ✅ 是 | `YOUR_API_KEY_HERE` | API Key（格式：`bot_id:secret`） |
| `pollIntervalMs` | number | ❌ 否 | `2000` | 轮询间隔（毫秒） |
| `sessionKey` | string | ❌ 否 | `agent:main:main` | Session Key，格式：`agent:<agentId>:<rest>`，多 Agent 时需与 OpenClaw 一致 |
| `debug` | boolean | ❌ 否 | `false` | 是否启用调试日志 |

**重要提示：**
- ✅ **只配置需要自定义的项**，使用默认值的配置**不需要写入**配置文件
- ✅ OpenClaw 会自动从插件清单中读取默认值
- ✅ 配置文件更简洁，只显示你自定义的配置

## 📝 配置示例

### 最小配置（推荐）

如果你只配置 API Key，其他使用默认值：

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

### 自定义部分配置

如果你修改了轮询间隔：

```json
{
  "plugins": {
    "entries": {
      "openclawwechat": {
        "enabled": true,
        "config": {
          "apiKey": "20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345",
          "pollIntervalMs": 3000
        }
      }
    }
  }
}
```

### 自定义多个配置

```json
{
  "plugins": {
    "entries": {
      "openclawwechat": {
        "enabled": true,
        "config": {
          "apiKey": "20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345",
          "pollIntervalMs": 3000,
          "debug": true
        }
      }
    }
  }
}
```

## 🔑 API Key 格式

**获取方式：** API Key 需要从**微信小程序 ClawChat** 中获取。

API Key 格式：`<bot_id>:<secret>`

**示例：** `20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345`

- `bot_id`: 数字id
- `secret`: 35 位随机字符串

> 💡 **提示：** 打开微信小程序 ClawChat，在设置或账户页面可以找到你的 API Key。

## 🔧 配置方法

### 方法 1：使用配置脚本（推荐）

```bash
# 在插件目录下运行
npm run config-init
# 或
node scripts/config-init.js
```

脚本会：
- ✅ 交互式引导配置
- ✅ 验证 API Key 格式
- ✅ 自动过滤默认值
- ✅ 只保存你自定义的配置

### 方法 2：手动编辑配置文件

```bash
# 编辑配置文件
nano ~/.openclaw/openclaw.json
# 或
code ~/.openclaw/openclaw.json
```

**提示：** 手动编辑时，只需添加需要自定义的配置项，默认值不需要写入。

## ✅ 验证配置

配置完成后，重启 OpenClaw Gateway：

```bash
openclaw gateway restart
```

查看日志确认插件已加载：

```bash
openclaw logs --follow | grep "openclawwechat"
```

进入小程序，查看链接状态，或者测试发送。

## 💡 配置最佳实践

1. **使用配置脚本**：推荐使用 `config-init.js` 脚本，避免手动编辑错误
2. **最小化配置**：只配置需要自定义的项，让配置文件保持简洁
3. **默认值管理**：默认值由插件清单统一管理，修改默认值时只需更新 `openclaw.plugin.json`
4. **配置验证**：配置脚本会自动验证 API Key 格式，确保配置正确

## 📚 相关文档

- [README.md](./README.md) - 插件使用说明
- [CONFIG-INIT.md](./CONFIG-INIT.md) - 配置脚本使用指南
- [INSTALL.md](./INSTALL.md) - 安装指南
