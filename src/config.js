const fs = require("fs");
const path = require("path");
// Tiny dependency-free .env loader: existing process variables always win.
try {
  for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value.replace(/\\n/g, "\n");
  }
} catch {}
const bool = (v, d = false) => v === undefined ? d : ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
const number = (name, fallback, min, max) => {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

module.exports = {
  workspace: path.resolve(process.env.WORKSPACE || process.cwd()),
  aiProxyUrl: process.env.AI_PROXY_URL || "https://groq-proxy.mr-hackerdon808.workers.dev/",
  aiModel: process.env.AI_MODEL || "openai/gpt-oss-120b",
  aiApiKey: process.env.AI_API_KEY || "",
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
  ignoredDirs: (process.env.IGNORED_DIRS || "node_modules,.git,.cache,__pycache__,dist,build,.agent,.venv").split(",").map(x => x.trim()).filter(Boolean)
};
