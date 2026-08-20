const fs = require("fs/promises");
const path = require("path");
const config = require("../config");

const CATASTROPHIC = [
  /\brm\s+[^\n;&|]*-[^\n;&|]*r[^\n;&|]*\s+(\/|~)(?:\s|$)/i,
  /\b(mkfs|fdisk|parted|shutdown|reboot|poweroff)\b/i,
  /\bdd\s+[^\n]*of=\/dev\//i,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/
];
const RISKY =
  /\b(rm|mv|chmod|chown|kill|pkill|git\s+(reset|clean|checkout|restore|commit|push|rebase)|npm\s+publish|pip\s+uninstall)\b/i;
const NETWORK =
  /\b(curl|wget|ssh|scp|sftp|nc|netcat)\b|\bgit\s+(clone|fetch|pull|push)\b|\b(npm|pnpm|yarn)\s+(install|add|update)\b|\bpip\w*\s+install\b/i;
const PROTECTED = /(^|\/)\.env($|\.)|(^|\/)\.netrc$|(^|\/)id_rsa|(^|\/).+\.pem$|(^|\/)credentials(\.|$)|secrets?\.(json|ya?ml|env)$/i;

function safe(relative = ".") {
  if (typeof relative !== "string" || relative.includes("\0")) throw new Error("Invalid path");
  const target = path.resolve(config.workspace, relative);
  const base = `${config.workspace}${path.sep}`;
  if (target !== config.workspace && !target.startsWith(base)) throw new Error("Path escapes workspace");
  return target;
}

async function resolve(relative = ".") {
  const target = safe(relative);
  const root = await fs.realpath(config.workspace);
  let existing = target;
  while (true) {
    try {
      existing = await fs.realpath(existing);
      break;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      const parent = path.dirname(existing);
      if (parent === existing) throw e;
      existing = parent;
    }
  }
  if (existing !== root && !existing.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path resolves outside workspace through a symbolic link");
  }
  return target;
}

function isProtected(relative = "") {
  const rel = String(relative).replace(/\\/g, "/");
  if (/\.env\.example$/i.test(rel)) return false;
  return PROTECTED.test(rel);
}

function detectSecrets(value) {
  const text = String(value ?? "");
  const findings = [];
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) findings.push("private-key");
  if (/\b(sk-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/.test(text)) findings.push("token");
  if (/\b(api[_-]?key|token|password|secret)\s*[:=]\s*([^\s,;]+)/i.test(text) && !/REDACTED/i.test(text)) {
    findings.push("credential-assignment");
  }
  return findings;
}

function redact(value, max = 4000) {
  return String(value ?? "")
    .replace(/\0/g, "")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{12,}/gi, "$1[REDACTED]")
    .replace(/\b(api[_-]?key|token|password|secret)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b(sk-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/g, "[REDACTED TOKEN]")
    .trim()
    .slice(0, max);
}

function commandRisk(command) {
  if (CATASTROPHIC.some((regex) => regex.test(command))) return "blocked";
  if (NETWORK.test(command)) return config.allowNetwork ? "risky" : "network-blocked";
  return RISKY.test(command) ? "risky" : "safe";
}

function riskLevel(risk) {
  if (risk === "blocked" || risk === "network-blocked") return "blocked";
  if (risk === "risky") return "approval";
  return "safe";
}

function envForChild() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/(API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)/i.test(key)) delete env[key];
  }
  return env;
}

module.exports = {
  safe,
  resolve,
  secure: resolve,
  isProtected,
  detectSecrets,
  redact,
  commandRisk,
  riskLevel,
  envForChild,
  CATASTROPHIC,
  RISKY,
  NETWORK
};
