# 插件模板使用示例

本文档展示如何使用插件模板创建一个实际的通道插件。

## 📋 示例：创建一个简单的 HTTP API 通道插件

假设你要创建一个连接到某个 HTTP API 的通道插件。

### 1. 复制模板

```bash
cd openclaw_plugin
cp -r plugin-template http-api-channel
cd http-api-channel
```

### 2. 修改配置文件

#### openclaw.plugin.json

```json
{
  "id": "http-api-channel",
  "name": "HTTP API Channel",
  "description": "Channel plugin for HTTP API integration",
  "version": "1.0.0",
  "type": "module",
  "main": "index.ts",
  "openclaw": {
    "channel": {
      "id": "http-api-channel",
      "label": "HTTP API",
      "selectionLabel": "HTTP API Channel",
      "blurb": "Connect to external HTTP API",
      "aliases": ["http", "api"]
    }
  }
}
```

#### package.json

```json
{
  "name": "@openclaw/http-api-channel",
  "version": "1.0.0",
  "description": "HTTP API channel plugin",
  "type": "module",
  "main": "index.ts",
  "devDependencies": {
    "openclaw": "workspace:*"
  }
}
```

### 3. 实现 Channel Plugin

#### src/channel.ts（关键部分）

```typescript
// 配置类型
interface HttpApiAccount {
  accountId: string;
  enabled: boolean;
  config: {
    apiKey: string;
    apiUrl: string;
    pollIntervalMs?: number;
  };
}

// Config 实现
const config: ChannelConfig<HttpApiAccount> = {
  listAccountIds: (cfg) => ["default"],
  
  resolveAccount: (cfg, accountId) => {
    const pluginConfig = cfg.plugins?.entries?.["http-api-channel"]?.config || {};
    
    return {
      accountId: "default",
      enabled: true,
      config: {
        apiKey: pluginConfig.apiKey || "",
        apiUrl: pluginConfig.apiUrl || "https://api.example.com",
        pollIntervalMs: pluginConfig.pollIntervalMs || 5000,
      },
    };
  },
  
  isConfigured: (account) => Boolean(account.config.apiKey?.trim()),
  
  describeAccount: (account) => ({
    accountId: account.accountId,
    enabled: account.enabled,
    configured: Boolean(account.config.apiKey?.trim()),
  }),
};

// Outbound 实现
const outbound: ChannelOutbound<HttpApiAccount> = {
  deliveryMode: "direct",
  
  sendText: async (ctx) => {
    const { to, text, deps } = ctx;
    const account = deps.config.plugins?.entries?.["http-api-channel"]?.config || {};
    
    const response = await fetch(`${account.apiUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${account.apiKey}`,
      },
      body: JSON.stringify({
        recipient: to,
        message: text,
      }),
    });
    
    const data = await response.json();
    
    return {
      channel: "http-api-channel",
      messageId: data.id,
    };
  },
  
  sendMedia: async (ctx) => {
    const { to, text, mediaUrl, deps } = ctx;
    const account = deps.config.plugins?.entries?.["http-api-channel"]?.config || {};
    
    const response = await fetch(`${account.apiUrl}/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${account.apiKey}`,
      },
      body: JSON.stringify({
        recipient: to,
        mediaUrl,
        caption: text,
      }),
    });
    
    const data = await response.json();
    
    return {
      channel: "http-api-channel",
      messageId: data.id,
    };
  },
};
```

### 4. 实现轮询服务（如果需要）

#### src/polling.ts

```typescript
export async function startPollingService(ctx: GatewayStartContext) {
  const { account, runtime, abortSignal, log } = ctx;
  const config = account.config;
  
  log?.info?.(`[${account.accountId}] Starting polling`);
  
  let lastMessageId = 0;
  const pollInterval = config.pollIntervalMs || 5000;
  
  const poll = async () => {
    if (abortSignal.aborted) return;
    
    try {
      // 调用外部 API 获取新消息
      const response = await fetch(
        `${config.apiUrl}/messages?since=${lastMessageId}`,
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
          },
        }
      );
      
      const data = await response.json();
      
      // 处理每条消息
      for (const msg of data.messages || []) {
        const sessionKey = `agent:main:http-api-channel:${msg.userId}`;
        
        await runtime.gateway.call('chat.send', {
          sessionKey,
          message: msg.text,
        });
        
        lastMessageId = Math.max(lastMessageId, msg.id);
      }
    } catch (error) {
      log?.error?.(`Polling error: ${error}`);
    }
    
    if (!abortSignal.aborted) {
      setTimeout(poll, pollInterval);
    }
  };
  
  poll();
  
  return {
    running: true,
    lastStartAt: Date.now(),
  };
}
```

### 5. 更新 index.ts

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { httpApiChannelPlugin } from "./src/channel.js";
import { setHttpApiRuntime } from "./src/runtime.js";

const plugin = {
  id: "http-api-channel",
  name: "HTTP API Channel",
  description: "Channel plugin for HTTP API integration",
  configSchema: emptyPluginConfigSchema(),
  
  register(api: OpenClawPluginApi) {
    setHttpApiRuntime(api.runtime);
    api.registerChannel({ plugin: httpApiChannelPlugin });
  },
};

export default plugin;
```

### 6. 部署和测试

```bash
# 1. 复制到 OpenClaw 扩展目录
cp -r http-api-channel ~/.openclaw/extensions/http-api-channel

# 2. 配置插件
# 编辑 ~/.openclaw/openclaw.json
{
  "plugins": {
    "entries": {
      "http-api-channel": {
        "enabled": true,
        "config": {
          "apiKey": "your-api-key",
          "apiUrl": "https://api.example.com",
          "pollIntervalMs": 5000
        }
      }
    }
  }
}

# 3. 启用插件
openclaw plugins enable http-api-channel

# 4. 重启 Gateway
openclaw gateway restart

# 5. 查看日志
openclaw logs --follow | grep "http-api-channel"
```

## 🎯 关键要点

### 1. Session Key 格式

```
agent:main:{channel-id}:{user-id}
```

示例：
```
agent:main:http-api-channel:user123
```

### 2. 消息 ID 映射

- OpenClaw 生成的消息 ID：用于内部跟踪
- 外部平台的消息 ID：从 API 响应中获取
- 两者可以不同，但需要能够关联

### 3. 错误处理

```typescript
try {
  // API 调用
} catch (error) {
  ctx.log?.error?.(`Error: ${error}`);
  // 决定是否重试或抛出错误
  throw error; // 或者返回错误状态
}
```

### 4. 配置管理

- 配置存储在 `cfg.plugins.entries.{plugin-id}.config`
- 使用 `resolveAccount` 解析配置
- 使用 `isConfigured` 检查配置完整性

## 📚 参考

- [插件开发指南](../PLUGIN_DEVELOPMENT_GUIDE.md)
- [现有插件示例](../wechat-miniprogram-full/)
- [OpenClaw API 文档](../../server/docs/OpenClaw%20API接口文档.md)
