const fs = require("fs");
const os = require("os");
const path = require("path");

function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value.replace(/\\n/g, "\n");
    }
  } catch {}
}

loadEnvFile(path.resolve(process.cwd(), ".env"));

const bool = (v, d = false) => (v === undefined ? d : ["1", "true", "yes", "on"].includes(String(v).toLowerCase()));
const number = (name, fallback, min, max) => {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

const DEFAULTS = {
  workspace: path.resolve(process.env.WORKSPACE || process.cwd()),
  provider: process.env.MODEL_PROVIDER || process.env.AI_PROVIDER || "custom",
  model: process.env.MODEL || process.env.AI_MODEL || "openai/gpt-oss-120b",
  apiUrl: process.env.API_URL || process.env.AI_PROXY_URL || "https://groq-proxy.mr-hackerdon808.workers.dev/",
  apiKey: process.env.AI_API_KEY || process.env.API_KEY || "",
  fallbackModels: (process.env.AI_FALLBACK_MODELS || process.env.MODEL_FALLBACK || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
  maxOutputTokens: number("MAX_OUTPUT_TOKENS", 5000, 256, 32000),
  temperature: number("TEMPERATURE", 0.15, 0, 2),
  maxSteps: number("MAX_STEPS", 60, 1, 200),
  commandTimeoutMs: number("COMMAND_TIMEOUT_MS", 120000, 1000, 1800000),
  requestTimeoutMs: number("REQUEST_TIMEOUT_MS", 120000, 1000, 600000),
  aiRetries: number("AI_RETRIES", 3, 0, 8),
  autoApproveSafe: bool(process.env.AUTO_APPROVE_SAFE, true),
  allowNetwork: bool(process.env.ALLOW_NETWORK, false),
  checkpoints: bool(process.env.CHECKPOINTS, true),
  backups: bool(process.env.BACKUPS, true),
  maxBackups: number("MAX_BACKUPS", 25, 1, 200),
  maxFileBytes: number("MAX_FILE_BYTES", 500000, 1000, 10000000),
  maxToolOutput: number("MAX_TOOL_OUTPUT", 20000, 2000, 100000),
  memoryMaxItems: number("MEMORY_MAX_ITEMS", 250, 10, 5000),
  memoryRecallItems: number("MEMORY_RECALL_ITEMS", 12, 1, 100),
  conversationWindow: number("CONVERSATION_WINDOW", 24, 6, 100),
  contextWindow: number("CONTEXT_WINDOW", 128000, 2000, 1000000),
  tokenBudget: number("TOKEN_BUDGET", 24000, 2000, 200000),
  maxRepairAttempts: number("MAX_REPAIR_ATTEMPTS", 3, 0, 12),
  planApproval: bool(process.env.PLAN_APPROVAL, false),
  ignoredDirs: (process.env.IGNORED_DIRS || "node_modules,.git,.cache,__pycache__,dist,build,.agent,.agents,.venv")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
};

function globalDir() {
  return path.join(os.homedir(), ".agents");
}

function projectDir(workspace = DEFAULTS.workspace) {
  return path.join(workspace, ".agents");
}

function mergeLayer(target, layer = {}) {
  if (!layer || typeof layer !== "object") return target;
  const map = {
    workspace: "workspace",
    provider: "provider",
    model: "model",
    apiUrl: "apiUrl",
    api_url: "apiUrl",
    apiKey: "apiKey",
    api_key: "apiKey",
    fallbackModels: "fallbackModels",
    maxSteps: "maxSteps",
    allowNetwork: "allowNetwork",
    autoApproveSafe: "autoApproveSafe",
    checkpoints: "checkpoints",
    backups: "backups",
    tokenBudget: "tokenBudget",
    contextWindow: "contextWindow",
    maxRepairAttempts: "maxRepairAttempts",
    planApproval: "planApproval",
    ignoredDirs: "ignoredDirs"
  };
  for (const [key, dest] of Object.entries(map)) {
    if (layer[key] !== undefined) target[dest] = layer[key];
  }
  return target;
}

function build(cliOverrides = {}) {
  const cfg = { ...DEFAULTS };
  mergeLayer(cfg, readJson(path.join(globalDir(), "config.json")));
  const workspace = path.resolve(cliOverrides.workspace || process.env.WORKSPACE || cfg.workspace || DEFAULTS.workspace);
  mergeLayer(cfg, readJson(path.join(workspace, ".agents", "config.json")));
  cfg.workspace = workspace;
  cfg.provider = process.env.MODEL_PROVIDER || process.env.AI_PROVIDER || cfg.provider;
  cfg.model = process.env.MODEL || process.env.AI_MODEL || cfg.model;
  cfg.apiUrl = process.env.API_URL || process.env.AI_PROXY_URL || cfg.apiUrl;
  cfg.apiKey = process.env.AI_API_KEY || process.env.API_KEY || cfg.apiKey;
  Object.assign(cfg, cliOverrides);
  cfg.workspace = path.resolve(cfg.workspace);
  cfg.aiProxyUrl = cfg.apiUrl;
  cfg.aiModel = cfg.model;
  cfg.aiApiKey = cfg.apiKey;
  return cfg;
}

const config = build();

function override(values = {}) {
  Object.assign(config, values);
  if (values.workspace) config.workspace = path.resolve(values.workspace);
  if (values.model) config.aiModel = config.model;
  if (values.apiUrl) config.aiProxyUrl = config.apiUrl;
  if (values.apiKey) config.aiApiKey = config.apiKey;
  if (values.provider) config.provider = values.provider;
  return config;
}

function snapshot() {
  const { apiKey, aiApiKey, ...rest } = config;
  return { ...rest, apiKey: apiKey ? "(set)" : "", aiApiKey: aiApiKey ? "(set)" : "" };
}

module.exports = Object.assign(config, {
  build,
  override,
  snapshot,
  globalDir,
  projectDir: () => projectDir(config.workspace),
  defaults: DEFAULTS
});
