const config = require("./config");

function extractJson(input) {
  if (!input) return null;
  const text = String(input).trim();
  const candidates = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  candidates.push(text);
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch {}
    for (let start = candidate.indexOf("{"); start >= 0; start = candidate.indexOf("{", start + 1)) {
      let depth = 0, quoted = false, escaped = false;
      for (let i = start; i < candidate.length; i++) {
        const c = candidate[i];
        if (escaped) { escaped = false; continue; }
        if (c === "\\" && quoted) { escaped = true; continue; }
        if (c === '"') { quoted = !quoted; continue; }
        if (quoted) continue;
        if (c === "{") depth++;
        if (c === "}" && --depth === 0) {
          try {
            const parsed = JSON.parse(candidate.slice(start, i + 1));
            if (parsed.tool || parsed.action) return parsed;
          } catch {}
          break;
        }
      }
    }
  }
  return null;
}
function textOf(data) {
  const message = data?.choices?.[0]?.message;
  if (typeof message?.content === "string" && message.content.trim()) return message.content.trim();
  if (Array.isArray(message?.content)) {
    const value = message.content.map(x => typeof x === "string" ? x : (x?.text || x?.content || "")).join("");
    if (value.trim()) return value.trim();
  }
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  if (Array.isArray(data?.output)) {
    const value = data.output.flatMap(x => x?.content || []).map(x => x?.text || x?.content || "").join("");
    if (value.trim()) return value.trim();
  }
  if (typeof message?.reasoning === "string") {
    const json = extractJson(message.reasoning);
    if (json) return JSON.stringify(json);
  }
  return "";
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ask(messages) {
  const base = config.aiProxyUrl.replace(/\/+$/, "");
  const urls = base.endsWith("/v1") ? [`${base}/chat/completions`] : [`${base}/chat/completions`, `${base}/v1/chat/completions`];
  const headers = { "Content-Type": "application/json" };
  if (config.aiApiKey) headers.Authorization = `Bearer ${config.aiApiKey}`;
  let last;
  for (let attempt = 0; attempt <= config.aiRetries; attempt++) {
    for (const url of urls) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      try {
        const response = await fetch(url, {
          method: "POST", headers, signal: controller.signal,
          body: JSON.stringify({ model: config.aiModel, messages, temperature: config.temperature, max_tokens: config.maxOutputTokens, tool_choice: "none" })
        });
        const raw = await response.text();
        if (!response.ok) {
          last = new Error(`AI HTTP ${response.status}: ${raw.slice(0, 1000)}`);
          if (response.status < 500 && response.status !== 429) continue;
        } else {
          let data;
          try { data = JSON.parse(raw); } catch { throw new Error(`AI returned invalid JSON: ${raw.slice(0, 1000)}`); }
          const result = textOf(data);
          if (result) return result;
          last = new Error(`AI returned no usable text: ${JSON.stringify(data).slice(0, 1500)}`);
        }
      } catch (e) { last = e.name === "AbortError" ? new Error("AI request timed out") : e; }
      finally { clearTimeout(timer); }
    }
    if (attempt < config.aiRetries) await wait(Math.min(8000, 500 * (2 ** attempt)));
  }
  throw last || new Error("AI request failed");
}
module.exports = { ask, extractJson, textOf };
