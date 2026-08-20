const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const git = require("../../src/git");
const config = require("../../src/config");
const { tempWorkspace, write } = require("../helpers");

test("rollback restores tracked and untracked files", async () => {
  const dir = tempWorkspace();
  config.override({ checkpoints: true });
  execSync("git init", { cwd: dir });
  execSync("git config user.email test@example.com && git config user.name test", { cwd: dir, shell: "/bin/sh" });
  write(dir, "tracked.txt", "original\n");
  execSync("git add tracked.txt && git commit -m init", { cwd: dir, shell: "/bin/sh" });
  write(dir, "untracked.txt", "keep me\n");
  const shot = await git.checkpoint("before");
  assert.equal(shot.ok, true);
  fs.writeFileSync(path.join(dir, "tracked.txt"), "changed\n");
  fs.writeFileSync(path.join(dir, "untracked.txt"), "mutated\n");
  fs.writeFileSync(path.join(dir, "new-after.txt"), "should go\n");
  const result = await git.rollback();
  assert.equal(result.ok, true);
  assert.equal(fs.readFileSync(path.join(dir, "tracked.txt"), "utf8"), "original\n");
  assert.equal(fs.readFileSync(path.join(dir, "untracked.txt"), "utf8"), "keep me\n");
  assert.equal(fs.existsSync(path.join(dir, "new-after.txt")), false);
});
