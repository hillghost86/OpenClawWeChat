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
        pollIntervalMs: 5000,
        sessionKey: 'agent:main:main',
        debug: false
      };
    }
    
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
    const defaults = {
      apiKey: PLACEHOLDER_API_KEY,
      pollIntervalMs: 5000,
      sessionKey: 'agent:main:main',
      debug: false
    };

    const rootProps = manifest.configSchema?.properties || {};
    const configProps = rootProps.config?.properties || {};

    // 兼容新 schema（config.*）与旧 schema（平铺字段）
    const candidateProps = Object.keys(configProps).length > 0 ? configProps : rootProps;
    for (const [key, prop] of Object.entries(candidateProps)) {
      if (prop && typeof prop === 'object' && prop.default !== undefined) {
        defaults[key] = prop.default;
      }
    }

    return defaults;
  } catch (err) {
    // 使用 console.warn 而不是 printWarning，因为可能在 printWarning 定义前调用
    console.warn(`⚠ 读取插件清单失败: ${err.message}，使用硬编码默认值`);
    return {
      apiKey: PLACEHOLDER_API_KEY,
      pollIntervalMs: 5000,
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

function isYes(input) {
  const raw = typeof input === 'string' ? input.trim().toLowerCase() : '';
  return raw === 'y' || raw === 'yes';
}

function isMultiConfigShape(value) {
  return Boolean(value && typeof value === 'object' && value.accounts && typeof value.accounts === 'object');
}

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function pickSingleAccountFields(value) {
  const obj = asObject(value);
  const picked = {};
  if (typeof obj.apiKey === 'string') picked.apiKey = obj.apiKey;
  if (typeof obj.pollIntervalMs === 'number') picked.pollIntervalMs = obj.pollIntervalMs;
  if (typeof obj.sessionKey === 'string') picked.sessionKey = obj.sessionKey;
  if (typeof obj.sessionKeyPrefix === 'string') picked.sessionKeyPrefix = obj.sessionKeyPrefix;
  if (typeof obj.debug === 'boolean') picked.debug = obj.debug;
  return picked;
}

function normalizePluginPayload(entry) {
  const entryObj = asObject(entry);
  const configObj = asObject(entryObj.config);
  const siblingAccounts = asObject(entryObj.accounts);
  const siblingDefaults = asObject(entryObj.defaults);

  const hasNestedShape =
    Object.prototype.hasOwnProperty.call(configObj, 'accounts') ||
    Object.prototype.hasOwnProperty.call(configObj, 'defaults') ||
    Object.prototype.hasOwnProperty.call(configObj, 'config');
  if (hasNestedShape) {
    const normalized = {
      ...(Object.keys(asObject(configObj.config)).length > 0 ? { config: asObject(configObj.config) } : {}),
      ...(Object.keys(asObject(configObj.defaults)).length > 0 ? { defaults: asObject(configObj.defaults) } : {}),
      ...(Object.keys(asObject(configObj.accounts)).length > 0 ? { accounts: asObject(configObj.accounts) } : {})
    };
    return {
      payload: normalized,
      mode: Object.keys(asObject(normalized.accounts)).length > 0 ? 'multi' : 'single',
      migrationNeeded: false
    };
  }

  const hasSiblingMulti =
    Object.keys(siblingAccounts).length > 0 || Object.keys(siblingDefaults).length > 0;
  if (hasSiblingMulti) {
    const legacySingle = pickSingleAccountFields(configObj);
    const migrated = {
      ...(Object.keys(legacySingle).length > 0 ? { config: legacySingle } : {}),
      ...(Object.keys(siblingDefaults).length > 0 ? { defaults: siblingDefaults } : {}),
      ...(Object.keys(siblingAccounts).length > 0 ? { accounts: siblingAccounts } : {})
    };
    return {
      payload: migrated,
      mode: 'multi',
      migrationNeeded: true
    };
  }

  // 极旧结构：字段直接写在 entries[PLUGIN_ID] 下
  const veryLegacySingle = pickSingleAccountFields(entryObj);
  if (Object.keys(veryLegacySingle).length > 0 && Object.keys(configObj).length === 0) {
    return {
      payload: veryLegacySingle,
      mode: 'single',
      migrationNeeded: true
    };
  }

  return {
    payload: configObj,
    mode: 'single',
    migrationNeeded: false
  };
}

function extractSingleConfig(currentConfig) {
  if (!currentConfig || typeof currentConfig !== 'object') return null;
  if (
    currentConfig.config &&
    typeof currentConfig.config === 'object' &&
    !currentConfig.accounts &&
    !currentConfig.defaults
  ) {
    return currentConfig.config;
  }
  if (isMultiConfigShape(currentConfig)) {
    return currentConfig.config && typeof currentConfig.config === 'object'
      ? currentConfig.config
      : null;
  }
  return currentConfig;
}

async function promptMode(rl, currentMode = 'init-update') {
  while (true) {
    console.log('');
    printHeader('选择配置模式：');
    console.log('  1) 初始化/更新 ApiKey');
    console.log('  2) 新增 ApiKey');
    console.log('  3) 删除 ApiKey');
    const mode = await question(rl, '请输入选项（默认 1）: ');
    const normalized = mode.trim();
    if (!normalized) return currentMode;
    if (normalized === '1' || normalized.toLowerCase() === 'init' || normalized.toLowerCase() === 'update') return 'init-update';
    if (normalized === '2' || normalized.toLowerCase() === 'add') return 'add-account';
    if (normalized === '3' || normalized.toLowerCase() === 'delete') return 'delete-account';
    printWarning('请输入 1、2 或 3');
  }
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

function normalizeApiKeyValue(value) {
  return typeof value === 'string' ? value.trim() : '';
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
  const normalized = normalizePluginPayload(config.plugins.entries[PLUGIN_ID]);
  return normalized.payload || null;
}

function isMigrationNeeded(config) {
  if (!config?.plugins?.entries?.[PLUGIN_ID]) return false;
  return normalizePluginPayload(config.plugins.entries[PLUGIN_ID]).migrationNeeded;
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

  // 统一写入到 entries[PLUGIN_ID].config，确保新旧结构最终归一
  config.plugins.entries[PLUGIN_ID].config = pluginConfig;
  // 清理旧结构残留，避免单/多模式切换后被误解析
  delete config.plugins.entries[PLUGIN_ID].accounts;
  delete config.plugins.entries[PLUGIN_ID].defaults;
  delete config.plugins.entries[PLUGIN_ID].apiKey;
  delete config.plugins.entries[PLUGIN_ID].pollIntervalMs;
  delete config.plugins.entries[PLUGIN_ID].sessionKey;
  delete config.plugins.entries[PLUGIN_ID].sessionKeyPrefix;
  delete config.plugins.entries[PLUGIN_ID].debug;
  
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
    if (!useCurrent || isYes(useCurrent)) {
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
      continue;
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

async function promptRequiredSessionKey(rl, promptText, defaultSessionKey = '') {
  while (true) {
    const input = await question(rl, promptText);
    const value = input ? input.trim() : '';
    if (!value && defaultSessionKey) {
      const validation = validateSessionKey(defaultSessionKey);
      if (!validation.valid) {
        printWarning(`默认 sessionKey 无效：${validation.error}`);
        continue;
      }
      return defaultSessionKey;
    }
    if (!value) {
      printWarning('该账户 sessionKey 必填（可直接回车使用默认值）');
      continue;
    }
    const validation = validateSessionKey(value);
    if (!validation.valid) {
      printWarning(validation.error);
      continue;
    }
    return value;
  }
}

async function promptAccountId(rl, existingIds = []) {
  while (true) {
    const accountId = (await question(rl, '账户名称/ID（如 bot2、enterprise）: ')).trim();
    if (!accountId) {
      printWarning('账户 ID 不能为空');
      continue;
    }
    if (accountId === 'default') {
      printWarning('default 保留给默认账户');
      continue;
    }
    if (existingIds.includes(accountId)) {
      printWarning(`账户 ${accountId} 已存在`);
      continue;
    }
    return accountId;
  }
}

function buildUsedKeySets(accounts = {}) {
  return {
    usedApiKeys: new Set(
      Object.values(accounts)
        .map((acc) => normalizeApiKeyValue(acc && acc.apiKey))
        .filter(Boolean)
    ),
    usedSessionKeys: new Set(
      Object.values(accounts)
        .map((acc) => (acc && typeof acc.sessionKey === 'string' ? acc.sessionKey.trim() : ''))
        .filter(Boolean)
    )
  };
}

async function promptUniqueApiKey(rl, usedApiKeys, duplicateMsg) {
  while (true) {
    const apiKey = await promptApiKey(rl, null);
    const normalizedApiKey = normalizeApiKeyValue(apiKey);
    if (usedApiKeys.has(normalizedApiKey)) {
      printWarning(duplicateMsg);
      continue;
    }
    usedApiKeys.add(normalizedApiKey);
    return apiKey;
  }
}

async function promptUniqueSessionKey(rl, usedSessionKeys, promptText, defaultSessionKey, duplicateMsg) {
  while (true) {
    const sessionKey = await promptRequiredSessionKey(rl, promptText, defaultSessionKey);
    if (usedSessionKeys.has(sessionKey)) {
      printWarning(duplicateMsg);
      continue;
    }
    usedSessionKeys.add(sessionKey);
    return sessionKey;
  }
}

async function promptAddOneAccount(rl, existingAccounts = {}) {
  const result = {
    ...existingAccounts
  };
  const existingIds = Object.keys(result);
  const { usedApiKeys: existingApiKeys, usedSessionKeys: existingSessionKeys } = buildUsedKeySets(result);

  const accountId = await promptAccountId(rl, existingIds);
  const apiKey = await promptUniqueApiKey(rl, existingApiKeys, 'API Key 与现有账户重复，请输入其他 API Key');
  const suggestedSessionKey = `agent:main:wechat:${accountId}`;

  const sessionKey = await promptUniqueSessionKey(
    rl,
    existingSessionKeys,
    `${accountId}.sessionKey（必填，默认 ${suggestedSessionKey}）: `,
    suggestedSessionKey,
    'sessionKey 与现有账户重复，请重新输入'
  );

  result[accountId] = {
    apiKey,
    sessionKey
  };
  return result;
}

async function promptDeleteOneAccount(rl, existingAccounts = {}, existingDefaults = {}, fallbackDefaults = {}) {
  const accounts = { ...existingAccounts };
  const deletableIds = Object.keys(accounts).filter((id) => id !== 'default');
  if (deletableIds.length === 0) {
    printWarning('当前没有可删除的非 default 账户');
    return null;
  }

  console.log('');
  printHeader('可删除账户列表：');
  deletableIds.forEach((id, idx) => {
    const apiKeyMasked = normalizeApiKeyValue(accounts[id]?.apiKey);
    const masked = apiKeyMasked ? `${apiKeyMasked.slice(0, 14)}...` : '(无 apiKey)';
    console.log(`  ${idx + 1}) ${id}  ${masked}`);
  });
  console.log('');

  let selectedId = '';
  while (true) {
    const input = (await question(rl, '请输入要删除的账户（编号或 accountId）: ')).trim();
    if (!input) {
      printWarning('输入不能为空');
      continue;
    }
    if (/^\d+$/.test(input)) {
      const index = parseInt(input, 10) - 1;
      if (index >= 0 && index < deletableIds.length) {
        selectedId = deletableIds[index];
        break;
      }
      printWarning('编号无效');
      continue;
    }
    if (deletableIds.includes(input)) {
      selectedId = input;
      break;
    }
    if (input === 'default') {
      printWarning('为避免配置不可用，当前不允许删除 default 账户');
      continue;
    }
    printWarning('账户不存在');
  }

  const confirmDelete = await question(rl, `确认删除账户 ${selectedId} 吗？(y/N): `);
  if (!isYes(confirmDelete)) {
    printInfo('已取消删除');
    return null;
  }

  delete accounts[selectedId];

  return {
    defaults: {
      pollIntervalMs: typeof existingDefaults.pollIntervalMs === 'number' ? existingDefaults.pollIntervalMs : fallbackDefaults.pollIntervalMs,
      debug: typeof existingDefaults.debug === 'boolean' ? existingDefaults.debug : fallbackDefaults.debug
    },
    accounts
  };
}

async function promptInitOrUpdateConfig(rl, currentConfig = null, defaults = {}) {
  const result = {
    defaults: {
      pollIntervalMs: defaults.pollIntervalMs ?? 5000,
      debug: defaults.debug ?? false
    },
    accounts: {}
  };

  const currentIsMulti = isMultiConfigShape(currentConfig);
  const currentDefaults = currentIsMulti ? (currentConfig?.defaults || {}) : (extractSingleConfig(currentConfig) || {});
  const currentAccounts = currentIsMulti ? (currentConfig?.accounts || {}) : {};
  const { usedApiKeys, usedSessionKeys } = buildUsedKeySets({});

  console.log('');
  const pollInterval = await question(
    rl,
    `默认轮询间隔（毫秒，默认 ${currentDefaults.pollIntervalMs ?? result.defaults.pollIntervalMs}）: `
  );
  result.defaults.pollIntervalMs = pollInterval
    ? parseInt(pollInterval, 10)
    : (currentDefaults.pollIntervalMs ?? result.defaults.pollIntervalMs);

  const debug = await question(
    rl,
    `默认是否启用调试日志？(y/N，默认 ${currentDefaults.debug ?? result.defaults.debug}): `
  );
  if (debug) {
    result.defaults.debug = debug.toLowerCase() === 'y' || debug.toLowerCase() === 'yes';
  } else {
    result.defaults.debug = currentDefaults.debug ?? result.defaults.debug;
  }

  printHeader('初始化/更新 default 账户');
  const currentDefault = currentAccounts.default || {};
  const defaultApiKey = await promptApiKey(rl, currentDefault.apiKey || null);
  if (normalizeApiKeyValue(defaultApiKey)) {
    usedApiKeys.add(normalizeApiKeyValue(defaultApiKey));
  }
  const defaultSessionInput = await question(
    rl,
    `default.sessionKey（可空，默认 agent:main:main）${currentDefault.sessionKey ? `，当前 ${currentDefault.sessionKey}` : ''}: `
  );
  const defaultSession = defaultSessionInput ? defaultSessionInput.trim() : (currentDefault.sessionKey || '');
  if (defaultSession && !validateSessionKey(defaultSession).valid) {
    printWarning('default.sessionKey 格式无效，已忽略，回落默认 sessionKey');
  } else if (defaultSession) {
    usedSessionKeys.add(defaultSession);
  }
  result.accounts.default = {
    apiKey: defaultApiKey,
    ...(defaultSession && validateSessionKey(defaultSession).valid ? { sessionKey: defaultSession } : {})
  };

  // 初始化/更新入口不新增账户；已有非 default 账户自动保留。
  let preservedCount = 0;
  const existingIds = Object.keys(currentAccounts).filter((id) => id !== 'default');
  for (const existingId of existingIds) {
    const existing = { ...currentAccounts[existingId] };
    if (!existing.apiKey || !normalizeApiKeyValue(existing.apiKey)) {
      printWarning(`现有账户 ${existingId} 缺少 apiKey，跳过保留`);
      continue;
    }
    if (usedApiKeys.has(normalizeApiKeyValue(existing.apiKey))) {
      printWarning(`现有账户 ${existingId} 的 apiKey 与其他账户重复，跳过保留`);
      continue;
    }
    usedApiKeys.add(normalizeApiKeyValue(existing.apiKey));
    // 非 default 账户，sessionKey 在多账户模式下必须存在且格式正确
    if (!existing.sessionKey || !validateSessionKey(existing.sessionKey).valid) {
      printWarning(`现有账户 ${existingId} 的 sessionKey 无效，跳过保留`);
      continue;
    }
    if (usedSessionKeys.has(existing.sessionKey)) {
      printWarning(`现有账户 ${existingId} 的 sessionKey 与其他账户重复，跳过保留`);
      continue;
    }
    usedSessionKeys.add(existing.sessionKey);
    result.accounts[existingId] = existing;
    preservedCount += 1;
  }
  if (preservedCount > 0) {
    printInfo(`已自动保留 ${preservedCount} 个非 default 账户；如需变更请使用“新增账户/删除账户”`);
  }

  return result;
}

function validateMultiPayload(payload) {
  const errors = [];
  const defaults = asObject(payload?.defaults);
  const accounts = asObject(payload?.accounts);
  const accountIds = Object.keys(accounts);
  if (!accountIds.length) {
    errors.push('accounts 不能为空');
    return { ok: false, errors };
  }
  if (!accounts.default || !normalizeApiKeyValue(accounts.default.apiKey)) {
    errors.push('accounts.default.apiKey 必填');
  }
  if (defaults.pollIntervalMs !== undefined) {
    const n = Number(defaults.pollIntervalMs);
    if (!Number.isFinite(n) || n < 500 || n > 60000) {
      errors.push('defaults.pollIntervalMs 必须在 500-60000 之间');
    }
  }
  const seenApiKeys = new Set();
  const seenSessionKeys = new Set();
  for (const id of accountIds) {
    const acc = asObject(accounts[id]);
    const apiKey = normalizeApiKeyValue(acc.apiKey);
    if (!apiKey) {
      errors.push(`accounts.${id}.apiKey 必填`);
      continue;
    }
    const apiKeyValidation = validateApiKey(apiKey);
    if (!apiKeyValidation.valid) {
      errors.push(`accounts.${id}.apiKey 不合法：${apiKeyValidation.error}`);
      continue;
    }
    if (seenApiKeys.has(apiKey)) {
      errors.push(`accounts.${id}.apiKey 与其他账户重复`);
    }
    seenApiKeys.add(apiKey);
    const sessionKey = typeof acc.sessionKey === 'string' ? acc.sessionKey.trim() : '';
    if (id !== 'default' && !sessionKey) {
      errors.push(`accounts.${id}.sessionKey 必填`);
    }
    if (sessionKey) {
      const valid = validateSessionKey(sessionKey);
      if (!valid.valid) {
        errors.push(`accounts.${id}.sessionKey 不合法：${valid.error}`);
      } else if (seenSessionKeys.has(sessionKey)) {
        errors.push(`accounts.${id}.sessionKey 与其他账户重复`);
      } else {
        seenSessionKeys.add(sessionKey);
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

function buildDefaults(existingDefaults = {}, fallbackDefaults = {}) {
  return {
    pollIntervalMs:
      typeof existingDefaults.pollIntervalMs === 'number'
        ? existingDefaults.pollIntervalMs
        : fallbackDefaults.pollIntervalMs,
    debug:
      typeof existingDefaults.debug === 'boolean'
        ? existingDefaults.debug
        : fallbackDefaults.debug
  };
}

function pickNonDefaultDefaults(resolvedDefaults = {}, fallbackDefaults = {}) {
  const out = {};
  if (
    typeof resolvedDefaults.pollIntervalMs === 'number' &&
    resolvedDefaults.pollIntervalMs !== fallbackDefaults.pollIntervalMs
  ) {
    out.pollIntervalMs = resolvedDefaults.pollIntervalMs;
  }
  if (
    typeof resolvedDefaults.debug === 'boolean' &&
    resolvedDefaults.debug !== fallbackDefaults.debug
  ) {
    out.debug = resolvedDefaults.debug;
  }
  return out;
}

function compactPayloadDefaults(payload = {}, fallbackDefaults = {}) {
  const compactDefaults = pickNonDefaultDefaults(asObject(payload.defaults), fallbackDefaults);
  return {
    ...(Object.keys(compactDefaults).length > 0 ? { defaults: compactDefaults } : {}),
    accounts: asObject(payload.accounts)
  };
}

function showPayloadPreview(title, payload) {
  console.log('');
  printHeader(title);
  console.log(JSON.stringify(payload, null, 2));
  console.log('');
}

function validatePayloadOrAbort(rl, payload, sceneText) {
  const validated = validateMultiPayload(payload);
  if (!validated.ok) {
    printError(`${sceneText}: ${validated.errors.join('; ')}`);
    rl.close();
    return false;
  }
  return true;
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
    
    // 获取当前插件配置（可能是单账户或多账户结构）
    const currentConfig = getPluginConfig(config);
    const migrationNeeded = isMigrationNeeded(config);
    
    if (currentConfig) {
      printInfo('插件配置已存在');
      if (migrationNeeded) {
        printWarning('检测到旧配置结构，将在本次保存时自动迁移到新结构（entries.<id>.config）');
      }
      console.log('');
      printInfo('当前配置:');
      console.log(JSON.stringify(currentConfig, null, 2));
      console.log('');
      
      const update = await question(rl, '是否更新配置？(y/N): ');
      if (!isYes(update)) {
        printInfo('已取消，配置未更改');
        rl.close();
        return;
      }
    } else {
      printInfo('插件配置不存在，将创建新配置');
    }
    
    // 获取默认配置
    const defaults = getDefaultConfig();

    const currentMode = 'init-update';
    const mode = await promptMode(rl, currentMode);

    let pluginPayload;
    if (mode === 'init-update') {
      const newMultiConfigRaw = await promptInitOrUpdateConfig(rl, currentConfig, defaults);
      const newMultiConfig = compactPayloadDefaults(newMultiConfigRaw, defaults);
      showPayloadPreview('初始化/更新后的配置预览:', newMultiConfig);
      pluginPayload = newMultiConfig;
    } else if (mode === 'add-account') {
      // 新增账户：支持“已有多账户直接追加”与“单账户转多账户后追加”
      const currentIsMulti = isMultiConfigShape(currentConfig);
      if (currentIsMulti) {
        const existingAccounts = asObject(currentConfig.accounts);
        const existingDefaults = asObject(currentConfig.defaults);
        if (!existingAccounts.default || !existingAccounts.default.apiKey) {
          printError('当前多账户配置缺少 default.apiKey，无法新增账户');
          rl.close();
          return;
        }
        printInfo('将在现有多账户配置上新增一个账户');
        const accounts = await promptAddOneAccount(rl, existingAccounts);
        pluginPayload = {
          ...(Object.keys(pickNonDefaultDefaults(buildDefaults(existingDefaults, defaults), defaults)).length > 0
            ? { defaults: pickNonDefaultDefaults(buildDefaults(existingDefaults, defaults), defaults) }
            : {}),
          accounts
        };
        if (!validatePayloadOrAbort(rl, pluginPayload, '新增账户失败')) {
          return;
        }
      } else {
        const legacyCurrent = extractSingleConfig(currentConfig);
        if (!legacyCurrent || !legacyCurrent.apiKey) {
          printError('当前不是有效的单账户配置（缺少 apiKey），无法直接“新增账户”');
          printInfo('请先选择模式 1 初始化/更新 default 账户，再执行新增');
          rl.close();
          return;
        }

        const currentSession = legacyCurrent.sessionKey && validateSessionKey(legacyCurrent.sessionKey).valid
          ? legacyCurrent.sessionKey.trim()
          : undefined;
        const currentDefaults = buildDefaults(legacyCurrent, defaults);

        printInfo('将基于当前单账户配置自动迁移为多账户，并新增一个账户');
        const accounts = await promptAddOneAccount(rl, {
          default: {
            apiKey: legacyCurrent.apiKey,
            ...(currentSession ? { sessionKey: currentSession } : {})
          }
        });

        pluginPayload = {
          ...(Object.keys(pickNonDefaultDefaults(currentDefaults, defaults)).length > 0
            ? { defaults: pickNonDefaultDefaults(currentDefaults, defaults) }
            : {}),
          accounts
        };
        if (!validatePayloadOrAbort(rl, pluginPayload, '新增账户失败')) {
          return;
        }
      }

      showPayloadPreview('新增账户后的多账户配置预览:', pluginPayload);
    } else {
      // 删除账户：仅在多账户下支持，默认不允许删除 default
      const currentIsMulti = isMultiConfigShape(currentConfig);
      if (!currentIsMulti) {
        printError('当前不是多账户配置，无法执行删除账户操作');
        printInfo('请先切换到模式 1 初始化/更新 default 账户，再执行删除');
        rl.close();
        return;
      }

      const existingAccounts = asObject(currentConfig.accounts);
      const existingDefaults = asObject(currentConfig.defaults);
      const deleted = await promptDeleteOneAccount(rl, existingAccounts, existingDefaults, defaults);
      if (!deleted) {
        rl.close();
        return;
      }
      pluginPayload = compactPayloadDefaults(deleted, defaults);
      if (!validatePayloadOrAbort(rl, pluginPayload, '删除账户后配置不合法')) {
        return;
      }

      showPayloadPreview('删除账户后的多账户配置预览:', pluginPayload);
    }
    
    // 确认
    const confirm = await question(rl, '确认保存配置？(Y/n): ');
    if (confirm && !isYes(confirm)) {
      printInfo('已取消，配置未保存');
      rl.close();
      return;
    }
    
    // 保存配置
    let updatedConfig = setPluginConfig(config, pluginPayload);
    
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
