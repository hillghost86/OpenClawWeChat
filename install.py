#!/usr/bin/env python3
"""
OpenClawWeChat 插件安装脚本
用法: python3 install.py [api_key] [选项]
"""

import json
import os
import sys
import subprocess
import argparse
from pathlib import Path

# 配置
PLUGIN_ID = "openclawwechat"
CONFIG_FILE = Path.home() / ".openclaw" / "openclaw.json"
SCRIPT_DIR = Path(__file__).parent.resolve()
MANIFEST_FILE = SCRIPT_DIR / "openclaw.plugin.json"

# 默认配置
DEFAULT_CONFIG = {
    "apiKey": "YOUR_API_KEY_HERE",
    "pollIntervalMs": 2000,
    "sessionKeyPrefix": "agent:main:wechat:miniprogram:",
    "debug": False
}


class Colors:
    """终端颜色"""
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color


def print_info(msg):
    print(f"{Colors.BLUE}ℹ{Colors.NC} {msg}")


def print_success(msg):
    print(f"{Colors.GREEN}✅{Colors.NC} {msg}")


def print_warning(msg):
    print(f"{Colors.YELLOW}⚠{Colors.NC} {msg}")


def print_error(msg):
    print(f"{Colors.RED}❌{Colors.NC} {msg}")


def check_openclaw():
    """检查 OpenClaw 是否安装"""
    try:
        subprocess.run(["openclaw", "--version"], 
                      capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print_error("OpenClaw 未安装或不在 PATH 中")
        print_info("请先安装 OpenClaw: https://docs.openclaw.ai/install")
        sys.exit(1)


def load_defaults_from_manifest():
    """从插件清单读取默认值"""
    try:
        if MANIFEST_FILE.exists():
            with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
            
            defaults = {}
            if manifest.get('configSchema', {}).get('properties'):
                for key, prop in manifest['configSchema']['properties'].items():
                    if 'default' in prop:
                        defaults[key] = prop['default']
            return defaults
    except Exception as e:
        print_warning(f"读取插件清单失败: {e}，使用硬编码默认值")
    
    return DEFAULT_CONFIG.copy()


def check_config_file():
    """检查并创建配置文件"""
    config_dir = CONFIG_FILE.parent
    config_dir.mkdir(parents=True, exist_ok=True)
    
    if not CONFIG_FILE.exists():
        print_warning(f"配置文件不存在: {CONFIG_FILE}")
        print_info("正在创建默认配置文件...")
        default_config = {
            "plugins": {
                "enabled": True,
                "entries": {}
            }
        }
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(default_config, f, indent=2, ensure_ascii=False)
        print_success("配置文件已创建")


def validate_api_key(api_key):
    """验证 API Key 格式"""
    if not api_key:
        return False
    
    parts = api_key.split(':')
    if len(parts) != 2:
        return False
    
    bot_id, secret = parts
    if not bot_id.isdigit():
        return False
    
    if len(secret) != 35:
        return False
    
    return True


def read_api_key(api_key=None):
    """读取 API Key"""
    if api_key:
        if not validate_api_key(api_key):
            print_warning("API Key 格式可能不正确（应为 bot_id:secret，secret 为 35 位字符）")
            confirm = input("是否继续？(y/N): ").strip().lower()
            if confirm != 'y':
                sys.exit(1)
        return api_key
    
    print_info("请输入 API Key（格式：bot_id:secret）")
    print_info("💡 API Key 可从微信小程序 ClawChat 中获取")
    print_info("示例: 20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345")
    
    while True:
        api_key = input("API Key: ").strip()
        if api_key:
            if not validate_api_key(api_key):
                print_warning("API Key 格式可能不正确")
                confirm = input("是否继续？(y/N): ").strip().lower()
                if confirm == 'y':
                    return api_key
            else:
                return api_key
        else:
            print_error("API Key 不能为空")


def install_plugin(method="local"):
    """安装插件"""
    print_info("正在安装插件...")
    
    try:
        if method == "local":
            print_info(f"从本地路径安装: {SCRIPT_DIR}")
            result = subprocess.run(
                ["openclaw", "plugins", "install", str(SCRIPT_DIR)],
                capture_output=True,
                text=True,
                check=True
            )
            print(result.stdout)
        elif method == "npm":
            print_info("从 NPM 安装: openclawwechat")
            result = subprocess.run(
                ["openclaw", "plugins", "install", "openclawwechat"],
                capture_output=True,
                text=True,
                check=True
            )
            print(result.stdout)
        else:
            print_error(f"未知的安装方式: {method}")
            sys.exit(1)
        
        # 检查安装是否成功
        result = subprocess.run(
            ["openclaw", "plugins", "list"],
            capture_output=True,
            text=True
        )
        
        if PLUGIN_ID not in result.stdout:
            print_error("插件安装失败")
            sys.exit(1)
        
        print_success("插件安装成功")
        
    except subprocess.CalledProcessError as e:
        print_error(f"插件安装失败: {e}")
        if e.stderr:
            print(e.stderr)
        sys.exit(1)


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


def update_config(api_key, poll_interval=2000, session_prefix="agent:main:wechat:miniprogram:", debug=False):
    """更新配置文件（只保存非默认值的配置项）"""
    print_info("正在更新配置文件...")
    
    try:
        # 读取默认值
        defaults = load_defaults_from_manifest()
        
        # 读取配置
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # 确保 plugins.entries 存在
        if 'plugins' not in config:
            config['plugins'] = {}
        if 'entries' not in config['plugins']:
            config['plugins']['entries'] = {}
        if PLUGIN_ID not in config['plugins']['entries']:
            config['plugins']['entries'][PLUGIN_ID] = {}
        
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
        config['plugins']['entries'][PLUGIN_ID]['enabled'] = True
        config['plugins']['entries'][PLUGIN_ID]['config'] = minimal_config
        
        # 写回配置
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        
        # 显示保存的配置
        if len(minimal_config) == 0:
            print_warning("所有配置项都使用默认值，未保存任何配置")
            print_info("OpenClaw 将从插件清单中读取默认值")
        else:
            print_success("配置已更新（最小化配置）")
            if len(minimal_config) == 1 and 'apiKey' in minimal_config:
                print_info("其他配置项使用默认值，只保存了 API Key")
        
    except Exception as e:
        print_error(f"配置更新失败: {e}")
        sys.exit(1)


def validate_config():
    """验证配置"""
    print_info("正在验证配置...")
    
    try:
        result = subprocess.run(
            ["openclaw", "config", "validate"],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print_success("配置验证通过")
        else:
            print_warning("配置验证有警告，请检查")
            if result.stderr:
                print(result.stderr)
    except Exception as e:
        print_warning(f"无法验证配置: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="OpenClawWeChat 插件安装脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 使用本地路径安装并配置
  python3 install.py "20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345"

  # 从 NPM 安装
  python3 install.py "20231227:..." --method npm

  # 只更新配置（不安装插件）
  python3 install.py "20231227:..." --skip-install

  # 自定义轮询间隔
  python3 install.py "20231227:..." --poll-interval 3000
        """
    )
    
    parser.add_argument(
        'api_key',
        nargs='?',
        help='API Key（格式：bot_id:secret）'
    )
    parser.add_argument(
        '--method',
        choices=['local', 'npm'],
        default='local',
        help='安装方式: local (本地) 或 npm (NPM)，默认: local'
    )
    parser.add_argument(
        '--poll-interval',
        type=int,
        default=2000,
        help='轮询间隔（毫秒），默认: 2000'
    )
    parser.add_argument(
        '--session-prefix',
        default='agent:main:wechat:miniprogram:',
        help='Session Key 前缀，默认: agent:main:wechat:miniprogram:'
    )
    parser.add_argument(
        '--debug',
        action='store_true',
        help='启用调试日志'
    )
    parser.add_argument(
        '--skip-install',
        action='store_true',
        help='跳过插件安装，只更新配置'
    )
    
    args = parser.parse_args()
    
    # 打印欢迎信息
    print()
    print(f"{Colors.BLUE}╔════════════════════════════════════════╗{Colors.NC}")
    print(f"{Colors.BLUE}║   OpenClawWeChat 插件安装脚本        ║{Colors.NC}")
    print(f"{Colors.BLUE}╚════════════════════════════════════════╝{Colors.NC}")
    print()
    
    # 检查前置条件
    check_openclaw()
    check_config_file()
    
    # 读取 API Key
    api_key = read_api_key(args.api_key)
    
    # 安装插件
    if not args.skip_install:
        install_plugin(args.method)
    else:
        print_info("跳过插件安装（使用 --skip-install）")
    
    # 更新配置
    update_config(
        api_key=api_key,
        poll_interval=args.poll_interval,
        session_prefix=args.session_prefix,
        debug=args.debug
    )
    
    # 验证配置
    validate_config()
    
    # 完成
    print()
    print_success("插件安装和配置完成！")
    print()
    print_info("下一步：")
    print(f"  1. 重启 OpenClaw Gateway:")
    print(f"     {Colors.GREEN}openclaw gateway restart{Colors.NC}")
    print()
    print(f"  2. 查看日志确认插件已加载:")
    print(f"     {Colors.GREEN}openclaw logs --follow | grep \"{PLUGIN_ID}\"{Colors.NC}")
    print()
    print(f"  3. 查看插件状态:")
    print(f"     {Colors.GREEN}openclaw plugins list{Colors.NC}")
    print()


if __name__ == "__main__":
    main()
