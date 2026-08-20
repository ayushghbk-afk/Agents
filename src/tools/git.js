const { exec } = require("./shell");

const READ_ONLY = new Set([
  "status --short",
  "status",
  "branch --show-current",
  "diff --stat",
  "diff",
  "diff --cached",
  "log -5 --oneline",
  "log -10 --oneline"
]);

async function git(command) {
  if (!READ_ONLY.has(command)) {
    throw new Error("Only allowlisted read-only git commands are available through git tool");
  }
  return exec(`git ${command}`);
}

async function status() {
  return exec("git status --short");
}

async function diff(cached = false) {
  return exec(cached ? "git diff --cached" : "git diff");
}

async function log(limit = 5) {
  return exec(`git log -${Math.min(20, Math.max(1, Number(limit) || 5))} --oneline`);
}

module.exports = { git, status, diff, log, READ_ONLY };
