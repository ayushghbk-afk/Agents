const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const sandbox = require("../../src/sandbox");
const { tempWorkspace } = require("../helpers");

test("agent cannot escape workspace", () => {
  tempWorkspace();
  assert.throws(() => sandbox.safe("../../etc/passwd"), /escapes workspace/);
  assert.throws(() => sandbox.safe("/etc/passwd"), /escapes workspace/);
  assert.doesNotThrow(() => sandbox.safe("src/index.js"));
});

test("protected files and secrets are detected", () => {
  assert.equal(sandbox.isProtected(".env"), true);
  assert.equal(sandbox.isProtected(".env.example"), false);
  assert.ok(sandbox.detectSecrets("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----").includes("private-key"));
  assert.match(sandbox.redact("api_key=super-secret-value"), /REDACTED/);
});

test("child env strips credential variables", () => {
  process.env.AI_API_KEY = "secret-test-key";
  const env = sandbox.envForChild();
  assert.equal(env.AI_API_KEY, undefined);
  delete process.env.AI_API_KEY;
});

test("resolve stays inside the workspace", async () => {
  const dir = tempWorkspace();
  const target = await sandbox.resolve("nested/file.txt");
  assert.equal(target, path.join(dir, "nested/file.txt"));
});
