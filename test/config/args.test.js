const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseArgs, expandHome } = require("../../src/config/args");
const config = require("../../src/config");
const { applyCliArgs } = require("../../src/cli");

test("expandHome resolves ~ to the user home directory", () => {
  assert.equal(expandHome("~"), os.homedir());
  assert.equal(expandHome("~/projects/test-website"), path.join(os.homedir(), "projects/test-website"));
  assert.equal(expandHome("/tmp/project"), "/tmp/project");
});

test("parseArgs reads --workspace, -w, and --workspace=", () => {
  assert.equal(parseArgs(["--workspace", "~/projects/test-website"]).workspace, path.join(os.homedir(), "projects/test-website"));
  assert.equal(parseArgs(["-w", "/data/data/com.termux/files/home/projects/test-website"]).workspace, "/data/data/com.termux/files/home/projects/test-website");
  assert.equal(parseArgs(["--workspace=/tmp/site"]).workspace, "/tmp/site");
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["--mode", "thinking"]).mode, "thinking");
});

test("parseArgs rejects unknown flags and missing values", () => {
  assert.throws(() => parseArgs(["--nope"]), /Unknown option/);
  assert.throws(() => parseArgs(["--workspace"]), /requires a value/);
});

test("applyCliArgs pins the project workspace without using process.cwd", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-ws-"));
  const previous = config.workspace;
  try {
    const args = applyCliArgs(["--workspace", dir, "--mode", "fast"]);
    assert.equal(args.workspace, dir);
    assert.equal(config.workspace, path.resolve(dir));
    assert.equal(config.mode, "fast");
  } finally {
    config.override({ workspace: previous });
  }
});

test("applyWorkspace refuses a missing project directory", () => {
  assert.throws(
    () => config.applyWorkspace(path.join(os.tmpdir(), "does-not-exist-" + Date.now()), { mustExist: true }),
    /does not exist/
  );
});
