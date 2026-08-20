const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadAgentsMarkdown } = require("../../src/context/project");
const { tempWorkspace, write } = require("../helpers");

test("AGENTS.md combines global, project, and directory scopes", async () => {
  const dir = tempWorkspace();
  write(dir, "AGENTS.md", "project rules");
  write(dir, "src/AGENTS.md", "src rules");
  const layers = await loadAgentsMarkdown("src");
  const scopes = layers.map((item) => item.scope);
  assert.ok(scopes.includes("project"));
  assert.ok(scopes.includes("directory"));
  assert.ok(layers.some((item) => item.content.includes("project rules")));
  assert.ok(layers.some((item) => item.content.includes("src rules")));
  assert.equal(fs.existsSync(path.join(dir, "src/AGENTS.md")), true);
});
