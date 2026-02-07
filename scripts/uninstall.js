#!/usr/bin/env node
/**
 * OpenClawWeChat 插件卸载脚本
 * 用法: node scripts/uninstall.js
 * 或: npm run uninstall
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const PLUGIN_ID = 'openclawwechat';
const CONFIG_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE,
  '.openclaw',
  'openclaw.json'
);
const EXTENSIONS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE,
  '.openclaw',
  'extensions'
);
const PLUGIN_DIR = path.join(EXTENSIONS_DIR, PLUGIN_ID);

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function colorize(text, color) {
  if (process.stdout.isTTY) {
    return `${colors[color]}${text}${colors.reset}`;
  }
  return text;
}

function printInfo(msg) {
  console.log(colorize(`ℹ ${msg}`, 'blue'));
}

function printSuccess(msg) {
  console.log(colorize(`✅ ${msg}`, 'green'));
}

function printWarning(msg) {
  console.log(colorize(`⚠ ${msg}`, 'yellow'));
}

function printError(msg) {
  console.log(colorize(`❌ ${msg}`, 'red'));
}

// 创建 readline 接口
function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// 询问用户输入
function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

// 读取配置文件
function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    printError(`读取配置文件失败: ${err.message}`);
    return null;
  }
}

// 写入配置文件
function writeConfig(config) {
  try {
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const content = JSON.stringify(config, null, 2) + '\n';
    fs.writeFileSync(CONFIG_FILE, content, 'utf-8');
    return true;
  } catch (err) {
    printError(`写入配置文件失败: ${err.message}`);
    return false;
  }
}

// 检查插件配置是否存在
function hasPluginConfig(config) {
  return Boolean(config?.plugins?.entries?.[PLUGIN_ID]);
}

// 删除插件配置
function removePluginConfig(config) {
  if (!config?.plugins?.entries?.[PLUGIN_ID]) {
    return config;
  }

  delete config.plugins.entries[PLUGIN_ID];

  // 如果 entries 为空，清理结构
  if (Object.keys(config.plugins.entries).length === 0) {
    delete config.plugins.entries;
  }

  return config;
}

// 删除插件目录
function removePluginDirectory() {
  if (!fs.existsSync(PLUGIN_DIR)) {
    return { success: false, message: '插件目录不存在' };
  }

  try {
    fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
    return { success: true, message: '插件目录已删除' };
  } catch (err) {
    return { success: false, message: `删除插件目录失败: ${err.message}` };
  }
}

// 主函数
async function main() {
  console.log('');
  console.log(colorize('═══════════════════════════════════════', 'bright'));
  console.log(colorize('  OpenClawWeChat 插件卸载', 'bright'));
  console.log(colorize('═══════════════════════════════════════', 'bright'));
  console.log('');

  // 检查配置文件和插件目录
  const configExists = fs.existsSync(CONFIG_FILE);
  const pluginDirExists = fs.existsSync(PLUGIN_DIR);

  if (!configExists && !pluginDirExists) {
    printInfo('配置文件和插件目录都不存在，无需卸载');
    return;
  }

  if (!configExists) {
    printWarning('配置文件不存在，但检测到插件目录');
    console.log('');
  }

  // 读取配置（如果配置文件存在）
  let config = null;
  let hasConfig = false;

  if (configExists) {
    config = readConfig();
    if (!config) {
      printError('无法读取配置文件');
      process.exit(1);
    }
    hasConfig = hasPluginConfig(config);
  }

  // 如果既没有配置也没有目录，直接返回
  if (!hasConfig && !pluginDirExists) {
    printInfo('未找到插件配置和目录，无需卸载');
    return;
  }

  // 如果只有目录没有配置，仍然可以删除目录
  if (!hasConfig && pluginDirExists) {
    printWarning('配置文件中未找到插件配置，但检测到插件目录');
    console.log('');
  }

  // 显示当前配置（如果存在）
  if (hasConfig) {
    const pluginConfig = config.plugins.entries[PLUGIN_ID];
    printInfo('检测到插件配置:');
    if (pluginConfig.config?.apiKey) {
      const apiKey = pluginConfig.config.apiKey;
      const maskedApiKey =
        apiKey.length > 20
          ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 5)}`
          : '***';
      console.log(`  API Key: ${maskedApiKey}`);
    }
    console.log(`  启用状态: ${pluginConfig.enabled ? '已启用' : '已禁用'}`);
    console.log('');
  }

  // 显示插件目录信息
  if (pluginDirExists) {
    printInfo(`检测到插件目录: ${PLUGIN_DIR}`);
  }

  // 检测是否为交互式环境
  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

  let shouldRemoveConfig = false;
  let shouldRemoveDir = false;

  if (isInteractive) {
    // 交互式环境：询问用户
    const rl = createRL();

    // 询问是否删除配置
    const configAnswer = await question(
      rl,
      colorize('是否删除插件配置？(y/N): ', 'yellow')
    );
    shouldRemoveConfig = configAnswer.toLowerCase() === 'y' || configAnswer.toLowerCase() === 'yes';

    // 如果插件目录存在，询问是否删除目录
    if (pluginDirExists) {
      const dirAnswer = await question(
        rl,
        colorize('是否删除插件目录？(y/N): ', 'yellow')
      );
      shouldRemoveDir = dirAnswer.toLowerCase() === 'y' || dirAnswer.toLowerCase() === 'yes';
    }

    rl.close();

    if (!shouldRemoveConfig && !shouldRemoveDir) {
      printInfo('已取消，未执行任何操作');
      return;
    }
  } else {
    // 非交互式环境：通过 --yes 参数控制
    const args = process.argv.slice(2);
    if (!args.includes('--yes') && !args.includes('-y')) {
      printWarning('非交互式环境，需要 --yes 或 -y 参数确认删除');
      printInfo('用法: npm run uninstall -- --yes');
      process.exit(1);
    }
    shouldRemoveConfig = true;
    shouldRemoveDir = pluginDirExists;
  }

  let configRemoved = false;
  let dirRemoved = false;

  // 删除配置（如果配置存在）
  if (shouldRemoveConfig && hasConfig) {
    const updatedConfig = removePluginConfig(config);
    if (writeConfig(updatedConfig)) {
      printSuccess('插件配置已从配置文件中删除');
      configRemoved = true;
    } else {
      printError('删除配置失败');
    }
  } else if (shouldRemoveConfig && !hasConfig) {
    printWarning('配置不存在，跳过删除配置');
  }

  // 删除插件目录
  if (shouldRemoveDir) {
    const result = removePluginDirectory();
    if (result.success) {
      printSuccess(result.message);
      dirRemoved = true;
    } else {
      printWarning(result.message);
    }
  }

  // 总结
  console.log('');
  if (configRemoved || dirRemoved) {
    printSuccess('卸载完成！');
    console.log('');
    if (configRemoved && dirRemoved) {
      printInfo('已删除：');
      console.log('  ✅ 插件配置');
      console.log('  ✅ 插件目录');
    } else if (configRemoved) {
      printInfo('已删除：');
      console.log('  ✅ 插件配置');
      if (pluginDirExists) {
        printWarning('插件目录未删除，需要手动删除:');
        console.log(`   ${colorize(`rm -rf "${PLUGIN_DIR}"`, 'green')}`);
      }
    } else if (dirRemoved) {
      printInfo('已删除：');
      console.log('  ✅ 插件目录');
      printWarning('插件配置未删除，需要手动编辑配置文件');
    }

    console.log('');
    printInfo('下一步：');
    printInfo('重启 OpenClaw Gateway 以应用更改:');
    console.log(`   ${colorize('openclaw gateway restart', 'green')}`);
  } else {
    printWarning('未执行任何操作');
  }
}

// 运行主函数
main().catch((err) => {
  printError(`错误: ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
