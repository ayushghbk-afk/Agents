const fs = require("fs/promises");
const path = require("path");
const tools = require("./tools");
const config = require("./config");

const checkpointFile = path.join(config.workspace, ".agent", "checkpoints.json");
async function repo() {
  try { return (await tools.exec("git rev-parse --is-inside-work-tree")).code === 0; } catch { return false; }
}
async function records() {
  try { return JSON.parse(await fs.readFile(checkpointFile, "utf8")); } catch { return []; }
}
async function checkpoint(label = "agent checkpoint") {
  if (!(await repo())) return { ok: false, reason: "not a git repository" };
  const head = await tools.exec("git rev-parse HEAD");
  const snapshot = await tools.exec("git stash create"); // Creates an object without changing worktree or index.
  const entry = {
    time: new Date().toISOString(),
    label: String(label).replace(/[\r\n]/g, " ").slice(0, 100),
    head: head.stdout.trim(),
    snapshot: snapshot.stdout.trim() || null
  };
  const list = await records(); list.push(entry);
  await fs.mkdir(path.dirname(checkpointFile), { recursive: true });
  await fs.writeFile(checkpointFile, `${JSON.stringify(list.slice(-30), null, 2)}\n`, { mode: 0o600 });
  return { ok: true, ...entry, note: entry.snapshot ? "Tracked changes captured; worktree unchanged" : "Clean tracked worktree recorded" };
}
async function rollback() {
  if (!(await repo())) return { ok: false, reason: "not a git repository" };
  const list = await records(), latest = list.at(-1);
  if (!latest) return { ok: false, reason: "no checkpoint" };
  if (!latest.snapshot) return { ok: false, reason: "checkpoint had no tracked changes" };
  const result = await tools.exec(`git stash apply --index ${latest.snapshot}`);
  return { ok: result.code === 0, checkpoint: latest, output: result };
}
module.exports = { checkpoint, rollback, records };
