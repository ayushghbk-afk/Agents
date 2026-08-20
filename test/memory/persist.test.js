const test = require("node:test");
const assert = require("node:assert/strict");
const memory = require("../../src/memory");
const { tempWorkspace } = require("../helpers");

test("memory survives restart and stores decision metadata", async () => {
  tempWorkspace();
  await memory.remember("facts", "uses node --test");
  await memory.remember("decisions", "Use X", "agent", {
    why: "Y caused compatibility problems.",
    alternatives: "Z was rejected because it broke Termux.",
    affectedFiles: ["src/a.js"]
  });
  const first = await memory.load();
  assert.equal(first.facts.at(-1).text, "uses node --test");
  assert.match(first.decisions.at(-1).why, /compatibility/);
  const recalled = await memory.context("compatibility Termux");
  assert.ok(recalled.decisions.length);
  const again = await memory.load();
  assert.equal(again.facts.length, first.facts.length);
  assert.equal(again.decisions.length, first.decisions.length);
});
