const os = require("os");
const path = require("path");

function expandHome(value) {
  const text = String(value || "");
  if (!text) return text;
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function takeValue(argv, i, flag) {
  const current = argv[i];
  const eq = current.indexOf("=");
  if (current.startsWith(`${flag}=`) && eq !== -1) return { value: current.slice(eq + 1), next: i };
  const next = argv[i + 1];
  if (next === undefined || next.startsWith("-")) throw new Error(`${flag} requires a value`);
  return { value: next, next: i + 1 };
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    help: false,
    workspace: null,
    mode: null,
    rest: []
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--workspace" || arg === "-w" || arg.startsWith("--workspace=")) {
      const taken = takeValue(argv, i, "--workspace");
      if (!String(taken.value || "").trim()) throw new Error("--workspace requires a value");
      out.workspace = expandHome(taken.value);
      i = taken.next;
      continue;
    }
    if (arg === "--mode" || arg === "-m" || arg.startsWith("--mode=")) {
      const taken = takeValue(argv, i, "--mode");
      if (!String(taken.value || "").trim()) throw new Error("--mode requires a value");
      out.mode = taken.value;
      i = taken.next;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    out.rest.push(arg);
  }
  return out;
}

module.exports = { parseArgs, expandHome };
