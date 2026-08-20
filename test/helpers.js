const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("../src/config");

function tempWorkspace(prefix = "agent-v6-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  config.override({ workspace: dir, maxRepairAttempts: 0, checkpoints: false, planApproval: false });
  return dir;
}

function write(dir, relative, content) {
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function scripted(replies) {
  const queue = [...replies];
  return {
    async complete() {
      if (!queue.length) throw new Error("no more scripted provider replies");
      const next = queue.shift();
      if (typeof next === "string") return { text: next, toolCalls: [], usage: { prompt: 1, completion: 1 } };
      if (next.tool) return { text: JSON.stringify(next), toolCalls: [], usage: { prompt: 1, completion: 1 } };
      return { text: next.text || "", toolCalls: next.toolCalls || [], usage: next.usage || { prompt: 1, completion: 1 } };
    }
  };
}

function action(tool, args = {}) {
  return JSON.stringify({ tool, args });
}

module.exports = { tempWorkspace, write, scripted, action };
