#!/bin/bash
# OpenClawWeChat 插件安装脚本
# 用法: ./install.sh [api_key] [选项]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
PLUGIN_ID="openclawwechat"
PLUGIN_NAME="OpenClawWeChat"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${HOME}/.openclaw/openclaw.json"
OPENCLAW_EXTENSIONS_DIR="${HOME}/.openclaw/extensions"

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v "$1" &> /dev/null; then
        print_error "$1 未安装，请先安装 $1"
        exit 1
    fi
}

# 检查 OpenClaw 是否安装
check_openclaw() {
    if ! command -v openclaw &> /dev/null; then
        print_error "OpenClaw 未安装或不在 PATH 中"
        print_info "请先安装 OpenClaw: https://docs.openclaw.ai/install"
        exit 1
    fi
}

# 检查配置文件是否存在
check_config_file() {
    if [ ! -f "$CONFIG_FILE" ]; then
        print_warning "配置文件不存在: $CONFIG_FILE"
        print_info "正在创建默认配置文件..."
        mkdir -p "$(dirname "$CONFIG_FILE")"
        cat > "$CONFIG_FILE" << 'EOF'
{
  "plugins": {
    "enabled": true,
    "entries": {}
  }
}
EOF
        print_success "配置文件已创建"
    fi
}

# 读取 API Key
read_api_key() {
    local api_key="$1"
    
    if [ -z "$api_key" ]; then
        print_info "请输入 API Key（格式：bot_id:secret）"
        print_info "💡 API Key 可从微信小程序 ClawChat 中获取"
        print_info "示例: 20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345"
        read -p "API Key: " api_key
        
        if [ -z "$api_key" ]; then
            print_error "API Key 不能为空"
            exit 1
        fi
    fi
    
    # 验证 API Key 格式
    if [[ ! "$api_key" =~ ^[0-9]+:[A-Za-z0-9]{35}$ ]]; then
        print_warning "API Key 格式可能不正确（应为 bot_id:secret，secret 为 35 位字符）"
        read -p "是否继续？(y/N): " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    echo "$api_key"
}

# 安装插件
install_plugin() {
    local install_method="$1"
    
    print_info "正在安装插件..."
    
    if [ "$install_method" = "local" ]; then
        # 从本地路径安装
        if [ ! -d "$SCRIPT_DIR" ]; then
            print_error "插件目录不存在: $SCRIPT_DIR"
            exit 1
        fi
        
        print_info "从本地路径安装: $SCRIPT_DIR"
        openclaw plugins install "$SCRIPT_DIR" 2>&1 | while IFS= read -r line; do
            echo "  $line"
        done
        
    elif [ "$install_method" = "npm" ]; then
        # 从 NPM 安装
        print_info "从 NPM 安装: openclawwechat"
        openclaw plugins install "openclawwechat" 2>&1 | while IFS= read -r line; do
            echo "  $line"
        done
    else
        print_error "未知的安装方式: $install_method"
        exit 1
    fi
    
    # 检查安装是否成功
    if ! openclaw plugins list 2>/dev/null | grep -q "$PLUGIN_ID"; then
        print_error "插件安装失败"
        exit 1
    fi
    
    print_success "插件安装成功"
}

# 更新配置文件
update_config() {
    local api_key="$1"
    local poll_interval="${2:-2000}"
    local session_prefix="${3:-agent:main:wechat:miniprogram:}"
    local debug="${4:-false}"
    
    print_info "正在更新配置文件..."
    
    # 检查是否有 Python
    if command -v python3 &> /dev/null; then
        python3 << EOF
import json
import sys
import os
from pathlib import Path

config_file = "$CONFIG_FILE"
api_key = "$api_key"
poll_interval = int("$poll_interval")
session_prefix = "$session_prefix"
debug = "$debug".lower() == "true"
plugin_id = "$PLUGIN_ID"
script_dir = Path("$SCRIPT_DIR")
manifest_file = script_dir / "openclaw.plugin.json"

# 默认配置
DEFAULT_CONFIG = {
    "apiKey": "YOUR_API_KEY_HERE",
    "pollIntervalMs": 2000,
    "sessionKeyPrefix": "agent:main:wechat:miniprogram:",
    "debug": False
}

def load_defaults_from_manifest():
    """从插件清单读取默认值"""
    try:
        if manifest_file.exists():
            with open(manifest_file, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
            
            defaults = {}
            if manifest.get('configSchema', {}).get('properties'):
                for key, prop in manifest['configSchema']['properties'].items():
                    if 'default' in prop:
                        defaults[key] = prop['default']
            return defaults
    except Exception as e:
        print(f"⚠ 读取插件清单失败: {e}，使用硬编码默认值", file=sys.stderr)
    
    return DEFAULT_CONFIG.copy()

def filter_default_values(config_dict, defaults):
    """过滤默认值，只保留用户自定义的配置"""
    filtered = {}
    
    for key, value in config_dict.items():
        # API Key 总是保留（必需字段）
        if key == 'apiKey':
            # 如果 API Key 不是占位符，才保存
            if value != defaults.get('apiKey', 'YOUR_API_KEY_HERE'):
                filtered[key] = value
            continue
        
        # 其他字段：如果与默认值不同，才保留
        default_value = defaults.get(key)
        if default_value is None or value != default_value:
            filtered[key] = value
    
    return filtered

try:
    # 读取默认值
    defaults = load_defaults_from_manifest()
    
    # 读取配置
    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    # 确保 plugins.entries 存在
    if 'plugins' not in config:
        config['plugins'] = {}
    if 'entries' not in config['plugins']:
        config['plugins']['entries'] = {}
    if plugin_id not in config['plugins']['entries']:
        config['plugins']['entries'][plugin_id] = {}
    
    # 构建完整配置
    full_config = {
        'apiKey': api_key,
        'pollIntervalMs': poll_interval,
        'sessionKeyPrefix': session_prefix,
        'debug': debug
    }
    
    # 过滤默认值，只保留用户自定义的配置
    minimal_config = filter_default_values(full_config, defaults)
    
    # 更新配置（只保存最小化配置）
    config['plugins']['entries'][plugin_id]['enabled'] = True
    config['plugins']['entries'][plugin_id]['config'] = minimal_config
    
    # 写回配置
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    
    # 显示保存的配置
    if len(minimal_config) == 0:
        print("⚠ 所有配置项都使用默认值，未保存任何配置")
        print("ℹ OpenClaw 将从插件清单中读取默认值")
    else:
        print("✅ 配置已更新（最小化配置）")
        if len(minimal_config) == 1 and 'apiKey' in minimal_config:
            print("ℹ 其他配置项使用默认值，只保存了 API Key")
except Exception as e:
    print(f"❌ 配置更新失败: {e}", file=sys.stderr)
    sys.exit(1)
EOF
    elif command -v jq &> /dev/null; then
        # 使用 jq 更新配置（最小化配置）
        # 读取默认值
        local manifest_file="$SCRIPT_DIR/openclaw.plugin.json"
        local default_poll_interval=2000
        local default_session_prefix="agent:main:wechat:miniprogram:"
        local default_debug=false
        
        # 尝试从清单文件读取默认值
        if [ -f "$manifest_file" ]; then
            default_poll_interval=$(jq -r '.configSchema.properties.pollIntervalMs.default // 2000' "$manifest_file" 2>/dev/null || echo "2000")
            default_session_prefix=$(jq -r '.configSchema.properties.sessionKeyPrefix.default // "agent:main:wechat:miniprogram:"' "$manifest_file" 2>/dev/null || echo "agent:main:wechat:miniprogram:")
            default_debug=$(jq -r '.configSchema.properties.debug.default // false' "$manifest_file" 2>/dev/null || echo "false")
        fi
        
        # 构建最小化配置对象（只包含非默认值的项）
        local minimal_config="{"
        minimal_config="${minimal_config}\"apiKey\":\"$api_key\""
        
        # 检查 pollIntervalMs
        if [ "$poll_interval" != "$default_poll_interval" ]; then
            minimal_config="${minimal_config},\"pollIntervalMs\":$poll_interval"
        fi
        
        # 检查 sessionKeyPrefix
        if [ "$session_prefix" != "$default_session_prefix" ]; then
            minimal_config="${minimal_config},\"sessionKeyPrefix\":\"$session_prefix\""
        fi
        
        # 检查 debug
        local debug_bool="false"
        [ "$debug" = "true" ] && debug_bool="true"
        if [ "$debug_bool" != "$default_debug" ]; then
            minimal_config="${minimal_config},\"debug\":$debug_bool"
        fi
        
        minimal_config="${minimal_config}}"
        
        # 更新配置
        echo "$minimal_config" | jq ".plugins.entries.$PLUGIN_ID = {
            enabled: true,
            config: .
        }" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
        
        # 检查配置项数量
        local config_count=$(echo "$minimal_config" | jq 'length' 2>/dev/null || echo "1")
        if [ "$config_count" = "1" ]; then
            print_success "配置已更新（最小化配置，只保存了 API Key）"
            print_info "其他配置项使用默认值"
        else
            print_success "配置已更新（最小化配置）"
        fi
    else
        print_error "需要 Python3 或 jq 来更新配置文件"
        print_info "请手动编辑配置文件: $CONFIG_FILE"
        print_info "添加以下配置（最小化配置，只包含非默认值）:"
        print_info ""
        print_info "如果所有配置都使用默认值，只需添加:"
        cat << EOF
{
  "plugins": {
    "entries": {
      "$PLUGIN_ID": {
        "enabled": true,
        "config": {
          "apiKey": "$api_key"
        }
      }
    }
  }
}
EOF
        print_info ""
        print_info "如果修改了其他配置项，请添加相应的字段。"
        print_info "默认值：pollIntervalMs=2000, sessionKeyPrefix=\"agent:main:wechat:miniprogram:\", debug=false"
        exit 1
    fi
}

# 验证配置
validate_config() {
    print_info "正在验证配置..."
    
    if command -v openclaw &> /dev/null; then
        if openclaw config validate 2>&1 | grep -q "error\|Error\|ERROR"; then
            print_warning "配置验证有警告，请检查"
        else
            print_success "配置验证通过"
        fi
    fi
}

# 显示使用说明
show_usage() {
    cat << EOF
${BLUE}OpenClawWeChat 插件安装脚本${NC}

用法:
  ./install.sh [api_key] [选项]

参数:
  api_key               API Key（格式：bot_id:secret）
                        如果不提供，脚本会提示输入

选项:
  --method <method>     安装方式: local (本地) 或 npm (NPM)
                        默认: local
  --poll-interval <ms>  轮询间隔（毫秒）
                        默认: 2000
  --session-prefix <prefix>  Session Key 前缀
                        默认: agent:main:wechat:miniprogram:
  --debug               启用调试日志
  --skip-install        跳过插件安装，只更新配置
  --help                显示此帮助信息

示例:
  # 使用本地路径安装并配置
  ./install.sh "20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345"

  # 从 NPM 安装
  ./install.sh "20231227:..." --method npm

  # 只更新配置（不安装插件）
  ./install.sh "20231227:..." --skip-install

  # 自定义轮询间隔
  ./install.sh "20231227:..." --poll-interval 3000

EOF
}

# 主函数
main() {
    local api_key=""
    local install_method="local"
    local poll_interval="2000"
    local session_prefix="agent:main:wechat:miniprogram:"
    local debug="false"
    local skip_install=false
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --method)
                install_method="$2"
                shift 2
                ;;
            --poll-interval)
                poll_interval="$2"
                shift 2
                ;;
            --session-prefix)
                session_prefix="$2"
                shift 2
                ;;
            --debug)
                debug="true"
                shift
                ;;
            --skip-install)
                skip_install=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            -*)
                print_error "未知选项: $1"
                show_usage
                exit 1
                ;;
            *)
                if [ -z "$api_key" ]; then
                    api_key="$1"
                else
                    print_error "未知参数: $1"
                    show_usage
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # 打印欢迎信息
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   OpenClawWeChat 插件安装脚本        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    
    # 检查前置条件
    check_openclaw
    check_config_file
    
    # 读取 API Key
    api_key=$(read_api_key "$api_key")
    
    # 安装插件
    if [ "$skip_install" = false ]; then
        install_plugin "$install_method"
    else
        print_info "跳过插件安装（使用 --skip-install）"
    fi
    
    # 更新配置
    update_config "$api_key" "$poll_interval" "$session_prefix" "$debug"
    
    # 验证配置
    validate_config
    
    # 完成
    echo ""
    print_success "插件安装和配置完成！"
    echo ""
    print_info "下一步："
    echo "  1. 重启 OpenClaw Gateway:"
    echo "     ${GREEN}openclaw gateway restart${NC}"
    echo ""
    echo "  2. 查看日志确认插件已加载:"
    echo "     ${GREEN}openclaw logs --follow | grep \"$PLUGIN_ID\"${NC}"
    echo ""
    echo "  3. 查看插件状态:"
    echo "     ${GREEN}openclaw plugins list${NC}"
    echo ""
}

# 运行主函数
main "$@"
