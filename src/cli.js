const readline = require("readline");
const config = require("./config");
const agent = require("./agent");
const memory = require("./memory");
const git = require("./git");
const tools = require("./tools");
const ui = require("./ui");
const modes = require("./modes");
const taskStore = require("./agent/task");

const USAGE = `Termux Agent v6

Usage:
  node src/cli.js [--workspace PATH] [--mode MODE]
  npm start -- --workspace ~/projects/test-website --mode pro

Options:
  -w, --workspace PATH   Project directory the agent may edit (not the agent repo)
  -m, --mode MODE        Fast | Thinking | Pro | Auto | Plan | Debug | Research | Ask
  -h, --help             Show this help

Keep the agent in ~/Agents and point WORKSPACE at each project:
  node src/cli.js --workspace ~/projects/test-website`;

const HELP = `/help                 Show commands
/status               Runtime, model, workspace, and memory status
/mode [NAME|N]        Gemini-style mode picker, or switch Fast/Thinking/Pro/...
/workspace [PATH]     Show or set the project directory
/model [NAME]         Show or set the session model
/config               Show non-secret configuration
/inspect              Print workspace tree
/plan TASK            Research and produce a read-only implementation plan
/task TASK            Execute a task in the current mode (plain text does the same)
/tasks                List persisted tasks
/auto TASK            Autonomous implementation and repair loop
/debug ISSUE          Reproduce, diagnose, fix, and regression-test an issue
/fast TASK            Short-loop Fast mode
/thinking TASK        Extended-reasoning Thinking mode
/pro TASK             Full Pro coding loop
/research QUERY       Deep inspect, no writes
/ask QUESTION         Chat about the repo, no writes
/diff                 Show the current Git diff
/history              Show recent completed tasks
/memory [QUERY]       Show memory stats or relevant recall
/remember KIND TEXT   Save a durable fact, decision, or note
/forget SCOPE         Clear facts, decisions, notes, tasks, or all
/checkpoint [LABEL]   Capture workspace state without changing worktree
/rollback             Restore the latest checkpoint (confirmation required)
/resume [TASK_ID]     Resume a paused or interrupted task
/pause [TASK_ID]      Mark a task as paused
/cancel [TASK_ID]     Cancel a task
/clear                Clear the terminal
/quit                 Exit`;

const MODE_SLASH = ["fast", "thinking", "pro", "auto", "plan", "debug", "research", "ask", "normal"];

function applyCliArgs(argv = process.argv.slice(2)) {
  const args = config.parseArgs(argv);
  if (args.help) return args;
  if (args.workspace) config.applyWorkspace(args.workspace, { mustExist: true });
  if (args.mode) config.override({ mode: modes.resolve(args.mode).id });
  return args;
}

function setSessionMode(name, rl) {
  const policy = /^\d+$/.test(String(name).trim()) ? modes.parse(name) : modes.resolve(name);
  if (!policy) throw new Error(`Unknown mode '${name}'. Use /mode to list options.`);
  config.override({ mode: policy.id });
  if (rl) rl.setPrompt(ui.prompt(policy.id));
  return policy;
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = applyCliArgs(argv);
  } catch (error) {
    console.error("\x1b[31mERROR:\x1b[0m", error.message);
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    console.log(`${USAGE}\n\nCommands:\n${HELP}`);
    return;
  }

  let sessionMode = modes.resolve(config.mode).id;
  console.log(ui.banner(sessionMode));
  console.log(ui.composer(sessionMode));
  console.log(
    `Workspace: ${config.workspace}\nProvider: ${config.provider}\nModel: ${config.model}\nMode: ${modes.resolve(sessionMode).label}\nEndpoint: ${config.apiUrl}\nType /help for commands, /mode to switch Fast · Thinking · Pro.\n`
  );
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: ui.prompt(sessionMode) });
  const confirm = (question) => new Promise((resolve) => rl.question(question, (answer) => resolve(["y", "yes"].includes(answer.trim().toLowerCase()))));
  let lastTaskId = null;

  async function task(text, options = {}) {
    const mode = options.mode || sessionMode;
    try {
      const result = await agent.run(text, confirm, { ...options, mode });
      lastTaskId = result.task?.id || lastTaskId;
      await memory.addTask(text, result.summary, {
        status: result.task?.status || "completed",
        verification: result.verification,
        steps: result.steps,
        changed: result.changed,
        taskId: result.task?.id,
        mode: result.task?.mode || mode
      });
    } catch (error) {
      await memory.addTask(text, error.message, { status: "failed", changed: false, mode });
      throw error;
    }
  }

  rl.prompt();
  rl.on("line", async (input) => {
    const line = input.trim();
    if (!line) {
      rl.prompt();
      return;
    }
    try {
      if (["/quit", "/exit"].includes(line)) return rl.close();
      if (line === "/help") console.log(`${HELP}\n\n${USAGE}`);
      else if (line === "/status") {
        console.log({
          workspace: config.workspace,
          provider: config.provider,
          model: config.model,
          mode: sessionMode,
          maxSteps: config.maxSteps,
          tokenBudget: config.tokenBudget,
          network: config.allowNetwork,
          checkpoints: config.checkpoints,
          backups: config.backups,
          lastTaskId,
          memory: await memory.stats()
        });
      } else if (line === "/config") console.log(config.snapshot());
      else if (line === "/mode" || line === "/modes") console.log(ui.modePicker(sessionMode));
      else if (line.startsWith("/mode ")) {
        const policy = setSessionMode(line.slice(6).trim(), rl);
        sessionMode = policy.id;
        console.log(ui.modeChanged(policy));
      } else if (line === "/workspace") console.log({ workspace: config.workspace });
      else if (line.startsWith("/workspace ")) {
        config.applyWorkspace(line.slice(11).trim(), { mustExist: true });
        console.log({ workspace: config.workspace });
      } else if (line === "/model") console.log({ provider: config.provider, model: config.model });
      else if (line.startsWith("/model ")) {
        config.override({ model: line.slice(7).trim() });
        console.log({ provider: config.provider, model: config.model });
      } else if (line === "/inspect") console.log((await tools.tree()).join("\n"));
      else if (line === "/diff") console.log((await tools.git("diff")).stdout || "No unstaged diff.");
      else if (line === "/history") console.log(JSON.stringify((await memory.load()).tasks.slice(-20), null, 2));
      else if (line === "/tasks") console.log(JSON.stringify(await taskStore.list(), null, 2));
      else if (line === "/memory") console.log(await memory.stats());
      else if (line.startsWith("/memory ")) console.log(JSON.stringify(await memory.context(line.slice(8)), null, 2));
      else if (line.startsWith("/remember ")) {
        const match = line.match(/^\/remember\s+(fact|facts|decision|decisions|note|notes|failure|discovery)\s+(.+)$/i);
        if (!match) throw new Error("Usage: /remember KIND TEXT (KIND: fact, decision, note, failure, discovery)");
        const kinds = {
          fact: "facts",
          facts: "facts",
          decision: "decisions",
          decisions: "decisions",
          note: "notes",
          notes: "notes",
          failure: "failures",
          discovery: "discoveries"
        };
        console.log(await memory.remember(kinds[match[1].toLowerCase()], match[2], "user"));
      } else if (line.startsWith("/forget ")) {
        const scope = line.slice(8).trim();
        if (!(await confirm(`Clear memory scope '${scope}'? [y/N] `))) console.log("Cancelled.");
        else {
          await memory.clear(scope);
          console.log(`Cleared ${scope}.`);
        }
      } else if (line.startsWith("/checkpoint")) console.log(await git.checkpoint(line.slice(11).trim() || "manual"));
      else if (["/rollback", "/undo"].includes(line)) {
        if (!(await confirm("Restore the latest checkpoint over the current workspace? [y/N] "))) console.log("Cancelled.");
        else console.log(await git.rollback());
      } else if (line.startsWith("/resume")) {
        const id = line.slice(7).trim() || lastTaskId;
        if (!id) throw new Error("No task id. Use /tasks");
        const result = await agent.resume(id, confirm);
        lastTaskId = result.task?.id || id;
        console.log(result.summary);
      } else if (line.startsWith("/pause")) {
        const id = line.slice(6).trim() || lastTaskId;
        if (!id) throw new Error("No task id. Use /tasks");
        console.log(await agent.pause(id));
      } else if (line.startsWith("/cancel")) {
        const id = line.slice(7).trim() || lastTaskId;
        if (!id) throw new Error("No task id. Use /tasks");
        console.log(await agent.cancel(id));
      } else if (line === "/clear") {
        console.clear();
        console.log(ui.banner(sessionMode));
        console.log(ui.composer(sessionMode));
      } else if (MODE_SLASH.some((name) => line === `/${name}`)) {
        const policy = setSessionMode(line.slice(1), rl);
        sessionMode = policy.id;
        console.log(ui.modeChanged(policy));
      } else if (MODE_SLASH.some((name) => line.startsWith(`/${name} `))) {
        const name = MODE_SLASH.find((item) => line.startsWith(`/${item} `));
        const text = line.slice(name.length + 2);
        const extra = name === "plan" ? { planOnly: true } : {};
        await task(text, { mode: name, ...extra });
      } else if (line.startsWith("/task ")) await task(line.slice(6));
      else await task(line);
    } catch (e) {
      console.error("\x1b[31mERROR:\x1b[0m", e.message);
    }
    rl.prompt();
  });
  rl.on("close", () => process.exit(0));
}

if (require.main === module) main();

module.exports = { main, HELP, USAGE, applyCliArgs, setSessionMode };
