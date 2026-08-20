const RESET = "\x1b[0m";
const colors = {
  magenta: (text) => `\x1b[35m${text}${RESET}`,
  cyan: (text) => `\x1b[36m${text}${RESET}`,
  green: (text) => `\x1b[32m${text}${RESET}`,
  red: (text) => `\x1b[31m${text}${RESET}`,
  yellow: (text) => `\x1b[33m${text}${RESET}`,
  dim: (text) => `\x1b[90m${text}${RESET}`
};

function banner() {
  return colors.magenta("╔══════════════════════════════════════╗\n║        TERMUX CODING AGENT V6        ║\n╚══════════════════════════════════════╝");
}

function step(current, max, task) {
  const status = task?.status ? ` ${task.status}` : "";
  const sub = task?.currentSubtask ? ` — ${task.currentSubtask}` : "";
  return colors.cyan(`[STEP ${current}/${max}${status}]${sub}`);
}

function ok(text) {
  return colors.green(`✓ ${text}`);
}

function fail(text) {
  return colors.red(`✗ ${text}`);
}

function plan(value) {
  const lines = (value?.steps || []).map((item, i) => `  ${item.id || i + 1}. ${item.title || item}`);
  return `PLAN\n${lines.join("\n") || "  (empty)"}`;
}

function usage(task) {
  const prompt = task?.usage?.prompt || 0;
  const completion = task?.usage?.completion || 0;
  return `tokens prompt=${prompt} completion=${completion}`;
}

module.exports = { colors, banner, step, ok, fail, plan, usage };
