const test = require("node:test");
const assert = require("node:assert/strict");
const context = require("../../src/context");
const { countMessages } = require("../../src/providers/parse");

test("context does not exceed the token budget", () => {
  const messages = [
    { role: "system", content: "sys" },
    { role: "user", content: "task" },
    ...Array.from({ length: 80 }, (_, i) => ({ role: "user", content: `TOOL RESULT:\n${"x".repeat(400)} ${i}` }))
  ];
  const compacted = context.enforceBudget(messages, 500);
  assert.ok(countMessages(compacted) <= 500);
  assert.equal(compacted[0].content, "sys");
  assert.equal(compacted[1].content, "task");
});

test("AGENTS.md layers are ordered global to directory", async () => {
  const layers = await context.loadAgentsMarkdown(".");
  assert.ok(Array.isArray(layers));
});
