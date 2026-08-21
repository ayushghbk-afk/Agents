const test = require("node:test");
const assert = require("node:assert/strict");
const modes = require("../../src/modes");
const ui = require("../../src/ui");
const agent = require("../../src/agent");
const { tempWorkspace, scripted, action } = require("../helpers");

test("mode catalog aliases Gemini names onto canonical ids", () => {
  assert.equal(modes.resolve("normal").id, "pro");
  assert.equal(modes.resolve("think").id, "thinking");
  assert.equal(modes.resolve("chat").id, "ask");
  assert.equal(modes.resolve("deep-research").id, "research");
  assert.equal(modes.resolve("canvas").id, "plan");
  assert.equal(modes.parse("3").id, "pro");
  assert.throws(() => modes.resolve("nope"), /Unknown mode/);
});

test("read-only modes disable mutation and quality gates", () => {
  for (const name of ["plan", "research", "ask"]) {
    const policy = modes.resolve(name);
    assert.equal(policy.mutating, false);
    assert.equal(policy.planOnly, true);
    assert.equal(policy.qualityGate, false);
  }
  assert.equal(modes.resolve("fast").qualityGate, false);
  assert.equal(modes.resolve("thinking").guidance.includes("Think before"), true);
});

test("Gemini-style UI marks the active model chip and lists tools", () => {
  const banner = ui.banner("thinking");
  assert.match(banner, /TERMUX CODING AGENT V6/);
  assert.match(banner, /● Thinking/);
  assert.match(banner, /Tools/);
  const picker = ui.modePicker("pro");
  assert.match(picker, /MODE PICKER/);
  assert.match(picker, /Fast/);
  assert.match(picker, /Thinking/);
  assert.match(picker, /Pro/);
  assert.match(picker, /Research/);
  assert.equal(ui.prompt("fast"), "Fast ▾  agent> ");
});

test("research mode blocks writes", async () => {
  const dir = tempWorkspace();
  const provider = scripted([
    action("write_file", { path: "x.js", content: "nope" }),
    action("done", { summary: "Research: do not write" })
  ]);
  const result = await agent.run("Study the repo", async () => true, {
    provider,
    mode: "research",
    plan: { steps: [{ id: 1, title: "Inspect" }] },
    skipApproval: true
  });
  assert.match(result.summary, /Research/);
  assert.equal(require("fs").existsSync(require("path").join(dir, "x.js")), false);
});

test("fast mode skips the quality gate after edits", async () => {
  const dir = tempWorkspace();
  const provider = scripted([
    action("write_file", { path: "a.js", content: "module.exports = 1;\n" }),
    action("done", { summary: "Wrote a.js", verification: "skipped in fast" })
  ]);
  const result = await agent.run("Write a.js", async () => true, {
    provider,
    mode: "fast",
    plan: { steps: [{ id: 1, title: "Write" }] },
    skipApproval: true
  });
  assert.match(result.summary, /Wrote/);
  assert.equal(result.task.status, "completed");
  assert.equal(result.task.mode, "fast");
  assert.equal(require("fs").existsSync(require("path").join(dir, "a.js")), true);
});
