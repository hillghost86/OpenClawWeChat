# OpenClawWeChat 配置说明

本文档是 OpenClawWeChat 插件的配置详解。快速上手请参见 [README.md](./README.md)。

## 配置文件

- macOS / Linux：`~/.openclaw/openclaw.json`
- Windows：`%USERPROFILE%\.openclaw\openclaw.json`

插件配置位于 `plugins.entries.openclawwechat.config` 下，使用 `defaults + accounts` 结构。

## 配置方式

### 方式 1：OpenClaw 配置向导（推荐）

```bash
openclaw configure --section channels
```

选择 **OpenClawWeChat（微信小程序 ClawChat）**，按提示填写 API Key 等信息。向导会自动写入所有必要配置。

> 当前向导仅支持 `default` 账户的初始化。多账户管理请使用方式 2。

### 方式 2：CLI 配置工具

适用于多账户管理、旧配置迁移、或向导不可用的场景。

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

支持三种操作模式：

- **初始化/更新 ApiKey** — 配置或修改默认账户
- **新增 ApiKey** — 添加额外账户（多 Bot 场景）
- **删除 ApiKey** — 移除指定账户

详细说明参见 [CONFIG-INIT.md](./CONFIG-INIT.md)。

### 方式 3：手动编辑配置文件

直接编辑 `~/.openclaw/openclaw.json`，参照下方示例填写。

## 配置示例

### 单账户（最小配置）

只需填写 API Key，其余使用默认值：

```json
{
  "plugins": {
    "entries": {
      "openclawwechat": {
        "enabled": true,
        "config": {
          "accounts": {
            "default": {
              "apiKey": "20231227:YOUR_SECRET_KEY"
            }
          }
        }
      }
    }
  },
  "channels": {
    "openclawwechat": {
      "mode": "polling"
    }
  }
}
```

### 自定义轮询间隔

```json
{
  "plugins": {
    "entries": {
      "openclawwechat": {
        "enabled": true,
        "config": {
          "defaults": {
            "pollIntervalMs": 3000
          },
          "accounts": {
            "default": {
              "apiKey": "20231227:YOUR_SECRET_KEY"
            }
          }
        }
      }
    }
  },
  "channels": {
    "openclawwechat": {
      "mode": "polling"
    }
  }
}
```

### 多账户

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
              "apiKey": "20231227:YOUR_DEFAULT_SECRET_KEY"
            },
            "bot2": {
              "apiKey": "20231236:YOUR_SECOND_SECRET_KEY",
              "sessionKey": "agent:main:wechat:bot2"
            },
            "bot3": {
              "apiKey": "20231245:YOUR_THIRD_SECRET_KEY",
              "sessionKey": "agent:main:wechat:bot3",
              "pollIntervalMs": 10000,
              "debug": true
            }
          }
        }
      }
    }
  },
  "channels": {
    "openclawwechat": {
      "mode": "polling"
    }
  }
}
```

### 禁用某个账户（不删除配置）

```json
"bot2": {
  "apiKey": "20231236:YOUR_SECOND_SECRET_KEY",
  "sessionKey": "agent:main:wechat:bot2",
  "enabled": false
}
```

## 配置项参考

### accounts（账户配置）

| 字段 | 类型 | 必需 | 默认值 | 说明 |
|---|---|:---:|---|---|
| `apiKey` | `string` | 是 | — | ClawChat API Key，格式 `bot_id:secret` |
| `sessionKey` | `string` | 非 default 时必填 | `agent:main:main` | 会话标识，格式 `agent:<agentId>:<rest>` |
| `pollIntervalMs` | `number` | 否 | 继承 defaults | 该账户的轮询间隔（毫秒），覆盖全局默认值 |
| `debug` | `boolean` | 否 | 继承 defaults | 该账户的调试日志开关，覆盖全局默认值 |
| `enabled` | `boolean` | 否 | `true` | 设为 `false` 禁用该账户 |

### defaults（全局默认配置）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `pollIntervalMs` | `number` | `5000` | 轮询间隔（毫秒），范围 500–60000 |
| `debug` | `boolean` | `false` | 调试日志开关 |

### channels 通道标记

| 字段 | 值 | 说明 |
|---|---|---|
| `channels.openclawwechat.mode` | `"polling"` | gateway 识别通道的必要标记 |

> 使用配置向导或 CLI 工具会自动写入此标记。手动编辑配置时需自行添加。

## 多账户规则

- **`default` 账户**：无需配置 `sessionKey`，自动使用 `agent:main:main`
- **非 `default` 账户**：必须配置唯一的 `sessionKey`
- **sessionKey 推荐格式**：`agent:main:wechat:<accountId>`
- **`apiKey` 不可重复**：每个账户的 API Key 必须唯一
- **`sessionKey` 不可重复**：每个账户的 sessionKey 必须唯一
- **账户级覆盖**：账户中的 `pollIntervalMs` 和 `debug` 会覆盖 `defaults` 中的值

## API Key 格式

格式：`<bot_id>:<secret>`

- `bot_id`：数字 ID
- `secret`：随机字符串

**获取方式**：打开微信小程序 ClawChat → 我的 → Bot 管理 → 复制目标 Bot 的 API Key

## 旧配置兼容

插件支持读取以下历史配置结构，升级后无需手动迁移：

- 新结构：`config.defaults` + `config.accounts`（推荐）
- 单账户写法：`config.config.apiKey` 等平铺字段
- 旧平铺结构：`config.apiKey` 等直接在 config 下
- 极旧结构：字段直接在 `plugins.entries.openclawwechat` 下

所有配置工具（向导、CLI、脚本）写入时统一使用 `defaults + accounts` 新结构。

## 验证配置

```bash
openclaw config validate
openclaw gateway restart
openclaw plugins list
openclaw logs --follow
```

## 相关文档

- [README.md](./README.md) — 快速上手
- [CONFIG-INIT.md](./CONFIG-INIT.md) — CLI 配置工具说明
- [CHANGELOG.md](./CHANGELOG.md) — 版本变更记录
