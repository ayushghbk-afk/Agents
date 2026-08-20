const fs = require("fs/promises");
const path = require("path");
const config = require("../config");
const sandbox = require("../sandbox");
const filesystem = require("../tools/filesystem");
const { exec } = require("../tools/shell");

function checkpointRoot() {
  return path.join(config.workspace, ".agents", "checkpoints");
}

function recordsFile() {
  return path.join(checkpointRoot(), "index.json");
}

async function repo() {
  try {
    return (await exec("git rev-parse --is-inside-work-tree")).code === 0;
  } catch {
    return false;
  }
}

async function records() {
  try {
    return JSON.parse(await fs.readFile(recordsFile(), "utf8"));
  } catch {
    return [];
  }
}

async function saveRecords(list) {
  await fs.mkdir(checkpointRoot(), { recursive: true });
  await fs.writeFile(recordsFile(), `${JSON.stringify(list.slice(-30), null, 2)}\n`, { mode: 0o600 });
}

async function copyFile(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

async function inventory() {
  const files = [];
  for (const relative of await filesystem.tree({ depth: 10, maxEntries: 4000 })) {
    if (relative.endsWith("/")) continue;
    if (relative.startsWith(".agents/checkpoints/")) continue;
    try {
      const stat = await fs.stat(await sandbox.resolve(relative));
      if (stat.isFile()) files.push(relative);
    } catch {}
  }
  return files;
}

async function untracked() {
  if (!(await repo())) return [];
  const result = await exec("git ls-files --others --exclude-standard");
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith(".agents/checkpoints/"));
}

async function checkpoint(label = "agent checkpoint") {
  const id = `cp-${Date.now()}`;
  const dir = path.join(checkpointRoot(), id);
  await fs.mkdir(path.join(dir, "untracked"), { recursive: true });
  const files = await inventory();
  const extras = [];
  if (await repo()) {
    extras.push(...(await untracked()));
  }
  const uniqueUntracked = [...new Set(extras)].filter((file) => !config.ignoredDirs.some((dirName) => file.split(path.sep).includes(dirName)));
  for (const relative of uniqueUntracked) {
    try {
      await copyFile(await sandbox.resolve(relative), path.join(dir, "untracked", relative));
    } catch {}
  }
  let head = null;
  let snapshot = null;
  if (await repo()) {
    head = (await exec("git rev-parse HEAD")).stdout.trim();
    snapshot = (await exec("git stash create")).stdout.trim() || null;
  }
  const entry = {
    id,
    time: new Date().toISOString(),
    label: String(label).replace(/[\r\n]/g, " ").slice(0, 100),
    head,
    snapshot,
    inventory: files,
    untracked: uniqueUntracked
  };
  await fs.writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(entry, null, 2)}\n`, { mode: 0o600 });
  const list = await records();
  list.push(entry);
  await saveRecords(list);
  return {
    ok: true,
    ...entry,
    note: snapshot ? "Tracked and untracked changes captured; worktree unchanged" : "Workspace inventory captured"
  };
}

async function restoreUntracked(entry) {
  const dir = path.join(checkpointRoot(), entry.id, "untracked");
  for (const relative of entry.untracked || []) {
    const source = path.join(dir, relative);
    try {
      await copyFile(source, await sandbox.resolve(relative));
    } catch {}
  }
}

async function removeCreatedFiles(entry) {
  const allowed = new Set(entry.inventory || []);
  const current = await inventory();
  for (const relative of current) {
    if (allowed.has(relative)) continue;
    if (relative.startsWith(".agents/")) continue;
    try {
      await fs.rm(await sandbox.resolve(relative), { force: true });
    } catch {}
  }
}

async function rollback() {
  const list = await records();
  const latest = list.at(-1);
  if (!latest) return { ok: false, reason: "no checkpoint" };
  if (await repo()) {
    const source = latest.snapshot || latest.head;
    if (source) {
      const restore = await exec(`git restore --source=${source} --worktree --staged .`);
      if (restore.code !== 0 && latest.snapshot && latest.snapshot !== latest.head) {
        const applied = await exec(`git stash apply --index ${latest.snapshot}`);
        if (applied.code !== 0) return { ok: false, checkpoint: latest, output: applied };
      }
    }
  } else {
    const filesDir = path.join(checkpointRoot(), latest.id, "files");
    for (const relative of latest.inventory || []) {
      const source = path.join(filesDir, relative);
      try {
        await copyFile(source, await sandbox.resolve(relative));
      } catch {}
    }
  }
  await restoreUntracked(latest);
  await removeCreatedFiles(latest);
  return { ok: true, checkpoint: latest, note: "Workspace restored including untracked files" };
}

module.exports = { checkpoint, rollback, records, inventory, untracked, repo };
