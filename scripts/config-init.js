#!/usr/bin/env node
/**
 * OpenClawWeChat 插件配置初始化脚本
 * 用法: node scripts/config-init.js
 * 或: npm run config-init
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const PLUGIN_ID = 'openclawwechat';
const CONFIG_FILE = path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'openclaw.json');
const PLACEHOLDER_API_KEY = 'YOUR_API_KEY_HERE';
const MANIFEST_FILE = path.join(__dirname, '..', 'openclaw.plugin.json');
const PACKAGE_FILE = path.join(__dirname, '..', 'package.json');
const EXTENSIONS_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'extensions');
const PLUGIN_DIR = path.join(EXTENSIONS_DIR, PLUGIN_ID);

// 从插件清单读取默认值（延迟加载，避免在 printWarning 定义前调用）
function loadDefaultsFromManifest() {
  try {
    if (!fs.existsSync(MANIFEST_FILE)) {
      // 使用 console.warn 而不是 printWarning，因为可能在 printWarning 定义前调用
      console.warn(`⚠ 插件清单文件不存在: ${MANIFEST_FILE}，使用硬编码默认值`);
      return {
        apiKey: PLACEHOLDER_API_KEY,
        pollIntervalMs: 2000,
        sessionKey: 'agent:main:main',
        debug: false
      };
    }
    
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
    const defaults = {};
    
    if (manifest.configSchema?.properties) {
      for (const [key, prop] of Object.entries(manifest.configSchema.properties)) {
        if (prop.default !== undefined) {
          defaults[key] = prop.default;
        }
      }
    }
    
    return defaults;
  } catch (err) {
    // 使用 console.warn 而不是 printWarning，因为可能在 printWarning 定义前调用
    console.warn(`⚠ 读取插件清单失败: ${err.message}，使用硬编码默认值`);
    return {
      apiKey: PLACEHOLDER_API_KEY,
      pollIntervalMs: 2000,
      sessionKey: 'agent:main:main',
      debug: false
    };
  }
}

// 默认配置（从清单读取，延迟到需要时再加载）
let DEFAULT_CONFIG_CACHE = null;
function getDefaultConfig() {
  if (DEFAULT_CONFIG_CACHE === null) {
    DEFAULT_CONFIG_CACHE = loadDefaultsFromManifest();
  }
  return DEFAULT_CONFIG_CACHE;
}

// 颜色输出（如果支持）
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

function printHeader(msg) {
  console.log(colorize(`\n${msg}`, 'bright'));
}

// 创建 readline 接口
function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
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

// 验证 API Key 格式
function validateApiKey(apiKey) {
  if (!apiKey || apiKey === PLACEHOLDER_API_KEY) {
    return { valid: false, error: 'API Key 不能为空或使用占位符' };
  }
  
  const parts = apiKey.split(':');
  if (parts.length !== 2) {
    return { valid: false, error: 'API Key 格式错误，应为 bot_id:secret' };
  }
  
  const [botId, secret] = parts;
  if (!botId || !/^\d+$/.test(botId)) {
    return { valid: false, error: 'bot_id 应为数字' };
  }
  
  if (!secret || secret.length !== 35) {
    return { valid: false, error: 'secret 应为 35 位字符' };
  }
  
  return { valid: true };
}

// 验证 Session Key 格式（需符合 OpenClaw：agent:<agentId>:<rest>，至少 3 段）
function validateSessionKey(sessionKey) {
  if (!sessionKey || typeof sessionKey !== 'string') {
    return { valid: false, error: 'Session Key 不能为空' };
  }
  const raw = sessionKey.trim();
  if (!raw) {
    return { valid: false, error: 'Session Key 不能为空' };
  }
  const parts = raw.split(':').filter(Boolean);
  if (parts.length < 3) {
    return { valid: false, error: '格式应为 agent:<agentId>:<rest>，至少 3 段，例如 agent:main:main' };
  }
  if (parts[0].toLowerCase() !== 'agent') {
    return { valid: false, error: '必须以 agent: 开头' };
  }
  if (!parts[1]?.trim()) {
    return { valid: false, error: 'agentId 不能为空' };
  }
  const rest = parts.slice(2).join(':');
  if (!rest.trim()) {
    return { valid: false, error: '第三段及之后不能为空' };
  }
  return { valid: true };
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
    // 确保目录存在
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // 格式化 JSON（2 空格缩进）
    const content = JSON.stringify(config, null, 2) + '\n';
    fs.writeFileSync(CONFIG_FILE, content, 'utf-8');
    return true;
  } catch (err) {
    printError(`写入配置文件失败: ${err.message}`);
    return false;
  }
}

// 获取插件配置
function getPluginConfig(config) {
  if (!config?.plugins?.entries?.[PLUGIN_ID]) {
    return null;
  }
  return config.plugins.entries[PLUGIN_ID].config || null;
}

// 读取 package.json 获取版本信息
function readPackageInfo() {
  try {
    if (!fs.existsSync(PACKAGE_FILE)) {
      return null;
    }
    const content = fs.readFileSync(PACKAGE_FILE, 'utf-8');
    const pkg = JSON.parse(content);
    return {
      name: pkg.name || PLUGIN_ID,
      version: pkg.version || '1.0.0'
    };
  } catch (err) {
    printWarning(`读取 package.json 失败: ${err.message}，使用默认值`);
    return {
      name: PLUGIN_ID,
      version: '1.0.0'
    };
  }
}

// 设置插件配置
function setPluginConfig(config, pluginConfig) {
  if (!config.plugins) {
    config.plugins = {};
  }
  if (!config.plugins.entries) {
    config.plugins.entries = {};
  }
  if (!config.plugins.entries[PLUGIN_ID]) {
    config.plugins.entries[PLUGIN_ID] = {};
  }
  
  config.plugins.entries[PLUGIN_ID].enabled = true;
  config.plugins.entries[PLUGIN_ID].config = pluginConfig;
  
  return config;
}

// 设置插件安装记录
function setPluginInstallRecord(config) {
  if (!config.plugins) {
    config.plugins = {};
  }
  if (!config.plugins.installs) {
    config.plugins.installs = {};
  }
  
  // 读取 package.json 获取版本信息
  const pkgInfo = readPackageInfo();
  const npmSpec = pkgInfo?.name || PLUGIN_ID;
  const version = pkgInfo?.version || '1.0.0';
  
  // 检查插件目录是否存在
  const installPath = PLUGIN_DIR;
  const installPathExists = fs.existsSync(installPath);
  
  // 如果插件目录存在，使用实际路径；否则使用相对路径
  const resolvedInstallPath = installPathExists 
    ? installPath 
    : `~/.openclaw/extensions/${PLUGIN_ID}`;
  
  config.plugins.installs[PLUGIN_ID] = {
    source: 'npm',
    spec: npmSpec,
    installPath: resolvedInstallPath,
    version: version,
    installedAt: new Date().toISOString()
  };
  
  return config;
}

// 合并配置（保留用户已有配置）
function mergeConfig(existing, defaults) {
  if (!existing) {
    return { ...defaults };
  }
  
  return {
    ...defaults,
    ...existing,
    // API Key 如果是占位符，使用默认值
    apiKey: existing.apiKey === PLACEHOLDER_API_KEY ? defaults.apiKey : existing.apiKey
  };
}

// 过滤默认值，只保留用户自定义的配置
function filterDefaultValues(config, defaults) {
  const filtered = {};
  
  for (const [key, value] of Object.entries(config)) {
    // API Key 总是保留（必需字段）
    if (key === 'apiKey') {
      // 如果 API Key 是占位符，不保存
      if (value !== PLACEHOLDER_API_KEY) {
        filtered[key] = value;
      }
      continue;
    }
    
    // Session Key：格式不符合则跳过，使用 schema 默认值
    if (key === 'sessionKey') {
      if (validateSessionKey(value).valid) {
        const defaultValue = defaults[key];
        if (defaultValue === undefined || value !== defaultValue) {
          filtered[key] = value;
        }
      }
      continue;
    }
    
    // 其他字段：如果与默认值不同，才保留
    const defaultValue = defaults[key];
    if (defaultValue === undefined || value !== defaultValue) {
      filtered[key] = value;
    }
  }
  
  return filtered;
}

// 交互式输入 API Key
async function promptApiKey(rl, currentApiKey = null) {
  if (currentApiKey && currentApiKey !== PLACEHOLDER_API_KEY) {
    printInfo(`当前 API Key: ${currentApiKey.substring(0, 20)}...`);
    const useCurrent = await question(rl, '是否使用当前 API Key? (Y/n): ');
    if (!useCurrent || useCurrent.toLowerCase() === 'y' || useCurrent.toLowerCase() === 'yes') {
      return currentApiKey;
    }
  }
  
  while (true) {
    console.log('');
    printInfo('请输入 API Key（格式：bot_id:secret）');
    printInfo('💡 API Key 可从微信小程序 ClawChat 中获取');
    printInfo('示例: 20231227:EXAMPLE_SECRET_KEY_35_CHARS_LONG_12345');
    const apiKey = await question(rl, 'API Key: ');
    
    if (!apiKey) {
      printWarning('API Key 不能为空');
      continue;
    }
    
    const validation = validateApiKey(apiKey);
    if (!validation.valid) {
      printWarning(validation.error);
      const continue_ = await question(rl, '是否继续？(y/N): ');
      if (continue_.toLowerCase() !== 'y') {
        continue;
      }
    }
    
    return apiKey;
  }
}

// 交互式配置其他选项
async function promptConfig(rl, currentConfig = {}) {
  const config = { ...currentConfig };
  
  // API Key
  config.apiKey = await promptApiKey(rl, currentConfig.apiKey);
  
  const defaults = getDefaultConfig();
  
  // 轮询间隔
  console.log('');
  const pollInterval = await question(
    rl,
    `轮询间隔（毫秒，默认 ${defaults.pollIntervalMs}）: `
  );
  config.pollIntervalMs = pollInterval ? parseInt(pollInterval, 10) : defaults.pollIntervalMs;
  
  // Session Key
  console.log('');
  printInfo('Session Key 用于标识会话，多 Agent 时需与 OpenClaw 的 session 配置一致');
  printInfo('格式：agent:<agentId>:<rest>（如 agent:main:main），直接回车使用默认值');
  let sessionKeyInput;
  while (true) {
    sessionKeyInput = await question(
      rl,
      `Session Key（默认 ${defaults.sessionKey}）: `
    );
    const value = sessionKeyInput ? sessionKeyInput.trim() : '';
    if (!value) {
      config.sessionKey = defaults.sessionKey;
      break;
    }
    const validation = validateSessionKey(value);
    if (validation.valid) {
      config.sessionKey = value;
      break;
    }
    printWarning(validation.error);
  }
  // 再次校验，防止意外写入无效值
  if (!validateSessionKey(config.sessionKey).valid) {
    config.sessionKey = defaults.sessionKey;
  }
  
  // 调试模式
  const debug = await question(
    rl,
    `是否启用调试日志？(y/N，默认 ${defaults.debug}): `
  );
  config.debug = debug.toLowerCase() === 'y' || debug.toLowerCase() === 'yes';
  
  return config;
}

// 显示配置预览（显示完整配置，包括默认值）
function showConfigPreview(config, defaults) {
  console.log('');
  printHeader('配置预览（完整配置，包括默认值）:');
  console.log(JSON.stringify(config, null, 2));
  console.log('');
  
  // 显示哪些配置将被保存（过滤默认值后）
  const minimalConfig = filterDefaultValues(config, defaults);
  printInfo('实际保存的配置（仅用户自定义项）:');
  console.log(JSON.stringify(minimalConfig, null, 2));
  console.log('');
  
  if (Object.keys(minimalConfig).length === 0) {
    printWarning('警告：没有需要保存的配置项（所有值都是默认值）');
  }
}

// 主函数
async function main() {
  const rl = createRL();
  
  try {
    printHeader('╔════════════════════════════════════════╗');
    printHeader('║   OpenClawWeChat 配置初始化脚本        ║');
    printHeader('╚════════════════════════════════════════╝');
    
    // 检查配置文件
    printInfo(`配置文件: ${CONFIG_FILE}`);
    
    let config = readConfig();
    if (!config) {
      printWarning('配置文件不存在，将创建新配置');
      config = {
        plugins: {
          enabled: true,
          entries: {}
        }
    };
    }
    
    // 获取当前插件配置
    const currentConfig = getPluginConfig(config);
    
    if (currentConfig) {
      printInfo('插件配置已存在');
      console.log('');
      printInfo('当前配置:');
      console.log(JSON.stringify(currentConfig, null, 2));
      console.log('');
      
      const update = await question(rl, '是否更新配置？(y/N): ');
      if (update.toLowerCase() !== 'y' && update.toLowerCase() !== 'yes') {
        printInfo('已取消，配置未更改');
        rl.close();
        return;
      }
    } else {
      printInfo('插件配置不存在，将创建新配置');
    }
    
    // 获取默认配置
    const defaults = getDefaultConfig();
    
    // 交互式配置
    const mergedConfig = mergeConfig(currentConfig, defaults);
    const newConfig = await promptConfig(rl, mergedConfig);
    
    // 显示预览（完整配置和最小配置）
    showConfigPreview(newConfig, defaults);
    
    // 确认
    const confirm = await question(rl, '确认保存配置？(Y/n): ');
    if (confirm && confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== '') {
      printInfo('已取消，配置未保存');
      rl.close();
      return;
    }
    
    // 过滤默认值，只保存用户自定义的配置
    const minimalConfig = filterDefaultValues(newConfig, defaults);
    
    // 检查 API Key 是否已配置
    if (!minimalConfig.apiKey || minimalConfig.apiKey === PLACEHOLDER_API_KEY) {
      printError('API Key 未配置或使用占位符，无法保存配置');
      printInfo('请配置有效的 API Key 后再试');
      rl.close();
      return;
    }
    
    // 如果过滤后只有 API Key（其他都是默认值），提示用户
    const nonApiKeyKeys = Object.keys(minimalConfig).filter(k => k !== 'apiKey');
    if (nonApiKeyKeys.length === 0) {
      printInfo('其他配置项都使用默认值，只保存 API Key');
      printInfo('OpenClaw 将从插件清单中读取其他配置的默认值');
    }
    
    // 保存配置（最小化配置）
    let updatedConfig = setPluginConfig(config, minimalConfig);
    
    // 添加插件安装记录
    updatedConfig = setPluginInstallRecord(updatedConfig);
    
    if (writeConfig(updatedConfig)) {
      printSuccess('配置已保存！');
      console.log('');
      printInfo('下一步：');
      console.log('  1. 重启 OpenClaw Gateway:');
      console.log(`     ${colorize('openclaw gateway restart', 'green')}`);
      console.log('');
      console.log('  2. 查看日志确认插件已加载:');
      console.log(`     ${colorize(`openclaw logs --follow | grep "${PLUGIN_ID}"`, 'green')}`);
      console.log('  3. 微信小程序 ClawChat 查看链接状态是否为绿色，或在小程序里与OpenClaw对话测试。');

      console.log('');
    } else {
      printError('配置保存失败');
      process.exit(1);
    }
    
  } catch (err) {
    printError(`错误: ${err.message}`);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

// 运行主函数
main().catch((err) => {
  printError(`未处理的错误: ${err.message}`);
  process.exit(1);
});
