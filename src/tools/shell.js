const { spawn } = require("child_process");
const config = require("../config");
const sandbox = require("../sandbox");
const { clip } = require("./filesystem");

function exec(command, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof command !== "string" || !command.trim()) return reject(new Error("Command is required"));
    const risk = sandbox.commandRisk(command);
    if (risk === "blocked") return reject(new Error("Blocked destructive command"));
    if (risk === "network-blocked") return reject(new Error("Network/package command blocked; set ALLOW_NETWORK=true"));
    const timeoutMs = Number(options.timeoutMs) || config.commandTimeoutMs;
    const child = spawn("sh", ["-lc", command], {
      cwd: options.cwd || config.workspace,
      env: sandbox.envForChild(),
      detached: true
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }, timeoutMs);
    child.stdout.on("data", (data) => {
      stdout = clip(stdout + data);
    });
    child.stderr.on("data", (data) => {
      stderr = clip(stderr + data);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timeout: timedOut, stdout: clip(stdout), stderr: clip(stderr), risk });
    });
  });
}

module.exports = { exec };
