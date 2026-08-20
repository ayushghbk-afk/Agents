const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

const STATUSES = [
  "queued",
  "planning",
  "executing",
  "testing",
  "repairing",
  "completed",
  "failed",
  "paused",
  "cancelled"
];

function tasksDir() {
  return path.join(config.workspace, ".agents", "tasks");
}

function create({ objective, mode = "normal", planOnly = false } = {}) {
  return {
    id: `task-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    status: "queued",
    objective: String(objective || ""),
    mode,
    planOnly,
    plan: { steps: [], approved: !config.planApproval },
    currentSubtask: null,
    step: 0,
    steps: [],
    toolHistory: [],
    errorHistory: [],
    changedFiles: [],
    verification: { status: "pending", results: [], attempts: 0 },
    usage: { prompt: 0, completion: 0 },
    stopReason: null,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function save(task) {
  task.updatedAt = new Date().toISOString();
  await fs.mkdir(tasksDir(), { recursive: true });
  const file = path.join(tasksDir(), `${task.id}.json`);
  const serializable = { ...task, messages: task.messages };
  await fs.writeFile(file, `${JSON.stringify(serializable, null, 2)}\n`, { mode: 0o600 });
  return task;
}

async function load(id) {
  const file = path.join(tasksDir(), `${id}.json`);
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function list(limit = 30) {
  try {
    const files = (await fs.readdir(tasksDir())).filter((name) => name.endsWith(".json")).sort();
    const selected = files.slice(-limit);
    const items = [];
    for (const name of selected) {
      try {
        const task = JSON.parse(await fs.readFile(path.join(tasksDir(), name), "utf8"));
        items.push({
          id: task.id,
          status: task.status,
          objective: task.objective,
          updatedAt: task.updatedAt,
          step: task.step
        });
      } catch {}
    }
    return items;
  } catch {
    return [];
  }
}

function setStatus(task, status) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown task status: ${status}`);
  task.status = status;
  task.updatedAt = new Date().toISOString();
  return task;
}

function resumable(task) {
  return task && ["paused", "failed", "executing", "planning", "testing", "repairing"].includes(task.status);
}

module.exports = { create, save, load, list, setStatus, resumable, STATUSES };
