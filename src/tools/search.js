const fs = require("fs/promises");
const config = require("../config");
const sandbox = require("../sandbox");
const filesystem = require("./filesystem");

const searchCache = new Map();

async function search(pattern, options = {}) {
  let regex;
  try {
    regex = new RegExp(pattern, options.caseSensitive ? "" : "i");
  } catch (e) {
    throw new Error(`Invalid search pattern: ${e.message}`);
  }
  const key = `${pattern}|${options.path || ""}|${options.limit || ""}|${options.depth || ""}`;
  if (searchCache.has(key)) return searchCache.get(key);
  const hits = [];
  const limit = Math.min(500, Number(options.limit) || 150);
  for (const relative of await filesystem.tree({ depth: options.depth || 8, maxEntries: 2000 })) {
    if (relative.endsWith("/")) continue;
    if (options.path && !relative.includes(options.path)) continue;
    if (sandbox.isProtected(relative)) continue;
    try {
      const file = await sandbox.resolve(relative);
      const stat = await fs.stat(file);
      if (stat.size > config.maxFileBytes) continue;
      const lines = (await fs.readFile(file, "utf8")).split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          hits.push(`${relative}:${i + 1}: ${lines[i].slice(0, 500)}`);
          if (hits.length >= limit) {
            searchCache.set(key, hits);
            return hits;
          }
        }
      }
    } catch {}
  }
  searchCache.set(key, hits);
  return hits;
}

function symbolsIn(content, relative) {
  const found = [];
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/g,
    /(?:export\s+)?class\s+([A-Za-z0-9_]+)/g,
    /(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/g,
    /^\s*def\s+([A-Za-z0-9_]+)/gm,
    /^\s*(?:pub\s+)?fn\s+([A-Za-z0-9_]+)/gm
  ];
  for (const regex of patterns) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content))) found.push({ name: match[1], file: relative, index: match.index });
  }
  return found;
}

async function findSymbols(query, options = {}) {
  const needle = String(query || "").toLowerCase();
  const hits = [];
  for (const relative of await filesystem.tree({ depth: options.depth || 8, maxEntries: 1500 })) {
    if (relative.endsWith("/")) continue;
    if (!/\.(js|cjs|mjs|ts|tsx|py|rs|go|java)$/i.test(relative)) continue;
    try {
      const content = await filesystem.read(relative);
      for (const symbol of symbolsIn(content, relative)) {
        if (!needle || symbol.name.toLowerCase().includes(needle)) {
          hits.push(symbol);
          if (hits.length >= (options.limit || 80)) return hits;
        }
      }
    } catch {}
  }
  return hits;
}

function clearCache() {
  searchCache.clear();
}

module.exports = { search, findSymbols, symbolsIn, clearCache };
