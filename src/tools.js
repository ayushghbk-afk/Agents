const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const config = require("./config");

const CATASTROPHIC = [
  /\brm\s+[^\n;&|]*-[^\n;&|]*r[^\n;&|]*\s+(\/|~)(?:\s|$)/i,
  /\b(mkfs|fdisk|parted|shutdown|reboot|poweroff)\b/i,
  /\bdd\s+[^\n]*of=\/dev\//i,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/
];
const RISKY = /\b(rm|mv|chmod|chown|kill|pkill|git\s+(reset|clean|checkout|restore|commit|push|rebase)|npm\s+publish|pip\s+uninstall)\b/i;
const NETWORK = /\b(curl|wget|ssh|scp|sftp|nc|netcat)\b|\bgit\s+(clone|fetch|pull|push)\b|\b(npm|pnpm|yarn)\s+(install|add|update)\b|\bpip\w*\s+install\b/i;

function safe(relative = ".") {
  if (typeof relative !== "string" || relative.includes("\0")) throw new Error("Invalid path");
  const target = path.resolve(config.workspace, relative);
  const base = `${config.workspace}${path.sep}`;
  if (target !== config.workspace && !target.startsWith(base)) throw new Error("Path escapes workspace");
  return target;
}
async function secure(relative = ".") {
  const target = safe(relative);
  const root = await fs.realpath(config.workspace);
  let existing = target;
  while (true) {
    try { existing = await fs.realpath(existing); break; }
    catch (e) {
      if (e.code !== "ENOENT") throw e;
      const parent = path.dirname(existing);
      if (parent === existing) throw e;
      existing = parent;
    }
  }
  if (existing !== root && !existing.startsWith(`${root}${path.sep}`)) throw new Error("Path resolves outside workspace through a symbolic link");
  return target;
}
function clip(value, max = config.maxToolOutput) {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  const half = Math.floor((max - 100) / 2);
  return `${s.slice(0, half)}\n... [${s.length - half * 2} characters omitted] ...\n${s.slice(-half)}`;
}
async function tree(options = {}) {
  const output = [], maxDepth = Math.min(10, Math.max(1, Number(options.depth) || 4));
  const maxEntries = Math.min(2000, Math.max(10, Number(options.maxEntries) || 500));
  async function walk(dir, depth) {
    if (depth > maxDepth || output.length >= maxEntries) return;
    let entries = await fs.readdir(dir, { withFileTypes: true });
    entries = entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (config.ignoredDirs.includes(entry.name)) continue;
      const full = path.join(dir, entry.name), rel = path.relative(config.workspace, full);
      output.push(entry.isDirectory() ? `${rel}/` : rel);
      if (entry.isDirectory()) await walk(full, depth + 1);
      if (output.length >= maxEntries) break;
    }
  }
  await walk(config.workspace, 0);
  return output;
}
async function read(relative, startLine = 1, endLine) {
  const file = await secure(relative), stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error("Path is not a file");
  if (stat.size > config.maxFileBytes) throw new Error(`File exceeds ${config.maxFileBytes} bytes`);
  const content = await fs.readFile(file, "utf8");
  if (startLine === 1 && endLine === undefined) return content;
  const lines = content.split("\n"), start = Math.max(1, Number(startLine) || 1), end = Math.min(lines.length, Number(endLine) || start + 249);
  return lines.slice(start - 1, end).map((line, i) => `${start + i}: ${line}`).join("\n");
}
async function write(relative, content) {
  const file = await secure(relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, String(content), "utf8");
  return `wrote ${path.relative(config.workspace, file)} (${Buffer.byteLength(String(content))} bytes)`;
}
async function patch(relative, oldText, newText) {
  if (!oldText) throw new Error("oldText cannot be empty");
  const file = await secure(relative), content = await fs.readFile(file, "utf8");
  const count = content.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Patch expected exactly one match; found ${count}`);
  await fs.writeFile(file, content.replace(oldText, String(newText ?? "")), "utf8");
  return `patched ${path.relative(config.workspace, file)}`;
}
async function search(pattern, options = {}) {
  let regex;
  try { regex = new RegExp(pattern, options.caseSensitive ? "" : "i"); }
  catch (e) { throw new Error(`Invalid search pattern: ${e.message}`); }
  const hits = [], limit = Math.min(500, Number(options.limit) || 150);
  for (const relative of await tree({ depth: options.depth || 8, maxEntries: 2000 })) {
    if (relative.endsWith("/")) continue;
    if (options.path && !relative.includes(options.path)) continue;
    try {
      const file = await secure(relative);
      const stat = await fs.stat(file);
      if (stat.size > config.maxFileBytes) continue;
      const lines = (await fs.readFile(file, "utf8")).split("\n");
      for (let i = 0; i < lines.length; i++) if (regex.test(lines[i])) {
        hits.push(`${relative}:${i + 1}: ${lines[i].slice(0, 500)}`);
        if (hits.length >= limit) return hits;
      }
    } catch {}
  }
  return hits;
}
function commandRisk(command) {
  if (CATASTROPHIC.some(regex => regex.test(command))) return "blocked";
  if (NETWORK.test(command)) return config.allowNetwork ? "risky" : "network-blocked";
  return RISKY.test(command) ? "risky" : "safe";
}
function exec(command) {
  return new Promise((resolve, reject) => {
    if (typeof command !== "string" || !command.trim()) return reject(new Error("Command is required"));
    const risk = commandRisk(command);
    if (risk === "blocked") return reject(new Error("Blocked destructive command"));
    if (risk === "network-blocked") return reject(new Error("Network/package command blocked; set ALLOW_NETWORK=true"));
    const child = spawn("sh", ["-lc", command], { cwd: config.workspace, env: process.env, detached: true });
    let stdout = "", stderr = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); } }, config.commandTimeoutMs);
    child.stdout.on("data", data => { stdout = clip(stdout + data); });
    child.stderr.on("data", data => { stderr = clip(stderr + data); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); resolve({ code, timeout: timedOut, stdout: clip(stdout), stderr: clip(stderr) }); });
  });
}
async function git(command) {
  const allowed = ["status --short", "branch --show-current", "diff --stat", "diff", "diff --cached", "log -5 --oneline"];
  if (!allowed.includes(command)) throw new Error("Only allowlisted read-only git commands are available through git tool");
  return exec(`git ${command}`);
}
async function stat(relative) {
  const value = await fs.stat(await secure(relative));
  return { path: relative, type: value.isDirectory() ? "directory" : "file", bytes: value.size, modified: value.mtime.toISOString() };
}
module.exports = { tree, read, write, patch, search, exec, git, stat, safe, secure, clip, commandRisk };
