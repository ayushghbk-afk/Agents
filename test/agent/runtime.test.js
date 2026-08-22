const test = require("node:test");
const assert = require("node:assert/strict");
const agent = require("../../src/agent");
const taskStore = require("../../src/agent/task");
const verifier = require("../../src/agent/verifier");
const { tempWorkspace, scripted, action } = require("../helpers");

test("failed tests trigger repair", () => {
  assert.equal(verifier.shouldRepair({ attempts: 0, results: [{ kind: "test", ok: false }] }), true);
  assert.equal(verifier.shouldRepair({ attempts: 99, results: [{ kind: "test", ok: false }] }), false);
  assert.equal(verifier.shouldRepair({ attempts: 0, results: [{ kind: "test", ok: true }] }), false);
});

test("runtime plans, executes a read-only tool, and finishes", async () => {
  tempWorkspace();
  const provider = scripted([
    action("inspect_project", {}),
    action("done", { summary: "Inspected only", verification: "no edits" })
  ]);
  const result = await agent.run("Inspect the project", async () => true, {
    provider,
    plan: { steps: [{ id: 1, title: "Inspect" }] },
    skipApproval: true,
    planOnly: true
  });
  assert.match(result.summary, /Inspected/);
  assert.equal(result.task.status, "completed");
});

test("runtime passes OpenAI tool definitions to the provider", async () => {
  tempWorkspace();
  let seenTools = null;
  const provider = {
    async complete(options) {
      seenTools = options.tools;
      return {
        text: action("done", { summary: "Received tools", verification: "tool catalog present" }),
        toolCalls: [],
        usage: { prompt: 1, completion: 1 }
      };
    }
  };
  const result = await agent.run("Verify tool definitions are sent", async () => true, {
    provider,
    plan: { steps: [{ id: 1, title: "Check" }] },
    skipApproval: true
  });
  assert.ok(Array.isArray(seenTools) && seenTools.length > 0, "provider must receive tools");
  assert.equal(seenTools[0].type, "function");
  const names = seenTools.map((t) => t.function.name);
  assert.ok(names.includes("read_file"), "tool catalog includes read_file");
  assert.ok(names.includes("done"), "tool catalog includes done");
  assert.match(result.summary, /Received tools/);
  assert.equal(result.task.status, "completed");
});

test("plan-only mode blocks writes", async () => {
  const dir = tempWorkspace();
  const provider = scripted([
    action("write_file", { path: "x.js", content: "nope" }),
    action("done", { summary: "Plan: do not write yet" })
  ]);
  const result = await agent.run("Plan a change", async () => true, {
    provider,
    planOnly: true,
    mode: "plan",
    plan: { steps: [{ id: 1, title: "Plan" }] },
    skipApproval: true
  });
  assert.match(result.summary, /Plan/);
  assert.equal(require("fs").existsSync(require("path").join(dir, "x.js")), false);
});

test("interrupted tasks can resume", async () => {
  tempWorkspace();
  const task = taskStore.create({ objective: "Finish later" });
  task.status = "paused";
  task.plan = { steps: [{ id: 1, title: "Finish" }] };
  task.messages = [
    { role: "system", content: "sys" },
    { role: "user", content: "TASK:\nFinish later" }
  ];
  await taskStore.save(task);
  const result = await agent.resume(task.id, async () => true, {
    provider: scripted([action("done", { summary: "Resumed and finished", verification: "n/a" })])
  });
  assert.match(result.summary, /Resumed/);
  assert.equal(result.task.status, "completed");
});
