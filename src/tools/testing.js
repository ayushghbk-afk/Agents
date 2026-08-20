const fs = require("fs/promises");
const path = require("path");
const config = require("../config");
const { exec } = require("./shell");

async function detectCommands() {
  const commands = { test: null, lint: null, build: null, typecheck: null };
  try {
    const raw = await fs.readFile(path.join(config.workspace, "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    const scripts = pkg.scripts || {};
    if (scripts.test) commands.test = "npm test";
    if (scripts.lint) commands.lint = "npm run lint";
    if (scripts.build) commands.build = "npm run build";
    if (scripts.typecheck) commands.typecheck = "npm run typecheck";
    else if (scripts["type-check"]) commands.typecheck = "npm run type-check";
  } catch {}
  try {
    await fs.access(path.join(config.workspace, "pyproject.toml"));
    if (!commands.test) commands.test = "pytest";
  } catch {}
  try {
    await fs.access(path.join(config.workspace, "Cargo.toml"));
    if (!commands.test) commands.test = "cargo test";
    if (!commands.build) commands.build = "cargo build";
  } catch {}
  try {
    await fs.access(path.join(config.workspace, "go.mod"));
    if (!commands.test) commands.test = "go test ./...";
    if (!commands.build) commands.build = "go build ./...";
  } catch {}
  try {
    await fs.access(path.join(config.workspace, "Makefile"));
    if (!commands.test) commands.test = "make test";
  } catch {}
  return commands;
}

async function run(kind) {
  const commands = await detectCommands();
  const command = commands[kind];
  if (!command) return { skipped: true, reason: `No ${kind} command detected`, code: 0 };
  const result = await exec(command);
  return { skipped: false, command, ...result };
}

function extractFailures(output) {
  const text = `${output.stdout || ""}\n${output.stderr || ""}`;
  const lines = text.split("\n").filter((line) => /fail|error|not ok|assertion/i.test(line));
  return lines.slice(0, 40);
}

module.exports = { detectCommands, run, extractFailures };
