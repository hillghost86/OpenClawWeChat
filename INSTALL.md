# OpenClawWeChat 插件安装指南

## 📋 前置要求

- OpenClaw 已安装并配置
- Python 3.x 或 Bash（用于运行安装脚本）
- 有效的 API Key（格式：`bot_id:secret`）
  - 💡 **获取方式：** 打开微信小程序 **ClawChat**，在设置或账户页面可以找到你的 API Key

## 🚀 快速安装

### 方法一：使用安装脚本（推荐）

安装脚本会自动完成插件安装和配置，是最简单的方式。

#### Bash 脚本（Linux/macOS）

```bash
cd OpenClawWeChat
./install.sh "your_bot_id:your_secret"
```

#### Python 脚本（跨平台）

```bash
cd OpenClawWeChat
python3 install.py "your_bot_id:your_secret"
```

### 方法二：手动安装

如果不想使用安装脚本，可以手动安装：

```bash
# 1. 安装插件
openclaw plugins install /path/to/OpenClawWeChat

# 2. 编辑配置文件 ~/.openclaw/openclaw.json
# 添加插件配置（见下方配置示例）

# 3. 重启 Gateway
openclaw gateway restart
```

## ⚙️ 安装脚本选项

### 基本用法

```bash
# 交互式输入 API Key
./install.sh

# 直接提供 API Key
./install.sh "20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345"
```

### 高级选项

```bash
# 从 NPM 安装（如果已发布）
./install.sh "your_api_key" --method npm

# 自定义轮询间隔（毫秒）
./install.sh "your_api_key" --poll-interval 3000

# 自定义 Session Key 前缀
./install.sh "your_api_key" --session-prefix "custom:prefix:"

# 启用调试日志
./install.sh "your_api_key" --debug

# 只更新配置（不安装插件）
./install.sh "your_api_key" --skip-install

# 查看帮助
./install.sh --help
```

## 📝 配置说明

安装脚本会自动在 `~/.openclaw/openclaw.json` 中添加以下配置：

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

### 配置项说明

| 配置项 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `apiKey` | string | ✅ | - | API Key（格式：`bot_id:secret`），从微信小程序 ClawChat 中获取 |
| `pollIntervalMs` | number | ❌ | `2000` | 轮询间隔（毫秒） |
| `sessionKeyPrefix` | string | ❌ | `agent:main:wechat:miniprogram:` | Session Key 前缀 |
| `debug` | boolean | ❌ | `false` | 是否启用调试日志 |

## ✅ 验证安装

安装完成后，执行以下步骤验证：

### 1. 检查插件状态

```bash
openclaw plugins list | grep openclawwechat
```

应该看到插件已启用。

### 2. 验证配置

```bash
openclaw config validate
```

### 3. 重启 Gateway

```bash
openclaw gateway restart
```

### 4. 查看日志

```bash
openclaw logs --follow | grep "openclawwechat"
```

应该看到插件加载成功的日志。

## 🔧 故障排查

### 问题 1：OpenClaw 未找到

**错误信息：**
```
OpenClaw 未安装或不在 PATH 中
```

**解决方法：**
1. 确认 OpenClaw 已安装：`openclaw --version`
2. 如果未安装，参考 [OpenClaw 安装文档](https://docs.openclaw.ai/install)
3. 确保 OpenClaw 在 PATH 中

### 问题 2：配置文件不存在

**错误信息：**
```
配置文件不存在: ~/.openclaw/openclaw.json
```

**解决方法：**
安装脚本会自动创建配置文件，如果失败，可以手动创建：

```bash
mkdir -p ~/.openclaw
cat > ~/.openclaw/openclaw.json << 'EOF'
{
  "plugins": {
    "enabled": true,
    "entries": {}
  }
}
EOF
```

### 问题 3：API Key 格式错误

**错误信息：**
```
API Key 格式可能不正确
```

**解决方法：**
- API Key 可从**微信小程序 ClawChat** 中获取
- API Key 格式应为：`bot_id:secret`
- `bot_id` 应为数字
- `secret` 应为 35 位字符
- 示例：`20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345`

### 问题 4：插件安装失败

**错误信息：**
```
插件安装失败
```

**解决方法：**
1. 检查插件目录是否存在且完整
2. 检查 OpenClaw 扩展目录权限：`ls -la ~/.openclaw/extensions`
3. 查看详细错误信息：`openclaw plugins install /path/to/OpenClawWeChat`

### 问题 5：配置更新失败

**错误信息：**
```
配置更新失败
```

**解决方法：**
1. 检查配置文件权限：`ls -la ~/.openclaw/openclaw.json`
2. 手动编辑配置文件添加插件配置
3. 确保 JSON 格式正确

## 📚 相关文档

- [README.md](./README.md) - 插件使用说明
- [CONFIG.md](./CONFIG.md) - 详细配置说明
- [EXAMPLE.md](./EXAMPLE.md) - 使用示例
- [OpenClaw 插件文档](https://docs.openclaw.ai/plugins)

## 🤝 获取帮助

如果遇到问题：

1. 查看日志：`openclaw logs --follow`
2. 检查配置：`openclaw config validate`
3. 查看插件状态：`openclaw plugins list`
4. 提交 Issue：[GitHub Issues](https://github.com/hillghost86/OpenClawWeChat/issues)
