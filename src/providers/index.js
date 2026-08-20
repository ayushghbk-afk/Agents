const config = require("../config");
const openai = require("./openai");
const groq = require("./groq");
const gemini = require("./gemini");
const custom = require("./custom");
const local = require("./local");
const parse = require("./parse");

const IMPLEMENTATIONS = { openai, groq, gemini, custom, local };

const ALIASES = {
  "gpt-4o": { provider: "openai", model: "gpt-4o" },
  "gpt-4o-mini": { provider: "openai", model: "gpt-4o-mini" },
  "gpt-4.1": { provider: "openai", model: "gpt-4.1" },
  "gpt-oss-120b": { provider: "custom", model: "openai/gpt-oss-120b" },
  "openai/gpt-oss-120b": { provider: "custom", model: "openai/gpt-oss-120b" },
  "llama-3.3-70b": { provider: "groq", model: "llama-3.3-70b-versatile" },
  "llama-3.1-8b": { provider: "groq", model: "llama-3.1-8b-instant" },
  "gemini-2.0-flash": { provider: "gemini", model: "gemini-2.0-flash" },
  "gemini-1.5-flash": { provider: "gemini", model: "gemini-1.5-flash" },
  local: { provider: "local", model: "llama3.2" }
};

function resolveModel(spec = config.model, providerName = config.provider) {
  const alias = ALIASES[spec];
  if (alias) return { provider: providerName && providerName !== "custom" ? providerName : alias.provider, model: alias.model };
  return { provider: providerName || "custom", model: spec };
}

function implementation(name) {
  return IMPLEMENTATIONS[name] || IMPLEMENTATIONS.custom;
}

function fallbackChain(primary) {
  const chain = [primary];
  for (const spec of config.fallbackModels) {
    const resolved = resolveModel(spec, config.provider);
    chain.push(resolved);
  }
  return chain;
}

async function complete(options = {}) {
  if (options.provider?.complete) return options.provider.complete(options);
  const resolved = resolveModel(options.model || config.model, options.providerName || config.provider);
  const chain = fallbackChain(resolved);
  let last;
  for (const entry of chain) {
    try {
      return await implementation(entry.provider).complete({ ...options, model: entry.model });
    } catch (error) {
      last = error;
    }
  }
  throw last || new Error("All providers failed");
}

async function ask(messages, options = {}) {
  const result = await complete({ ...options, messages });
  return result.text;
}

module.exports = {
  complete,
  ask,
  resolveModel,
  ALIASES,
  extractJson: parse.extractJson,
  textOf: parse.textOf,
  countTokens: parse.countTokens,
  countMessages: parse.countMessages,
  openai,
  groq,
  gemini,
  custom,
  local
};
