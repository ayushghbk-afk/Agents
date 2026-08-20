const fs = require("fs/promises");
const path = require("path");
const config = require("./config");

const file = path.join(config.workspace, ".agent", "memory.json");
const VERSION = 2;
const EMPTY = () => ({
  version: VERSION,
  project: { summary: "", stack: [], commands: {}, conventions: [] },
  facts: [],
  decisions: [],
  tasks: [],
  notes: [],
  updatedAt: new Date().toISOString()
});

function text(value, max = 2000) {
  return String(value ?? "")
    .replace(/\0/g, "")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]{12,}/gi, "$1[REDACTED]")
    .replace(/\b(api[_-]?key|token|password|secret)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b(sk-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/g, "[REDACTED TOKEN]")
    .trim().slice(0, max);
}
function words(value) {
  return new Set(text(value).toLowerCase().match(/[a-z0-9_.\/-]{2,}/g) || []);
}
function cleanItem(item) {
  if (typeof item === "string") return text(item);
  if (!item || typeof item !== "object") return "";
  const clean = { ...item };
  for (const key of ["text", "task", "summary", "verification", "source"]) if (clean[key] !== undefined) clean[key] = text(clean[key], 4000);
  return clean;
}
function normalize(raw = {}) {
  const m = EMPTY();
  if (typeof raw.project === "string") m.project.summary = text(raw.project);
  else if (raw.project && typeof raw.project === "object") m.project = { ...m.project, ...raw.project, summary: text(raw.project.summary) };
  for (const key of ["facts", "decisions", "tasks", "notes"]) m[key] = Array.isArray(raw[key]) ? raw[key].map(cleanItem).filter(Boolean) : [];
  m.version = VERSION;
  m.updatedAt = raw.updatedAt || m.updatedAt;
  return m;
}
async function load() {
  try { return normalize(JSON.parse(await fs.readFile(file, "utf8"))); }
  catch (e) { if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e; return EMPTY(); }
}
async function save(value) {
  const m = compact(normalize(value));
  m.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(m, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, file);
  return m;
}
function compact(m) {
  const max = config.memoryMaxItems;
  m.tasks = m.tasks.slice(-max);
  m.notes = m.notes.slice(-max);
  m.decisions = dedupe(m.decisions).slice(-max);
  m.facts = dedupe(m.facts).slice(-max);
  return m;
}
function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = text(typeof item === "string" ? item : item.text).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function ranked(items, query, limit) {
  const q = words(query);
  return items.map((item, index) => {
    const body = text(typeof item === "string" ? item : `${item.text || ""} ${item.task || ""} ${item.summary || ""}`);
    const w = words(body);
    let score = 0;
    for (const token of q) if (w.has(token)) score += token.length > 5 ? 3 : 1;
    return { item, score, index };
  }).sort((a, b) => b.score - a.score || b.index - a.index).slice(0, limit).map(x => x.item);
}
async function context(query, limit = config.memoryRecallItems) {
  const m = await load();
  return {
    project: m.project,
    facts: ranked(m.facts, query, limit),
    decisions: ranked(m.decisions, query, Math.ceil(limit / 2)),
    recentTasks: m.tasks.slice(-Math.ceil(limit / 2)),
    notes: ranked(m.notes, query, Math.ceil(limit / 2))
  };
}
async function remember(kind, value, source = "agent") {
  if (!['facts', 'decisions', 'notes'].includes(kind)) throw new Error("Memory kind must be facts, decisions, or notes");
  const body = text(value);
  if (!body) throw new Error("Cannot remember empty text");
  const m = await load();
  m[kind].push({ text: body, source: text(source, 100), time: new Date().toISOString() });
  await save(m);
  return `remembered ${kind.slice(0, -1)}`;
}
async function addTask(task, summary, meta = {}) {
  const m = await load();
  m.tasks.push({ time: new Date().toISOString(), task: text(task, 4000), summary: text(summary, 4000), ...meta });
  await save(m);
}
async function setProject(update) {
  const m = await load();
  m.project = { ...m.project, ...update };
  await save(m);
}
async function clear(scope = "all") {
  if (scope === "all") return save(EMPTY());
  const m = await load();
  if (!Object.prototype.hasOwnProperty.call(m, scope) || !Array.isArray(m[scope])) throw new Error("Unknown memory scope");
  m[scope] = [];
  return save(m);
}
async function stats() {
  const m = await load();
  return { file, version: m.version, facts: m.facts.length, decisions: m.decisions.length, tasks: m.tasks.length, notes: m.notes.length, updatedAt: m.updatedAt };
}

module.exports = { load, save, context, remember, addTask, setProject, clear, stats, normalize, ranked };
