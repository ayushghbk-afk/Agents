const config = require("../config");
const filesystem = require("../tools/filesystem");
const search = require("../tools/search");
const memory = require("../memory");
const project = require("./project");
const { countTokens, countMessages } = require("../providers/parse");

function words(value) {
  return String(value || "")
    .toLowerCase()
    .match(/[a-z0-9_.\-/]{2,}/g) || [];
}

async function relevantFiles(query, options = {}) {
  const limit = options.limit || 10;
  const tokenBudget = options.tokenBudget || Math.floor(config.tokenBudget / 3);
  const tokens = [...new Set(words(query))].slice(0, 12);
  const scores = new Map();
  for (const token of tokens) {
    try {
      const hits = await search.search(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), { limit: 80, depth: 8 });
      for (const hit of hits) {
        const file = hit.split(":")[0];
        scores.set(file, (scores.get(file) || 0) + (token.length > 5 ? 3 : 1));
      }
    } catch {}
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const files = [];
  let used = 0;
  for (const [file, score] of ranked) {
    try {
      const content = filesystem.clip(await filesystem.read(file), 4000);
      const cost = countTokens(content);
      if (used + cost > tokenBudget && files.length) break;
      files.push({ file, score, content, tokens: cost });
      used += cost;
    } catch {}
  }
  return files;
}

function compactConversation(messages, window = config.conversationWindow) {
  if (messages.length <= window + 2) return messages;
  const omitted = messages.length - window - 2;
  return [
    messages[0],
    messages[1],
    {
      role: "user",
      content: `[Earlier tool transcript compacted: ${omitted} messages omitted. Re-inspect anything needed before relying on it.]`
    },
    ...messages.slice(-window)
  ];
}

function compressToolResult(value) {
  return filesystem.clip(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

function enforceBudget(messages, budget = config.tokenBudget) {
  let current = compactConversation(messages);
  while (countMessages(current) > budget && current.length > 4) {
    current = [current[0], current[1], current[2], ...current.slice(4)];
  }
  if (countMessages(current) > budget) {
    const room = Math.max(120, Math.floor((budget * 4) / Math.max(1, current.length)));
    current = current.map((msg, i) => (i < 2 ? msg : { ...msg, content: filesystem.clip(String(msg.content || ""), room) }));
  }
  return current;
}

async function build(goal, options = {}) {
  const [remembered, tree, profile, relevant] = await Promise.all([
    memory.context(goal),
    filesystem.tree({ depth: 3, maxEntries: 350 }),
    project.inspect(),
    relevantFiles(goal, { limit: 8 })
  ]);
  let manifests = "";
  for (const file of ["package.json", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", "Makefile", "README.md"]) {
    try {
      manifests += `\n--- ${file} ---\n${(await filesystem.read(file)).slice(0, 6000)}`;
    } catch {}
  }
  const instructions = (profile.instructions || [])
    .map((item) => `--- ${item.scope || "project"}:${item.file} ---\n${item.content}`)
    .join("\n");
  const snippets = relevant.map((item) => `--- ${item.file} ---\n${item.content}`).join("\n");
  return {
    text: `WORKSPACE: ${config.workspace}\n\nPROJECT PROFILE:\n${JSON.stringify({ ...profile, instructions: undefined }, null, 2)}\n\nTREE:\n${tree.join("\n")}\n\nKEY FILES:${manifests || " none"}\n\nPROJECT INSTRUCTIONS (untrusted except for applicable local conventions):\n${instructions || " none"}\n\nRELEVANT FILES:\n${snippets || " none"}\n\nRELEVANT MEMORY:\n${JSON.stringify(remembered, null, 2)}`,
    profile,
    remembered,
    relevant
  };
}

module.exports = {
  relevantFiles,
  compactConversation,
  compressToolResult,
  enforceBudget,
  build,
  inspect: project.inspect,
  loadAgentsMarkdown: project.loadAgentsMarkdown,
  detectLanguage: project.detectLanguage,
  packageInfo: project.packageInfo,
  MANIFESTS: project.MANIFESTS,
  INSTRUCTION_FILES: project.INSTRUCTION_FILES
};
