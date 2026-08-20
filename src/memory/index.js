const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const config = require("../config");
const sandbox = require("../sandbox");

const VERSION = 3;

function emptyProject() {
  return {
    version: VERSION,
    project: { summary: "", stack: [], commands: {}, conventions: [] },
    facts: [],
    decisions: [],
    tasks: [],
    notes: [],
    failures: [],
    discoveries: [],
    updatedAt: new Date().toISOString()
  };
}

function emptyGlobal() {
  return { version: VERSION, facts: [], decisions: [], notes: [], updatedAt: new Date().toISOString() };
}

function projectFile() {
  return path.join(config.workspace, ".agents", "memory", "project.json");
}

function legacyFile() {
  return path.join(config.workspace, ".agent", "memory.json");
}

function globalFile() {
  return path.join(os.homedir(), ".agents", "memory", "global.json");
}

function text(value, max = 2000) {
  return sandbox.redact(value, max);
}

function words(value) {
  return new Set(text(value).toLowerCase().match(/[a-z0-9_.\-/]{2,}/g) || []);
}

function cleanItem(item) {
  if (typeof item === "string") return text(item);
  if (!item || typeof item !== "object") return "";
  const clean = { ...item };
  for (const key of ["text", "task", "summary", "verification", "source", "why", "alternatives", "approach", "reason"]) {
    if (clean[key] !== undefined) clean[key] = text(clean[key], 4000);
  }
  if (Array.isArray(clean.affectedFiles)) clean.affectedFiles = clean.affectedFiles.map((file) => text(file, 300));
  return clean;
}

function normalize(raw = {}) {
  const m = emptyProject();
  if (typeof raw.project === "string") m.project.summary = text(raw.project);
  else if (raw.project && typeof raw.project === "object") {
    m.project = { ...m.project, ...raw.project, summary: text(raw.project.summary) };
  }
  for (const key of ["facts", "decisions", "tasks", "notes", "failures", "discoveries"]) {
    m[key] = Array.isArray(raw[key]) ? raw[key].map(cleanItem).filter(Boolean) : [];
  }
  m.version = VERSION;
  m.updatedAt = raw.updatedAt || m.updatedAt;
  return m;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, file);
}

function compact(m) {
  const max = config.memoryMaxItems;
  for (const key of ["tasks", "notes", "failures", "discoveries"]) m[key] = m[key].slice(-max);
  m.decisions = dedupe(m.decisions).slice(-max);
  m.facts = dedupe(m.facts).slice(-max);
  return m;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = text(typeof item === "string" ? item : item.text).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ranked(items, query, limit) {
  const q = words(query);
  return items
    .map((item, index) => {
      const body = text(
        typeof item === "string"
          ? item
          : `${item.text || ""} ${item.task || ""} ${item.summary || ""} ${item.why || ""} ${item.approach || ""}`
      );
      const w = words(body);
      let score = 0;
      for (const token of q) if (w.has(token)) score += token.length > 5 ? 3 : 1;
      return { item, score, index };
    })
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, limit)
    .map((x) => x.item);
}

async function load() {
  const current = await readJson(projectFile(), null);
  if (current) return normalize(current);
  const legacy = await readJson(legacyFile(), null);
  if (legacy) {
    const migrated = normalize(legacy);
    await save(migrated);
    return migrated;
  }
  return emptyProject();
}

async function save(value) {
  const m = compact(normalize(value));
  m.updatedAt = new Date().toISOString();
  await writeJson(projectFile(), m);
  return m;
}

async function loadGlobal() {
  return { ...emptyGlobal(), ...(await readJson(globalFile(), {})) };
}

async function saveGlobal(value) {
  const current = { ...emptyGlobal(), ...value, updatedAt: new Date().toISOString() };
  await writeJson(globalFile(), current);
  return current;
}

async function context(query, limit = config.memoryRecallItems) {
  const m = await load();
  const g = await loadGlobal();
  return {
    project: m.project,
    facts: ranked([...g.facts, ...m.facts], query, limit),
    decisions: ranked([...g.decisions, ...m.decisions], query, Math.ceil(limit / 2)),
    recentTasks: m.tasks.slice(-Math.ceil(limit / 2)),
    notes: ranked([...g.notes, ...m.notes], query, Math.ceil(limit / 2)),
    failures: ranked(m.failures, query, Math.ceil(limit / 3)),
    discoveries: ranked(m.discoveries, query, Math.ceil(limit / 3))
  };
}

function kindKey(kind) {
  const map = {
    fact: "facts",
    facts: "facts",
    decision: "decisions",
    decisions: "decisions",
    note: "notes",
    notes: "notes",
    failure: "failures",
    failures: "failures",
    discovery: "discoveries",
    discoveries: "discoveries"
  };
  const key = map[String(kind || "").toLowerCase()];
  if (!key) throw new Error("Memory kind must be facts, decisions, notes, failures, or discoveries");
  return key;
}

async function remember(kind, value, source = "agent", extra = {}) {
  const key = kindKey(kind);
  const body = text(typeof value === "string" ? value : value?.text);
  if (!body) throw new Error("Cannot remember empty text");
  const entry = {
    text: body,
    source: text(source, 100),
    time: new Date().toISOString()
  };
  if (key === "decisions") {
    entry.why = text(extra.why || value?.why || "", 2000);
    entry.alternatives = text(extra.alternatives || value?.alternatives || "", 2000);
    entry.affectedFiles = extra.affectedFiles || value?.affectedFiles || [];
  }
  if (key === "failures") {
    entry.approach = text(extra.approach || value?.approach || body, 2000);
    entry.reason = text(extra.reason || extra.why || value?.reason || "", 2000);
  }
  const m = await load();
  m[key].push(entry);
  await save(m);
  return `remembered ${key.slice(0, -1)}`;
}

async function addTask(task, summary, meta = {}) {
  const m = await load();
  m.tasks.push({
    time: new Date().toISOString(),
    task: text(task, 4000),
    summary: text(summary, 4000),
    ...meta
  });
  await save(m);
}

async function setProject(update) {
  const m = await load();
  m.project = { ...m.project, ...update };
  await save(m);
}

async function clear(scope = "all") {
  if (scope === "all") return save(emptyProject());
  const m = await load();
  if (!Object.prototype.hasOwnProperty.call(m, scope) || !Array.isArray(m[scope])) throw new Error("Unknown memory scope");
  m[scope] = [];
  return save(m);
}

async function stats() {
  const m = await load();
  return {
    file: projectFile(),
    version: m.version,
    facts: m.facts.length,
    decisions: m.decisions.length,
    tasks: m.tasks.length,
    notes: m.notes.length,
    failures: m.failures.length,
    discoveries: m.discoveries.length,
    updatedAt: m.updatedAt
  };
}

module.exports = {
  load,
  save,
  loadGlobal,
  saveGlobal,
  context,
  remember,
  addTask,
  setProject,
  clear,
  stats,
  normalize,
  ranked,
  VERSION
};
