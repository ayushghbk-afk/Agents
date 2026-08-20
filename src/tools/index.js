const filesystem = require("./filesystem");
const shell = require("./shell");
const search = require("./search");
const gitTools = require("./git");
const testing = require("./testing");
const web = require("./web");
const sandbox = require("../sandbox");
const gitMod = require("../git");
const project = require("../context/project");
const memory = require("../memory");
const config = require("../config");

function schema(properties, required = []) {
  return { type: "object", properties, required };
}

function define(def) {
  return {
    risk: "safe",
    timeout: config.commandTimeoutMs,
    aliases: [],
    ...def
  };
}

const registry = [
  define({
    name: "read_file",
    aliases: ["read"],
    description: "Read a workspace file, optionally by line range.",
    inputSchema: schema(
      { path: { type: "string" }, startLine: { type: "number" }, endLine: { type: "number" } },
      ["path"]
    ),
    execute: (args) => filesystem.read(args.path, args.startLine, args.endLine)
  }),
  define({
    name: "write_file",
    aliases: ["write"],
    description: "Write a workspace file. Creates parent directories.",
    risk: "approval",
    inputSchema: schema({ path: { type: "string" }, content: { type: "string" } }, ["path", "content"]),
    execute: (args) => filesystem.write(args.path, args.content)
  }),
  define({
    name: "patch_file",
    aliases: ["patch"],
    description: "Replace exactly one occurrence of oldText with newText in a file.",
    risk: "approval",
    inputSchema: schema(
      { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } },
      ["path", "oldText", "newText"]
    ),
    execute: (args) => filesystem.patch(args.path, args.oldText, args.newText)
  }),
  define({
    name: "search_files",
    aliases: ["search"],
    description: "Regex search across workspace files.",
    inputSchema: schema(
      { pattern: { type: "string" }, path: { type: "string" }, limit: { type: "number" } },
      ["pattern"]
    ),
    execute: (args) => search.search(args.pattern, args)
  }),
  define({
    name: "find_files",
    description: "Find files by glob-like pattern.",
    inputSchema: schema({ pattern: { type: "string" }, path: { type: "string" }, limit: { type: "number" } }, ["pattern"]),
    execute: (args) => filesystem.find(args.pattern, args)
  }),
  define({
    name: "list_directory",
    aliases: ["tree"],
    description: "List a directory or a bounded workspace tree.",
    inputSchema: schema({ path: { type: "string" }, depth: { type: "number" }, maxEntries: { type: "number" } }),
    execute: (args) => (args.path && args.depth === undefined ? filesystem.listDirectory(args.path) : filesystem.tree(args))
  }),
  define({
    name: "file_info",
    aliases: ["stat"],
    description: "Return file type, size, and modified time.",
    inputSchema: schema({ path: { type: "string" } }, ["path"]),
    execute: (args) => filesystem.stat(args.path)
  }),
  define({
    name: "mkdir",
    description: "Create a directory inside the workspace.",
    inputSchema: schema({ path: { type: "string" } }, ["path"]),
    execute: (args) => filesystem.mkdir(args.path)
  }),
  define({
    name: "inspect_project",
    description: "Detect language, manifests, scripts, tests, and instruction files.",
    inputSchema: schema({}),
    execute: () => project.inspect()
  }),
  define({
    name: "run_shell",
    aliases: ["exec"],
    description: "Run a shell command in the workspace.",
    risk: "approval",
    riskOf: (args) => sandbox.riskLevel(sandbox.commandRisk(args.command)),
    inputSchema: schema({ command: { type: "string" } }, ["command"]),
    execute: (args) => shell.exec(args.command)
  }),
  define({
    name: "run_test",
    description: "Detect and run the project test command.",
    risk: "approval",
    execute: () => testing.run("test"),
    inputSchema: schema({})
  }),
  define({
    name: "run_lint",
    description: "Detect and run the project linter.",
    execute: () => testing.run("lint"),
    inputSchema: schema({})
  }),
  define({
    name: "run_build",
    description: "Detect and run the project build.",
    risk: "approval",
    execute: () => testing.run("build"),
    inputSchema: schema({})
  }),
  define({
    name: "git_status",
    description: "Show git status --short.",
    execute: () => gitTools.status(),
    inputSchema: schema({})
  }),
  define({
    name: "git_diff",
    description: "Show git diff.",
    inputSchema: schema({ cached: { type: "boolean" } }),
    execute: (args) => gitTools.diff(Boolean(args.cached))
  }),
  define({
    name: "git_log",
    description: "Show recent git history.",
    inputSchema: schema({ limit: { type: "number" } }),
    execute: (args) => gitTools.log(args.limit)
  }),
  define({
    name: "git",
    description: "Allowlisted read-only git command.",
    inputSchema: schema({ command: { type: "string" } }, ["command"]),
    execute: (args) => gitTools.git(args.command)
  }),
  define({
    name: "git_checkpoint",
    aliases: ["checkpoint"],
    description: "Create a full workspace checkpoint including untracked files.",
    risk: "approval",
    inputSchema: schema({ label: { type: "string" } }),
    execute: (args) => {
      if (!config.checkpoints) throw new Error("Checkpoints are disabled by configuration");
      return gitMod.checkpoint(args.label);
    }
  }),
  define({
    name: "git_rollback",
    description: "Restore the latest workspace checkpoint.",
    risk: "approval",
    inputSchema: schema({}),
    execute: () => gitMod.rollback()
  }),
  define({
    name: "remember",
    description: "Store a durable fact, decision, note, failure, or discovery.",
    inputSchema: schema(
      {
        kind: { type: "string" },
        text: { type: "string" },
        why: { type: "string" },
        alternatives: { type: "string" },
        affectedFiles: { type: "array" }
      },
      ["kind", "text"]
    ),
    execute: (args) => memory.remember(args.kind, args.text, "agent", args)
  }),
  define({
    name: "fetch_url",
    description: "Fetch a public http(s) URL. Requires ALLOW_NETWORK.",
    risk: "approval",
    inputSchema: schema({ url: { type: "string" } }, ["url"]),
    execute: (args) => web.fetchUrl(args.url)
  }),
  define({
    name: "progress",
    description: "Report the current phase without changing the workspace.",
    inputSchema: schema({ phase: { type: "string" }, message: { type: "string" } }, ["phase", "message"]),
    execute: (args) => ({ phase: String(args.phase).slice(0, 40), message: String(args.message).slice(0, 300) })
  }),
  define({
    name: "update_plan",
    description: "Replace the current plan when reality changes.",
    inputSchema: schema({ steps: { type: "array" }, reason: { type: "string" } }, ["steps"]),
    execute: (args, ctx) => {
      if (ctx?.task) ctx.task.plan = { steps: args.steps, reason: args.reason || "", updatedAt: new Date().toISOString() };
      return { ok: true, steps: args.steps };
    }
  }),
  define({
    name: "done",
    description: "Finish the task with an honest summary and verification evidence.",
    inputSchema: schema({
      summary: { type: "string" },
      verification: { type: "string" },
      facts: { type: "array" },
      decisions: { type: "array" }
    })
  })
];

const byName = new Map();
for (const tool of registry) {
  byName.set(tool.name, tool);
  for (const alias of tool.aliases || []) byName.set(alias, tool);
}

function get(name) {
  return byName.get(name);
}

function list() {
  return registry;
}

function openaiTools() {
  return registry.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema || { type: "object", properties: {} }
    }
  }));
}

function validate(action) {
  if (!action || typeof action !== "object") throw new Error("Action must be an object");
  action.tool = action.tool || action.action;
  action.args = action.args || {};
  const tool = get(action.tool);
  if (!tool) throw new Error(`Unknown tool: ${action.tool}`);
  const required = tool.inputSchema?.required || [];
  for (const key of required) {
    if (action.args[key] === undefined) throw new Error(`${action.tool} requires args.${key}`);
  }
  return action;
}

function mutating(name) {
  return ["write_file", "write", "patch_file", "patch", "mkdir", "git_checkpoint", "checkpoint", "remember", "run_shell", "exec", "git_rollback"].includes(name);
}

function fileChanging(name) {
  return ["write_file", "write", "patch_file", "patch"].includes(name);
}

async function call(action, ctx = {}) {
  const tool = get(action.tool);
  if (!tool) throw new Error(`Unknown tool: ${action.tool}`);
  if (tool.name === "done") return { ok: true, result: action.args, risk: "safe" };
  const riskName = tool.riskOf ? tool.riskOf(action.args, ctx) : tool.risk;
  const started = Date.now();
  if (riskName === "blocked") {
    return { ok: false, error: "Blocked by sandbox", risk: riskName, durationMs: Date.now() - started };
  }
  if (action.tool === "run_shell" || action.tool === "exec") {
    const raw = sandbox.commandRisk(action.args.command);
    if (raw === "blocked") throw new Error("Blocked destructive command");
    if (raw === "network-blocked") throw new Error("Network/package command blocked; set ALLOW_NETWORK=true");
    const needsConfirm = raw === "risky" || !config.autoApproveSafe;
    if (needsConfirm && ctx.confirm && !(await ctx.confirm(`Run (${raw}): ${action.args.command}\n[y/N] `))) {
      return { ok: false, denied: true, error: "User denied the command", risk: raw, durationMs: Date.now() - started };
    }
  } else if (riskName === "approval" && !config.autoApproveSafe && ctx.confirm) {
    if (!(await ctx.confirm(`Allow ${action.tool}? [y/N] `))) {
      return { ok: false, denied: true, error: "User denied the tool", risk: riskName, durationMs: Date.now() - started };
    }
  }
  try {
    const result = await tool.execute(action.args || {}, ctx);
    return { ok: true, result, risk: riskName, durationMs: Date.now() - started };
  } catch (error) {
    return { ok: false, error: error.message, risk: riskName, durationMs: Date.now() - started };
  }
}

module.exports = {
  registry,
  get,
  list,
  call,
  validate,
  openaiTools,
  mutating,
  fileChanging,
  tree: filesystem.tree,
  read: filesystem.read,
  write: filesystem.write,
  patch: filesystem.patch,
  mkdir: filesystem.mkdir,
  search: search.search,
  exec: shell.exec,
  git: gitTools.git,
  stat: filesystem.stat,
  safe: sandbox.safe,
  secure: sandbox.resolve,
  clip: filesystem.clip,
  commandRisk: sandbox.commandRisk,
  backup: filesystem.backup,
  find: filesystem.find,
  findSymbols: search.findSymbols
};
