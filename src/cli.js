const readline = require("readline");
const config = require("./config");
const agent = require("./agent");
const memory = require("./memory");
const git = require("./git");
const tools = require("./tools");

const HELP = `/help                 Show commands
/status               Runtime and memory status
/inspect              Print workspace tree
/plan TASK            Research and produce a read-only plan
/task TASK             Execute a task (plain text does the same)
/history               Show recent completed tasks
/memory [QUERY]        Show memory stats or relevant recall
/remember KIND TEXT    Save a durable fact, decision, or note
/forget SCOPE          Clear facts, decisions, notes, tasks, or all
/checkpoint [LABEL]    Capture tracked Git state without changing worktree
/rollback              Restore the latest checkpoint (confirmation required)
/quit                  Exit`;

async function main() {
  console.log("\x1b[35m╔══════════════════════════════════════╗\n║        TERMUX CODING AGENT V5        ║\n╚══════════════════════════════════════╝\x1b[0m");
  console.log(`Workspace: ${config.workspace}\nModel: ${config.aiModel}\nProxy: ${config.aiProxyUrl}\nType /help for commands.\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "agent> " });
  const confirm = question => new Promise(resolve => rl.question(question, answer => resolve(["y", "yes"].includes(answer.trim().toLowerCase()))));
  async function task(text, options = {}) {
    try {
      const result = await agent.run(text, confirm, options);
      await memory.addTask(text, result.summary, { status: "completed", verification: result.verification, steps: result.steps, changed: result.changed });
    } catch (error) {
      await memory.addTask(text, error.message, { status: "failed", changed: false });
      throw error;
    }
  }
  rl.prompt();
  rl.on("line", async input => {
    const line = input.trim();
    if (!line) { rl.prompt(); return; }
    try {
      if (["/quit", "/exit"].includes(line)) return rl.close();
      if (line === "/help") console.log(HELP);
      else if (line === "/status") console.log({ workspace: config.workspace, model: config.aiModel, maxSteps: config.maxSteps, network: config.allowNetwork, checkpoints: config.checkpoints, memory: await memory.stats() });
      else if (line === "/inspect") console.log((await tools.tree()).join("\n"));
      else if (line === "/history") console.log(JSON.stringify((await memory.load()).tasks.slice(-20), null, 2));
      else if (line === "/memory") console.log(await memory.stats());
      else if (line.startsWith("/memory ")) console.log(JSON.stringify(await memory.context(line.slice(8)), null, 2));
      else if (line.startsWith("/remember ")) {
        const match = line.match(/^\/remember\s+(fact|facts|decision|decisions|note|notes)\s+(.+)$/i);
        if (!match) throw new Error("Usage: /remember KIND TEXT (KIND: fact, decision, note)");
        const kinds = { fact: "facts", facts: "facts", decision: "decisions", decisions: "decisions", note: "notes", notes: "notes" };
        console.log(await memory.remember(kinds[match[1].toLowerCase()], match[2], "user"));
      } else if (line.startsWith("/forget ")) {
        const scope = line.slice(8).trim();
        if (!await confirm(`Clear memory scope '${scope}'? [y/N] `)) console.log("Cancelled.");
        else { await memory.clear(scope); console.log(`Cleared ${scope}.`); }
      } else if (line.startsWith("/checkpoint")) console.log(await git.checkpoint(line.slice(11).trim() || "manual"));
      else if (line === "/rollback") {
        if (!await confirm("Apply latest checkpoint over the current tracked worktree? [y/N] ")) console.log("Cancelled.");
        else console.log(await git.rollback());
      } else if (line.startsWith("/plan ")) await task(line.slice(6), { planOnly: true });
      else if (line.startsWith("/task ")) await task(line.slice(6));
      else await task(line);
    } catch (e) { console.error("\x1b[31mERROR:\x1b[0m", e.message); }
    rl.prompt();
  });
  rl.on("close", () => process.exit(0));
}
main();
