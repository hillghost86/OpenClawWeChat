# OpenClawWeChat

OpenClawWeChat 是 OpenClaw 的微信小程序 Channel Plugin，通过 HTTP 轮询方式实现 OpenClaw 与微信小程序之间的消息桥接。

## ✨ 功能特性

- ✅ **文本消息**：支持发送和接收文本消息
- ✅ **媒体消息**：支持图片等媒体消息的发送
- ✅ **消息回复**：支持消息回复功能（reply_to_message_id）
- ✅ **轮询服务**：通过 HTTP 轮询获取新消息
- ✅ **Telegram Bot API 兼容**：使用 Telegram Bot API 兼容格式
- ✅ **错误处理**：完整的错误处理和日志记录
- ✅ **状态管理**：支持账户状态查询和管理

## 📋 前置要求

- OpenClaw Gateway 已安装并运行
- 有效的 API Key（格式：`bot_id:secret`）

## 🚀 快速开始

### 1. 安装插件

#### 方式一：从本地安装

```bash
# 复制插件到 OpenClaw 扩展目录
cp -r OpenClawWeChat ~/.openclaw/extensions/OpenClawWeChat

# 启用插件
openclaw plugins enable openclawwechat

# 重启 Gateway
openclaw gateway restart
```

#### 方式二：从 GitHub 安装

```bash
# 克隆仓库
git clone git@github.com:hillghost86/OpenClawWeChat.git ~/.openclaw/extensions/OpenClawWeChat

# 启用插件
openclaw plugins enable openclawwechat

# 重启 Gateway
openclaw gateway restart
```

### 2. 配置插件

编辑 OpenClaw 配置文件 `~/.openclaw/openclaw.json`：

```json
{
  "plugins": {
    "entries": {
      "openclawwechat": {
        "enabled": true,
        "config": {
          "apiKey": "your_bot_id:your_secret",
          "pollIntervalMs": 2000,
          "sessionKeyPrefix": "agent:main:wechat:miniprogram:",
          "debug": false
        }
      }
    }
  }
}
```

### 3. 验证安装

```bash
# 查看插件状态
openclaw plugins list

# 查看日志
openclaw logs --follow | grep "openclawwechat"
```

## ⚙️ 配置说明

### 配置项

| 配置项 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `apiKey` | string | ✅ | - | API Key（格式：`bot_id:secret`） |
| `pollIntervalMs` | number | ❌ | `2000` | 轮询间隔（毫秒） |
| `sessionKeyPrefix` | string | ❌ | `agent:main:wechat:miniprogram:` | Session Key 前缀 |
| `debug` | boolean | ❌ | `false` | 是否启用调试日志 |

### 配置示例

#### 最小配置

```json
{
  "apiKey": "20231227:ABC123XYZ789DEF456GHI012JKL345MNO678PQR901STU234VWX567"
}
```

#### 完整配置

```json
{
  "apiKey": "20231227:ABC123XYZ789DEF456GHI012JKL345MNO678PQR901STU234VWX567",
  "pollIntervalMs": 2000,
  "sessionKeyPrefix": "agent:main:wechat:miniprogram:",
  "debug": false
}
```

## 📁 项目结构

```
OpenClawWeChat/
├── README.md              # 本文件
├── CONFIG.md              # 详细配置说明
├── EXAMPLE.md             # 使用示例
├── openclaw.plugin.json   # 插件清单文件（必需）
├── package.json           # NPM 包配置
├── tsconfig.json          # TypeScript 配置
├── index.ts               # 插件入口文件（必需）
└── src/
    ├── channel.ts         # Channel Plugin 核心实现
    ├── runtime.ts         # Runtime 管理
    ├── polling.ts         # 轮询服务实现
    ├── message-parser.ts  # 消息解析器
    ├── message-injector.ts # 消息注入器
    ├── reply-sender.ts    # 回复发送器
    ├── media-handler.ts   # 媒体消息处理
    ├── config.ts          # 配置管理
    └── constants.ts       # 常量定义
```

## 🔧 开发指南

### 构建项目

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 开发模式（监听文件变化）
npm run dev
```

### 核心实现

#### 1. 插件入口 (index.ts)

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { wechatMiniprogramPlugin } from "./src/channel.js";
import { setWechatMiniprogramRuntime } from "./src/runtime.js";
import { PLUGIN_ID, PLUGIN_VERSION } from "./src/constants.js";

const plugin = {
  id: PLUGIN_ID,
  name: "OpenClawWeChat",
  description: "OpenClawWeChat - WeChat MiniProgram channel plugin for OpenClaw",
  version: PLUGIN_VERSION,
  configSchema: emptyPluginConfigSchema(),
  
  register(api: OpenClawPluginApi) {
    setWechatMiniprogramRuntime(api.runtime);
    api.registerChannel({ plugin: wechatMiniprogramPlugin });
  },
};

export default plugin;
```

#### 2. Channel Plugin (src/channel.ts)

实现 `ChannelPlugin` 接口，包括：
- `config` - 配置管理和验证
- `inbound` - 接收消息处理
- `outbound` - 发送消息（支持文本和媒体）
- `status` - 账户状态查询
- `gateway` - Gateway 生命周期管理

#### 3. Runtime 管理 (src/runtime.ts)

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

## 📚 使用示例

### 发送文本消息

```typescript
// 通过 OpenClaw API 发送消息
const target = "openclawwechat:openid123";
const message = {
  content: "Hello, WeChat MiniProgram!",
  target: target
};

// 使用 OpenClaw 的 sendMessage API
await openclaw.sendMessage(message);
```

### 发送媒体消息

```typescript
const mediaMessage = {
  content: "图片消息",
  media_type: "image",
  media_url: "https://example.com/image.jpg",
  target: "openclawwechat:openid123"
};

await openclaw.sendMessage(mediaMessage);
```

### 回复消息

```typescript
const replyMessage = {
  content: "这是回复",
  reply_to_message_id: 12345,
  target: "openclawwechat:openid123"
};

await openclaw.sendMessage(replyMessage);
```

## 🔍 故障排查

### 常见问题

1. **插件未加载**
   - 检查插件是否已启用：`openclaw plugins list`
   - 检查配置文件格式是否正确
   - 查看日志：`openclaw logs | grep "openclawwechat"`

2. **消息发送失败**
   - 检查 API Key 是否正确
   - 确认中转服务器是否正常运行
   - 检查网络连接

3. **轮询未工作**
   - 检查 `pollIntervalMs` 配置
   - 查看轮询服务日志
   - 确认中转服务器 API 端点可访问

### 调试模式

启用调试日志：

```json
{
  "config": {
    "apiKey": "your_api_key",
    "debug": true
  }
}
```

## 📖 相关文档

- [详细配置说明](./CONFIG.md)
- [使用示例](./EXAMPLE.md)
- [OpenClaw 插件开发指南](https://docs.openclaw.ai/plugins)

## 📝 版本历史

### v1.0.0

- 初始版本发布
- 支持文本和媒体消息
- 支持消息回复功能
- HTTP 轮询服务
- 完整的错误处理

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系方式

- GitHub: [hillghost86/OpenClawWeChat](https://github.com/hillghost86/OpenClawWeChat)
- Issues: [GitHub Issues](https://github.com/hillghost86/OpenClawWeChat/issues)
