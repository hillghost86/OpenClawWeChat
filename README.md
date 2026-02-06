# WeChat MiniProgram Channel Plugin

这是 WeChat MiniProgram 的 OpenClaw Channel Plugin 实现。

## 📁 文件结构

```
wechat-miniprogram/
├── README.md              # 本文件
├── openclaw.plugin.json   # 插件清单文件（必需）
├── package.json           # NPM 包配置
├── index.ts              # 插件入口文件（必需）
└── src/
    ├── channel.ts        # Channel Plugin 实现
    ├── runtime.ts        # Runtime 管理
    └── polling.ts        # 轮询服务实现（可选）
```

## 🚀 快速开始

### 1. 部署到 OpenClaw

```bash
# 复制到 OpenClaw 扩展目录
cp -r wechat-miniprogram ~/.openclaw/extensions/wechat-miniprogram

# 启用插件
openclaw plugins enable wechat-miniprogram

# 重启 Gateway
openclaw gateway restart
```

### 2. 配置插件

编辑 `~/.openclaw/openclaw.json`：

```json
{
  "plugins": {
    "entries": {
      "wechat-miniprogram": {
        "enabled": true,
        "config": {
          "bridgeUrl": "http://localhost:8066",
          "apiKey": "20231227:ABC123XYZ789DEF456GHI012JKL345MNO678PQR901STU234VWX567",
          "pollIntervalMs": 2000,
          "sessionKeyPrefix": "agent:main:wechat:miniprogram:"
        }
      }
    }
  }
}
```

### 3. 查看日志

```bash
openclaw logs --follow | grep "wechat-miniprogram"
```

## 📝 配置说明

### openclaw.plugin.json

```json
{
  "id": "wechat-miniprogram",           // 插件唯一 ID
  "channels": ["wechat-miniprogram"],   // 支持的通道 ID
  "configSchema": {
    // 配置 Schema（可选）
  }
}
```

### package.json

```json
{
  "name": "@openclaw/wechat-miniprogram",
  "version": "1.0.0",
  "type": "module",
  "main": "index.ts",
  "devDependencies": {
    "openclaw": "workspace:*"
  }
}
```

## 🔧 核心实现

### 1. 插件入口 (index.ts)

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { wechatMiniprogramPlugin } from "./src/channel.js";
import { setWechatMiniprogramRuntime } from "./src/runtime.js";

const plugin = {
  id: "wechat-miniprogram",
  name: "WeChat MiniProgram",
  description: "WeChat MiniProgram channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setWechatMiniprogramRuntime(api.runtime);
    api.registerChannel({ plugin: wechatMiniprogramPlugin });
  },
};

export default plugin;
```

### 2. Channel Plugin (src/channel.ts)

实现 `ChannelPlugin` 接口，包括：
- `config` - 配置管理
- `inbound` - 接收消息
- `outbound` - 发送消息（支持文本和媒体）
- `status` - 状态管理
- `gateway` - Gateway 集成

### 3. Runtime 管理 (src/runtime.ts)

```typescript
import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setWechatMiniprogramRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getWechatMiniprogramRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("WeChat MiniProgram runtime not initialized");
  }
  return runtime;
}
```

### 4. 轮询服务 (src/polling.ts)

可选实现，用于从中转服务器轮询获取新消息。

## 📚 参考文档

- [插件开发指南](../PLUGIN_DEVELOPMENT_GUIDE.md)
- [OpenClaw API 文档](../../server/docs/OpenClaw%20API接口文档.md)
- [现有插件示例](../wechat-miniprogram-full/)

## 🎯 配置项说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `bridgeUrl` | 中转服务器 URL | `http://localhost:8066` |
| `apiKey` | API Key（格式：`bot_id:secret`） | 必需 |
| `pollIntervalMs` | 轮询间隔（毫秒） | `2000` |
| `sessionKeyPrefix` | Session Key 前缀 | `agent:main:wechat:miniprogram:` |

## ✅ 功能特性

- ✅ 支持文本消息发送和接收
- ✅ 支持媒体消息（图片）发送
- ✅ 支持消息回复（reply_to_message_id）
- ✅ 轮询服务获取新消息
- ✅ Telegram Bot API 兼容格式
- ✅ 完整的错误处理和日志记录
