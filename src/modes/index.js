const DEFAULT_POLICY = {
  maxSteps: null,
  temperature: null,
  maxOutputTokens: null,
  planOnly: false,
  mutating: true,
  qualityGate: true,
  repair: true,
  checkpoints: true,
  guidance: "Implement carefully and verify changed behavior."
};

const MODES = {
  fast: {
    id: "fast",
    label: "Fast",
    group: "model",
    color: "cyan",
    hint: "Speed over depth",
    description: "Quick answers and short edits. Fewer steps; skip heavy verification.",
    maxSteps: 16,
    temperature: 0.45,
    maxOutputTokens: 2048,
    qualityGate: false,
    repair: false,
    checkpoints: false,
    guidance:
      "Prefer the shortest path. Inspect only what you need. Skip exhaustive tests unless the user asked. Finish as soon as the request is met."
  },
  thinking: {
    id: "thinking",
    label: "Thinking",
    group: "model",
    color: "magenta",
    hint: "Reason, then act",
    description: "Extended reasoning. Inspect thoroughly, then implement and verify.",
    temperature: 0.05,
    maxOutputTokens: 8000,
    guidance:
      "Think before each tool. Inspect relevant files, name the root cause, then change the minimum complete set of files. Verify with a focused test. Do not rush done."
  },
  pro: {
    id: "pro",
    label: "Pro",
    group: "model",
    color: "green",
    hint: "Balanced quality",
    description: "Full coding agent — implement, verify, and repair.",
    guidance: "Implement carefully and verify changed behavior."
  },
  auto: {
    id: "auto",
    label: "Auto",
    group: "tool",
    color: "green",
    hint: "Hands-off loop",
    description: "Autonomous inspect → implement → verify → repair. Minimize questions.",
    guidance:
      "Work autonomously through inspect, implement, verify, diagnose, and repair; minimize unnecessary questions."
  },
  plan: {
    id: "plan",
    label: "Plan",
    group: "tool",
    color: "yellow",
    hint: "Read-only canvas",
    description: "Research and produce a concrete implementation plan. No writes.",
    planOnly: true,
    mutating: false,
    qualityGate: false,
    repair: false,
    checkpoints: false,
    maxSteps: 20,
    guidance:
      "Research only; produce a concrete, ordered implementation plan with affected files and verification steps. Do not modify the workspace."
  },
  debug: {
    id: "debug",
    label: "Debug",
    group: "tool",
    color: "red",
    hint: "Root-cause fix",
    description: "Reproduce the failure, isolate the cause, fix, and regression-test.",
    guidance:
      "Reproduce the failure, isolate the root cause, apply a minimal fix, and prove it with a focused regression check."
  },
  research: {
    id: "research",
    label: "Research",
    group: "tool",
    color: "cyan",
    hint: "Deep inspect",
    description: "Deep inspect and search. Synthesize findings. No writes.",
    planOnly: true,
    mutating: false,
    qualityGate: false,
    repair: false,
    checkpoints: false,
    maxSteps: 28,
    temperature: 0.2,
    maxOutputTokens: 6000,
    guidance:
      "Deep-research the workspace. Inspect, search, and read widely. Synthesize findings with file citations. Do not modify files, checkpoint, or run mutating commands."
  },
  ask: {
    id: "ask",
    label: "Ask",
    group: "tool",
    color: "yellow",
    hint: "Chat, no writes",
    description: "Answer questions about the repo. Inspect if needed. No writes.",
    planOnly: true,
    mutating: false,
    qualityGate: false,
    repair: false,
    checkpoints: false,
    maxSteps: 10,
    temperature: 0.5,
    maxOutputTokens: 2500,
    guidance:
      "Answer the user clearly. You may inspect the workspace. Do not modify files, run mutating commands, or create checkpoints."
  }
};

const ALIASES = {
  normal: "pro",
  agent: "pro",
  default: "pro",
  balanced: "pro",
  think: "thinking",
  reasoning: "thinking",
  chat: "ask",
  qa: "ask",
  qna: "ask",
  deep: "research",
  "deep-research": "research",
  "deep_research": "research",
  canvas: "plan",
  planning: "plan"
};

const NAMES = Object.keys(MODES);

function canonical(name) {
  const raw = String(name || "").trim().toLowerCase();
  if (!raw) return "pro";
  return ALIASES[raw] || raw;
}

function get(name) {
  return MODES[canonical(name)] || null;
}

function resolve(name) {
  const id = canonical(name);
  const mode = MODES[id];
  if (!mode) {
    throw new Error(`Unknown mode '${name}'. Choose ${NAMES.join(", ")} (or /mode).`);
  }
  return { ...DEFAULT_POLICY, ...mode };
}

function list(group) {
  const all = Object.values(MODES);
  return group ? all.filter((mode) => mode.group === group) : all;
}

function known(name) {
  return Boolean(get(name));
}

function parse(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const index = Number(raw) - 1;
    return list()[index] ? resolve(list()[index].id) : null;
  }
  if (!known(raw)) return null;
  return resolve(raw);
}

function maxSteps(policy, fallback) {
  return policy?.maxSteps || fallback;
}

module.exports = {
  MODES,
  ALIASES,
  NAMES,
  DEFAULT_POLICY,
  canonical,
  get,
  resolve,
  list,
  known,
  parse,
  maxSteps
};
