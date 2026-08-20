const fs = require("fs/promises");
const path = require("path");
const config = require("../config");
const sandbox = require("../sandbox");

function clip(value, max = config.maxToolOutput) {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  const half = Math.floor((max - 100) / 2);
  return `${s.slice(0, half)}\n... [${s.length - half * 2} characters omitted] ...\n${s.slice(-half)}`;
}

async function tree(options = {}) {
  const output = [];
  const maxDepth = Math.min(10, Math.max(1, Number(options.depth) || 4));
  const maxEntries = Math.min(2000, Math.max(10, Number(options.maxEntries) || 500));
  const root = options.path ? await sandbox.resolve(options.path) : config.workspace;
  async function walk(dir, depth) {
    if (depth > maxDepth || output.length >= maxEntries) return;
    let entries = await fs.readdir(dir, { withFileTypes: true });
    entries = entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (config.ignoredDirs.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(config.workspace, full);
      output.push(entry.isDirectory() ? `${rel}/` : rel);
      if (entry.isDirectory()) await walk(full, depth + 1);
      if (output.length >= maxEntries) break;
    }
  }
  await walk(root, 0);
  return output;
}

async function listDirectory(relative = ".", options = {}) {
  const dir = await sandbox.resolve(relative);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const rows = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!options.includeIgnored && config.ignoredDirs.includes(entry.name)) continue;
    const rel = path.relative(config.workspace, path.join(dir, entry.name));
    rows.push(entry.isDirectory() ? `${rel}/` : rel);
  }
  return rows;
}

const fileCache = new Map();

async function read(relative, startLine = 1, endLine) {
  if (sandbox.isProtected(relative)) throw new Error("Protected file cannot be read");
  const file = await sandbox.resolve(relative);
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error("Path is not a file");
  if (stat.size > config.maxFileBytes) throw new Error(`File exceeds ${config.maxFileBytes} bytes`);
  const cached = fileCache.get(file);
  let content;
  if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) content = cached.content;
  else {
    content = await fs.readFile(file, "utf8");
    fileCache.set(file, { mtime: stat.mtimeMs, size: stat.size, content });
  }
  if (startLine === 1 && endLine === undefined) return content;
  const lines = content.split("\n");
  const start = Math.max(1, Number(startLine) || 1);
  const end = Math.min(lines.length, Number(endLine) || start + 249);
  return lines.slice(start - 1, end).map((line, i) => `${start + i}: ${line}`).join("\n");
}

function invalidate(file) {
  fileCache.delete(file);
}

async function backup(file) {
  if (!config.backups) return null;
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > config.maxFileBytes) return null;
    const relative = path.relative(config.workspace, file);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(config.workspace, ".agents", "backups", stamp, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(file, target);
    const root = path.join(config.workspace, ".agents", "backups");
    const snapshots = (await fs.readdir(root, { withFileTypes: true }))
      .filter((x) => x.isDirectory())
      .map((x) => x.name)
      .sort();
    await Promise.all(
      snapshots.slice(0, Math.max(0, snapshots.length - config.maxBackups)).map((name) =>
        fs.rm(path.join(root, name), { recursive: true, force: true })
      )
    );
    return path.relative(config.workspace, target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function write(relative, content) {
  if (sandbox.isProtected(relative)) throw new Error("Protected file cannot be written");
  const secrets = sandbox.detectSecrets(content);
  if (secrets.includes("private-key")) throw new Error("Refusing to write private key material");
  const file = await sandbox.resolve(relative);
  const saved = await backup(file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, String(content), "utf8");
  invalidate(file);
  return `wrote ${path.relative(config.workspace, file)} (${Buffer.byteLength(String(content))} bytes)${saved ? `; backup: ${saved}` : ""}`;
}

async function patch(relative, oldText, newText) {
  if (!oldText) throw new Error("oldText cannot be empty");
  if (sandbox.isProtected(relative)) throw new Error("Protected file cannot be patched");
  const file = await sandbox.resolve(relative);
  const content = await fs.readFile(file, "utf8");
  const count = content.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Patch expected exactly one match; found ${count}`);
  const saved = await backup(file);
  await fs.writeFile(file, content.replace(oldText, String(newText ?? "")), "utf8");
  invalidate(file);
  return `patched ${path.relative(config.workspace, file)}${saved ? `; backup: ${saved}` : ""}`;
}

async function mkdir(relative) {
  const directory = await sandbox.resolve(relative);
  await fs.mkdir(directory, { recursive: true });
  return `created directory ${path.relative(config.workspace, directory) || "."}`;
}

async function stat(relative) {
  const value = await fs.stat(await sandbox.resolve(relative));
  return {
    path: relative,
    type: value.isDirectory() ? "directory" : "file",
    bytes: value.size,
    modified: value.mtime.toISOString()
  };
}

function globToRegExp(pattern) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GS}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/{{GS}}/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

async function find(pattern, options = {}) {
  const regex = globToRegExp(pattern || "*");
  const hits = [];
  const limit = Math.min(500, Number(options.limit) || 200);
  for (const relative of await tree({ depth: options.depth || 8, maxEntries: 2000, path: options.path })) {
    if (relative.endsWith("/")) continue;
    const name = path.basename(relative);
    if (regex.test(relative.replace(/\\/g, "/")) || regex.test(name)) {
      hits.push(relative);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

module.exports = {
  tree,
  listDirectory,
  read,
  write,
  patch,
  mkdir,
  stat,
  find,
  backup,
  clip,
  invalidate,
  fileCache
};
