const test = require("node:test");
const assert = require("node:assert/strict");
const sandbox = require("../../src/sandbox");
const tools = require("../../src/tools");
const { tempWorkspace } = require("../helpers");

test("dangerous commands are blocked", async () => {
  tempWorkspace();
  assert.equal(sandbox.commandRisk("rm -rf /"), "blocked");
  assert.equal(sandbox.commandRisk("mkfs.ext4 /dev/sda"), "blocked");
  await assert.rejects(() => tools.exec("rm -rf /"), /Blocked destructive command/);
});

test("network commands require permission", async () => {
  tempWorkspace();
  assert.equal(sandbox.commandRisk("curl https://example.com"), "network-blocked");
  await assert.rejects(() => tools.exec("npm install leftpad"), /Network\/package command blocked/);
});
