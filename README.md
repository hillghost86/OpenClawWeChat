# OpenClawWeChat

OpenClawWeChat 可通过 ClawChat 的微信小程序实现 OpneClaw 与个人微信之间进行通讯会话。

众所周知的原因，中中国大陆无法使用Teletegram，Whatapp等工具与Opencalw会话，虽然可以使用飞书、钉钉但配置起来也比较复杂。而国名第一大app微信，却只支持企业微信，不支持个人微信。

OpenClawWeChat 就是来解决这个用户痛点的。将OpenClaw与微信小程序进行链接，可以直接通过微信小程序与OpenClaw进行对话，让OpenClaw做你让他做的事情。并且可以随时随地获得OpenClaw的回复。

## ✨ 功能特性

- ✅ **文本消息**：支持发送和接收文本消息
- ✅ **媒体消息**：支持图片等媒体文件，支持发送pdf，word等文档文件的发送
- ✅ **消息回复**：支持消息回复功能
- ✅ **Telegram Bot API 兼容**：使用 Telegram Bot API 兼容格式
- ✅ **错误处理**：完整的错误处理和日志记录
- ✅ **状态管理**：支持账户状态查询和管理

## 📋 前置要求

- OpenClaw Gateway 已安装并运行
  - 安装见 [openclaw官网 https://openclaw.ai](https://openclaw.ai)[gtihub openclaw](https://github.com/openclaw)
- 有效的 API Key（格式：`bot_id:secret`）
  - 💡 **获取方式：** 打开微信，搜索小程序 **ClawChat**，在我的页面 APIKey管理 复制你的 API Key

## 🚀 一、安装插件

### 方法一：从 NPM 自动安装 （推荐）

```bash
# 安装最新版本
openclaw plugins install openclawwechat

# 安装完插件，OpenClaw会报错，这是正常的，因为还没有写配置文件。
```
编辑 OpenClaw 配置文件，添加插件配置（见下方"配置插件"部分）。

### 方法二：从 GitHub 安装（手动安装）

#### 步骤 1：进入插件目录

**macOS / Linux：**
```bash
cd ~/.openclaw/extensions
```

**Windows：**
```powershell
# PowerShell
cd $env:USERPROFILE\.openclaw\extensions
```

```cmd
# CMD
cd %USERPROFILE%\.openclaw\extensions
```

#### 步骤 2：克隆仓库

```bash
git clone https://github.com/hillghost86/OpenClawWeChat.git
cd OpenClawWeChat
```

## 二、配置插件

### 方法一：使用配置脚本（推荐）

使用 npm 脚本进行交互式配置：

**macOS / Linux：**
```bash
# 进入插件目录
cd ~/.openclaw/extensions/openclawwechat

# npm运行配置脚本
npm run config-init

# 或者使用node运行配置脚本
node ~/.openclaw/extensions/openclawwechatscripts/scripts/config-init.js
```

**Windows：**  powershell 方法
```powershell
# PowerShell
cd $env:USERPROFILE\.openclaw\extensions\openclawwechat
npm run config-init

# 或使用node运行配置脚本
node $env:USERPROFILE\.openclaw\extensions\openclawwechat\scripts\config-init.js
```

CMD 方法
```cmd
# CMD
cd %USERPROFILE%\.openclaw\extensions\openclawwechat
npm run config-init

或使用node运行配置脚本

```cmd
# CMD
node %USERPROFILE%\.openclaw\extensions\openclawwechat\scripts\config-init.js
```


配置脚本会：
- ✅ 引导你输入 API Key（从微信小程序 ClawChat 获取）
- ✅ 询问是否需要自定义其他配置项
- ✅ 只保存自定义的配置（使用默认值的配置不会写入文件）
- ✅ 自动验证配置格式

### 方法二：手动编辑配置文件

**配置文件位置：**

- **macOS / Linux：** `~/.openclaw/openclaw.json`
- **Windows：** `%USERPROFILE%\.openclaw\openclaw.json` 或 `C:\Users\<用户名>\.openclaw\openclaw.json`

**最小配置（推荐）：**

如果你只配置 API Key，其他使用默认值：

```json
{
  "plugins": {
    "entries": {
      "openclawwechat": {
        "enabled": true,
        "config": {
          "apiKey": "your_bot_id:your_secret"
        }
      }
    }
  }
}
```

> 💡 **提示：** 
> - API Key 可从**微信小程序 ClawChat** 中获取（我的页面 → APIKey管理）
> - 只配置需要自定义的项，使用默认值的配置**不需要写入**配置文件
> - OpenClaw 会自动从插件清单中读取默认值



## 三、重启插件并验证

### 重启 Gateway

```bash
openclaw gateway restart
```

### 验证安装

```bash
# 查看插件状态
openclaw plugins list

# 查看日志
openclaw logs --follow | grep "openclawwechat"
```

进入CLawChat 微信小程序 ，查看小程序会话界面是否已链接OpenClaw。

## ⚙️ 四、配置说明

### 配置项

| 配置项 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `apiKey` | string | ✅ | - | API Key（格式：`bot_id:secret`） |
| `pollIntervalMs` | number | ❌ | `2000` | 轮询间隔（毫秒） |
| `sessionKeyPrefix` | string | ❌ | `agent:main:wechat:miniprogram:` | Session Key 前缀 |
| `debug` | boolean | ❌ | `false` | 是否启用调试日志 |

### 配置示例

#### 最小配置

> 💡 **获取 API Key：** 打开微信小程序 ClawChat，在设置或账户页面可以找到你的 API Key。

```json
{
  "apiKey": "20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345"
}
```

#### 完整配置

```json
{
  "apiKey": "20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345",
  "pollIntervalMs": 2000,
  "sessionKeyPrefix": "agent:main:wechat:miniprogram:",
  "debug": false
}
```
## 五、卸载插件

**Mac/Linux**

```bash
# 方法 1：使用 npm 脚本（推荐，会删除配置和插件目录）
cd ~/.openclaw/extensions/openclawwechat
npm run uninstall

# 或使用node卸载
node ~/.openclaw/extensions/openclawwechat/scripts/uninstall.js
```

**Windows：**  powershell 方法
```powershell
# PowerShell
cd $env:USERPROFILE\.openclaw\extensions\openclawwechat
npm run uninstall

# 或使用node运行配置脚本
node $env:USERPROFILE\.openclaw\extensions\openclawwechat\scripts\unistall.js
```

CMD 方法
```cmd
# CMD
cd %USERPROFILE%\.openclaw\extensions\openclawwechat
npm run unistall

或使用node运行配置脚本

```cmd
# CMD
node %USERPROFILE%\.openclaw\extensions\openclawwechat\scripts\unistall.js
```

卸载脚本会：
1. 从配置文件中删除插件配置
2. 删除插件目录（`~/.openclaw/extensions/openclawwechat`）

**手动卸载：**

如果无法运行卸载脚本，可以手动删除：

```bash
# 1. 删除插件目录
rm -rf ~/.openclaw/extensions/openclawwechat

# 2. 编辑配置文件，删除插件配置
# 编辑 ~/.openclaw/openclaw.json，删除 plugins.entries.openclawwechat 项

# 3. 重启 Gateway
openclaw gateway restart
```


## 六、核心实现

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


## 七、故障排查

### 常见问题

1. **插件未加载**
   - 检查插件是否已启用：`openclaw plugins list`
   - 检查配置文件格式是否正确
   - 查看日志：`openclaw logs | grep "openclawwechat"`

2. **消息发送失败**
   - 检查 API Key 是否正确
   - 检查网络连接

3. **轮询未工作**
   - 检查 `pollIntervalMs` 配置,默认是2000ms
   - 查看轮询服务日志


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
- [OpenClaw 插件开发指南](https://docs.openclaw.ai/plugins)


## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系方式

- GitHub: [hillghost86/OpenClawWeChat](https://github.com/hillghost86/OpenClawWeChat)
- Issues: [GitHub Issues](https://github.com/hillghost86/OpenClawWeChat/issues)
