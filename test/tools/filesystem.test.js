const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const tools = require("../../src/tools");
const { tempWorkspace, write } = require("../helpers");

test("read/write/patch stay sandboxed and patch requires a unique match", async () => {
  const dir = tempWorkspace();
  write(dir, "src/a.js", "const x = 1;\nconst y = 2;\n");
  await tools.write("src/a.js", "const x = 1;\nconst y = 2;\n");
  const patched = await tools.patch("src/a.js", "const y = 2;", "const y = 3;");
  assert.match(patched, /patched/);
  assert.match(await tools.read("src/a.js"), /const y = 3/);
  await assert.rejects(() => tools.patch("src/a.js", "missing", "nope"), /exactly one match/);
  await assert.rejects(() => tools.read(".env"), /Protected file/);
  fs.writeFileSync(path.join(dir, ".env"), "SECRET=1\n");
  await assert.rejects(() => tools.read(".env"), /Protected file/);
});

test("find_files matches glob-like patterns", async () => {
  const dir = tempWorkspace();
  write(dir, "src/one.js", "1");
  write(dir, "src/two.ts", "2");
  const hits = await tools.find("*.js");
  assert.ok(hits.some((file) => file.endsWith("one.js")));
  assert.ok(!hits.some((file) => file.endsWith("two.ts")));
});
