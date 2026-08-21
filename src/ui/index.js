const modes = require("../modes");

const RESET = "\x1b[0m";
const colors = {
  magenta: (text) => `\x1b[35m${text}${RESET}`,
  cyan: (text) => `\x1b[36m${text}${RESET}`,
  green: (text) => `\x1b[32m${text}${RESET}`,
  red: (text) => `\x1b[31m${text}${RESET}`,
  yellow: (text) => `\x1b[33m${text}${RESET}`,
  dim: (text) => `\x1b[90m${text}${RESET}`,
  bold: (text) => `\x1b[1m${text}${RESET}`,
  inverse: (text) => `\x1b[7m${text}${RESET}`
};

function paint(name, text) {
  return (colors[name] || colors.cyan)(text);
}

function chip(label, active, color) {
  if (active) return paint(color, colors.bold(`[● ${label}]`));
  return colors.dim(`[ ${label} ]`);
}

function modeBar(modeId = "pro") {
  let active = "pro";
  try {
    active = modes.resolve(modeId).id;
  } catch {
    active = "pro";
  }
  const models = modes
    .list("model")
    .map((mode) => chip(mode.label, mode.id === active, mode.color))
    .join("  ");
  const tools = modes
    .list("tool")
    .map((mode) => (mode.id === active ? paint(mode.color, mode.label) : colors.dim(mode.label)))
    .join("  ·  ");
  return `${models}\n${colors.dim("Tools")}  ${tools}`;
}

function banner(modeId = "pro") {
  return (
    colors.magenta("╔══════════════════════════════════════╗\n║        TERMUX CODING AGENT V6        ║\n╚══════════════════════════════════════╝") +
    "\n" +
    modeBar(modeId)
  );
}

function composer(modeId = "pro") {
  const mode = modes.resolve(modeId);
  return [
    colors.dim("╭──────────────────────────────────────╮"),
    `│  ${paint(mode.color, mode.label + " ▾")}  ${colors.dim("Ask or assign a workspace task")} │`,
    colors.dim("╰──────────────────────────────────────╯")
  ].join("\n");
}

function prompt(modeId = "pro") {
  let label = "Pro";
  try {
    label = modes.resolve(modeId).label;
  } catch {}
  return `${label} ▾  agent> `;
}

function modePicker(modeId = "pro") {
  let active = "pro";
  try {
    active = modes.resolve(modeId).id;
  } catch {}
  const lines = [colors.bold("  MODE PICKER"), colors.dim("  Gemini-style models and tools. /mode NAME or /mode N")];
  const sections = [
    ["Models", modes.list("model")],
    ["Tools", modes.list("tool")]
  ];
  let index = 1;
  for (const [title, items] of sections) {
    lines.push("");
    lines.push(colors.cyan(`  ${title}`));
    for (const mode of items) {
      const selected = mode.id === active;
      const mark = selected ? "●" : " ";
      const num = String(index).padStart(2, " ");
      const name = mode.label.padEnd(10);
      const row = `  ${mark}${num}  ${name}  ${mode.hint}`;
      lines.push(selected ? paint(mode.color, colors.bold(row)) : colors.dim(row));
      lines.push(colors.dim(`       ${mode.description}`));
      index += 1;
    }
  }
  return lines.join("\n");
}

function modeChanged(policy) {
  return `${paint(policy.color, policy.label)} ▾  ${colors.dim(policy.hint)} — ${policy.description}`;
}

function step(current, max, task) {
  const status = task?.status ? ` ${task.status}` : "";
  const sub = task?.currentSubtask ? ` — ${task.currentSubtask}` : "";
  const mode = task?.mode ? ` ${String(task.mode).toUpperCase()}` : "";
  return colors.cyan(`[STEP ${current}/${max}${mode}${status}]${sub}`);
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
  const promptTokens = task?.usage?.prompt || 0;
  const completion = task?.usage?.completion || 0;
  return `tokens prompt=${promptTokens} completion=${completion}`;
}

module.exports = {
  colors,
  banner,
  modeBar,
  composer,
  prompt,
  modePicker,
  modeChanged,
  chip,
  step,
  ok,
  fail,
  plan,
  usage
};
