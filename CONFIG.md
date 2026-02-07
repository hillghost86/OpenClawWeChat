# WeChat MiniProgram 插件配置说明

## 📋 配置文件位置

OpenClaw 配置文件位于：`~/.openclaw/openclaw.json`

## ⚙️ 配置项说明

### 必需配置

在 `plugins.entries.openclawwechat.config` 中添加以下配置：

```json
{
  "plugins": {
    "entries": {
      "openclawwechat": {
        "enabled": true,
        "config": {
          "apiKey": "20231227:9HkPUB2HzCyQVtKs6Z0M3ICe9NiM84fedLV",
          "pollIntervalMs": 2000,
          "sessionKeyPrefix": "agent:main:wechat:miniprogram:",
          "debug": false
        }
      }
    }
  }
}
```

### 配置项说明

| 配置项 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `apiKey` | string | 是 | - | API Key（格式：`bot_id:secret`） |
| `pollIntervalMs` | number | 否 | `2000` | 轮询间隔（毫秒） |
| `sessionKeyPrefix` | string | 否 | `agent:main:wechat:miniprogram:` | Session Key 前缀 |
| `debug` | boolean | 否 | `false` | 是否启用调试日志 |

**注意**：
- `bridgeUrl`（中转服务器 URL）已硬编码在代码中（`http://127.0.0.1:8066`），无需在配置文件中配置
- 这样设计是为了方便升级，避免每次升级都需要修改配置文件

### API Key 格式

API Key 格式：`<bot_id>:<secret>`

示例：`20231227:9HkPUB2HzCyQVtKs6Z0M3ICe9NiM84fedLV`

- `bot_id`: 数字，格式为 `20231226 + 主键ID`（例如：主键ID=1，则 bot_id=20231227）
- `secret`: 35 位随机字符串

## 📝 完整配置示例

基于你的原始配置，添加 `openclawwechat` 配置后的完整配置：

```json
{
  "meta": {
    "lastTouchedVersion": "2026.2.3",
    "lastTouchedAt": "2026-02-05T07:16:51.991Z"
  },
  "wizard": {
    "lastRunAt": "2026-02-05T07:16:51.437Z",
    "lastRunVersion": "2026.2.3",
    "lastRunCommand": "onboard",
    "lastRunMode": "local"
  },
  "auth": {
    "profiles": {
      "zai:default": {
        "provider": "zai",
        "mode": "api_key"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "zai/glm-4.7"
      },
      "models": {
        "zai/glm-4.7": {
          "alias": "GLM"
        }
      },
      "workspace": "/Users/ma/.openclaw/workspace",
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      }
    }
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto"
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "allowlist",
      "botToken": "8534528003:AAF8VbWqiG1ZYWpymfseQMNLQcvezGZlikM",
      "allowFrom": [
        "865730955"
      ],
      "groupPolicy": "allowlist",
      "streamMode": "partial"
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "65ec861c4cba1b644da58c3112b2de5700b94427ca4e0f8d"
    },
    "tailscale": {
      "mode": "off",
      "resetOnExit": false
    }
  },
  "skills": {
    "install": {
      "nodeManager": "npm"
    }
  },
  "messages": {
    "ackReactionScope": "group-mentions"
  },
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      },
      "openclawwechat": {
        "enabled": true,
        "config": {
          "apiKey": "20231227:9HkPUB2HzCyQVtKs6Z0M3ICe9NiM84fedLV",
          "pollIntervalMs": 2000,
          "sessionKeyPrefix": "agent:main:wechat:miniprogram:",
          "debug": false
        }
      }
    }
  }
}
```

## 🔧 配置更新方法

### 方法 1：手动编辑配置文件

```bash
# 编辑配置文件
nano ~/.openclaw/openclaw.json

# 或使用其他编辑器
code ~/.openclaw/openclaw.json
```

### 方法 2：使用脚本更新

```bash
# 使用 Python 脚本更新配置
python3 << 'EOF'
import json

CONFIG_FILE = "/Users/ma/.openclaw/openclaw.json"
API_KEY = "20231227:9HkPUB2HzCyQVtKs6Z0M3ICe9NiM84fedLV"

# 读取配置
with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
  config = json.load(f)

# 添加 openclawwechat 配置
if 'plugins' not in config:
  config['plugins'] = {}
if 'entries' not in config['plugins']:
  config['plugins']['entries'] = {}

config['plugins']['entries']['openclawwechat'] = {
  'enabled': True,
  'config': {
    'apiKey': API_KEY,
    'pollIntervalMs': 2000,
    'sessionKeyPrefix': 'agent:main:wechat:miniprogram:',
    'debug': False
  }
}

# 写回配置
with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
  json.dump(config, f, ensure_ascii=False, indent=2)

print("✅ 配置已更新")
EOF
```

## ✅ 验证配置

配置完成后，重启 OpenClaw Gateway：

```bash
openclaw gateway restart
```

查看日志确认插件已加载：

```bash
openclaw logs --follow | grep "openclawwechat"
```

## 📚 相关文档

- [README.md](./README.md) - 插件使用说明
- [插件开发指南](../PLUGIN_DEVELOPMENT_GUIDE.md) - 开发文档
