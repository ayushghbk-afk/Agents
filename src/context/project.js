const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const config = require("../config");
const filesystem = require("../tools/filesystem");
const sandbox = require("../sandbox");

const MANIFESTS = [
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "poetry.lock",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "composer.json",
  "Makefile"
];
const INSTRUCTION_FILES = ["AGENTS.md", "agents.md", "CONTRIBUTING.md"];

async function exists(relative) {
  try {
    await fs.access(await sandbox.resolve(relative));
    return true;
  } catch {
    return false;
  }
}

function detectLanguage(files) {
  const names = new Set(files);
  const has = (suffix) => files.some((file) => file.endsWith(suffix));
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
      framework:
        ["next", "react", "vue", "svelte", "express", "fastify", "nestjs"].find(
          (name) => pkg.dependencies?.[name] || pkg.devDependencies?.[name]
        ) || ""
    };
  } catch {
    return {};
  }
}

async function readIfPresent(file) {
  try {
    return await filesystem.read(file);
  } catch {
    return "";
  }
}

async function loadAgentsMarkdown(focus = ".") {
  const layers = [];
  const home = path.join(os.homedir(), "AGENTS.md");
  try {
    layers.push({ scope: "global", file: home, content: filesystem.clip(await fs.readFile(home, "utf8"), 6000) });
  } catch {}
  const start = path.resolve(config.workspace, focus);
  const root = config.workspace;
  const dirs = [];
  let current = start;
  while (current.startsWith(root)) {
    dirs.push(current);
    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  dirs.reverse();
  for (const dir of dirs) {
    for (const name of ["AGENTS.md", "agents.md"]) {
      const file = path.join(dir, name);
      try {
        const content = await fs.readFile(file, "utf8");
        const rel = path.relative(root, file) || name;
        layers.push({
          scope: dir === root ? "project" : "directory",
          file: rel,
          content: filesystem.clip(content, 6000)
        });
        break;
      } catch {}
    }
  }
  return layers;
}

async function inspect() {
  const files = await filesystem.tree({ depth: 4, maxEntries: 800 });
  const present = MANIFESTS.filter((file) => files.includes(file));
  const info = { language: detectLanguage(files), manifests: present, packageManager: "", framework: "", scripts: {}, tests: [] };
  if (files.includes("package.json")) Object.assign(info, packageInfo(await filesystem.read("package.json")));
  if (files.includes("pnpm-lock.yaml")) info.packageManager = "pnpm";
  else if (files.includes("yarn.lock")) info.packageManager = "yarn";
  else if (files.includes("package-lock.json") && !info.packageManager) info.packageManager = "npm";
  else if (files.includes("pyproject.toml")) info.packageManager = "pip/pyproject";
  else if (files.includes("Cargo.toml")) info.packageManager = "cargo";
  else if (files.includes("go.mod")) info.packageManager = "go";
  info.tests = files
    .filter((file) => /(^|\/)(test|tests|__tests__)\//i.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(file))
    .slice(0, 40);
  info.instructions = await loadAgentsMarkdown(".");
  for (const file of INSTRUCTION_FILES) {
    if (file.toLowerCase() === "agents.md") continue;
    if (await exists(file)) {
      info.instructions.push({ scope: "project", file, content: filesystem.clip(await filesystem.read(file), 6000) });
    }
  }
  return info;
}

module.exports = {
  inspect,
  detectLanguage,
  packageInfo,
  loadAgentsMarkdown,
  readIfPresent,
  MANIFESTS,
  INSTRUCTION_FILES
};
