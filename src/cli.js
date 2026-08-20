const readline = require("readline");
const config = require("./config");
const agent = require("./agent");
const memory = require("./memory");
const git = require("./git");
const tools = require("./tools");
const ui = require("./ui");
const taskStore = require("./agent/task");

const HELP = `/help                 Show commands
/status               Runtime, model, and memory status
/model [NAME]         Show or set the session model
/config               Show non-secret configuration
/inspect              Print workspace tree
/plan TASK            Research and produce a read-only implementation plan
/task TASK            Execute a task (plain text does the same)
/tasks                List persisted tasks
/auto TASK            Autonomous implementation and repair loop
/debug ISSUE          Reproduce, diagnose, fix, and regression-test an issue
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

async function main() {
  console.log(ui.banner());
  console.log(`Workspace: ${config.workspace}\nProvider: ${config.provider}\nModel: ${config.model}\nEndpoint: ${config.apiUrl}\nType /help for commands.\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "agent> " });
  const confirm = (question) => new Promise((resolve) => rl.question(question, (answer) => resolve(["y", "yes"].includes(answer.trim().toLowerCase()))));
  let lastTaskId = null;

  async function task(text, options = {}) {
    try {
      const result = await agent.run(text, confirm, options);
      lastTaskId = result.task?.id || lastTaskId;
      await memory.addTask(text, result.summary, {
        status: result.task?.status || "completed",
        verification: result.verification,
        steps: result.steps,
        changed: result.changed,
        taskId: result.task?.id
      });
    } catch (error) {
      await memory.addTask(text, error.message, { status: "failed", changed: false });
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
      if (line === "/help") console.log(HELP);
      else if (line === "/status") {
        console.log({
          workspace: config.workspace,
          provider: config.provider,
          model: config.model,
          maxSteps: config.maxSteps,
          tokenBudget: config.tokenBudget,
          network: config.allowNetwork,
          checkpoints: config.checkpoints,
          backups: config.backups,
          lastTaskId,
          memory: await memory.stats()
        });
      } else if (line === "/config") console.log(config.snapshot());
      else if (line === "/model") console.log({ provider: config.provider, model: config.model });
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
        console.log(ui.banner());
      } else if (line.startsWith("/plan ")) await task(line.slice(6), { planOnly: true, mode: "plan" });
      else if (line.startsWith("/auto ")) await task(line.slice(6), { mode: "auto" });
      else if (line.startsWith("/debug ")) await task(line.slice(7), { mode: "debug" });
      else if (line.startsWith("/task ")) await task(line.slice(6), { mode: "normal" });
      else await task(line, { mode: "normal" });
    } catch (e) {
      console.error("\x1b[31mERROR:\x1b[0m", e.message);
    }
    rl.prompt();
  });
  rl.on("close", () => process.exit(0));
}

if (require.main === module) main();

module.exports = { main, HELP };
