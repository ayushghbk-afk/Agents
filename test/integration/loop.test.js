const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const agent = require("../../src/agent");
const { tempWorkspace, write, scripted, action } = require("../helpers");

test("implement loop writes a file then finishes after the quality gate", async () => {
  const dir = tempWorkspace();
  write(dir, "README.md", "# demo\n");
  const provider = scripted([
    action("write_file", { path: "hello.txt", content: "hi\n" }),
    action("done", { summary: "wrote hello", verification: "none yet" }),
    action("run_shell", { command: "test -f hello.txt" }),
    action("done", { summary: "wrote hello.txt", verification: "test -f hello.txt" })
  ]);
  const result = await agent.run("Add hello.txt", async () => true, {
    provider,
    plan: { steps: [{ id: 1, title: "Write file" }, { id: 2, title: "Verify" }] },
    skipApproval: true
  });
  assert.equal(fs.readFileSync(path.join(dir, "hello.txt"), "utf8"), "hi\n");
  assert.match(result.summary, /hello/);
  assert.equal(result.changed, true);
});
