const fs = require("fs/promises");
const path = require("path");
const config = require("./config");
const tools = require("./tools");

const MANIFESTS = [
  "package.json", "pnpm-lock.yaml", "yarn.lock", "package-lock.json",
  "pyproject.toml", "requirements.txt", "Pipfile", "poetry.lock",
  "Cargo.toml", "go.mod", "Gemfile", "composer.json", "Makefile"
];
const INSTRUCTION_FILES = ["AGENTS.md", "agents.md", "CONTRIBUTING.md"];

async function exists(relative) {
  try { await fs.access(await tools.secure(relative)); return true; } catch { return false; }
}
function detectLanguage(files) {
  const names = new Set(files);
  const has = suffix => files.some(file => file.endsWith(suffix));
  if (names.has("package.json") || has(".js") || has(".ts")) return "JavaScript/TypeScript";
  if (names.has("pyproject.toml") || has(".py")) return "Python";
  if (names.has("Cargo.toml") || has(".rs")) return "Rust";
  if (names.has("go.mod") || has(".go")) return "Go";
  if (has(".java") || names.has("pom.xml")) return "Java";
  return "unknown";
}
function packageInfo(raw) {
  try {
    const pkg = JSON.parse(raw);
    return {
      name: pkg.name || "",
      packageManager: pkg.packageManager || (pkg.workspaces ? "npm workspaces" : "npm"),
      scripts: pkg.scripts || {},
      framework: ["next", "react", "vue", "svelte", "express", "fastify", "nestjs"].find(name => pkg.dependencies?.[name] || pkg.devDependencies?.[name]) || ""
    };
  } catch { return {}; }
}
async function inspect() {
  const files = await tools.tree({ depth: 4, maxEntries: 800 });
  const present = MANIFESTS.filter(file => files.includes(file));
  const info = { language: detectLanguage(files), manifests: present, packageManager: "", framework: "", scripts: {}, tests: [] };
  if (files.includes("package.json")) Object.assign(info, packageInfo(await tools.read("package.json")));
  if (files.includes("pnpm-lock.yaml")) info.packageManager = "pnpm";
  else if (files.includes("yarn.lock")) info.packageManager = "yarn";
  else if (files.includes("package-lock.json") && !info.packageManager) info.packageManager = "npm";
  else if (files.includes("pyproject.toml")) info.packageManager = "pip/pyproject";
  else if (files.includes("Cargo.toml")) info.packageManager = "cargo";
  else if (files.includes("go.mod")) info.packageManager = "go";
  info.tests = files.filter(file => /(^|\/)(test|tests|__tests__)\//i.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(file)).slice(0, 40);
  info.instructions = [];
  for (const file of INSTRUCTION_FILES) if (await exists(file)) {
    const content = await tools.read(file);
    info.instructions.push({ file, content: tools.clip(content, 6000) });
  }
  return info;
}

module.exports = { inspect, detectLanguage, packageInfo, MANIFESTS, INSTRUCTION_FILES };
