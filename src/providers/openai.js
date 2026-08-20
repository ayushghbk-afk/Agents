const config = require("../config");
const { textOf, toolCallsOf, countTokens } = require("./parse");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function headers(apiKey = config.apiKey) {
  const value = { "Content-Type": "application/json" };
  if (apiKey) value.Authorization = `Bearer ${apiKey}`;
  return value;
}

function completionUrls(base) {
  const cleaned = String(base || "").replace(/\/+$/, "");
  if (!cleaned) return [];
  if (cleaned.endsWith("/chat/completions")) return [cleaned];
  if (cleaned.endsWith("/v1")) return [`${cleaned}/chat/completions`];
  return [`${cleaned}/chat/completions`, `${cleaned}/v1/chat/completions`];
}

async function complete({
  messages,
  model = config.model,
  apiUrl = config.apiUrl,
  apiKey = config.apiKey,
  tools,
  temperature = config.temperature,
  maxTokens = config.maxOutputTokens,
  retries = config.aiRetries,
  timeoutMs = config.requestTimeoutMs,
  onDelta
} = {}) {
  const urls = completionUrls(apiUrl);
  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  };
  if (tools?.length) body.tools = tools;
  else body.tool_choice = "none";
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const url of urls) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: headers(apiKey),
          signal: controller.signal,
          body: JSON.stringify(body)
        });
        const raw = await response.text();
        if (!response.ok) {
          last = new Error(`AI HTTP ${response.status}: ${raw.slice(0, 1000)}`);
          if (response.status < 500 && response.status !== 429) continue;
        } else {
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            throw new Error(`AI returned invalid JSON: ${raw.slice(0, 1000)}`);
          }
          const text = textOf(data);
          const toolCalls = toolCallsOf(data);
          if (text || toolCalls.length) {
            if (onDelta && text) onDelta(text);
            const usage = data.usage || {};
            return {
              text,
              toolCalls,
              usage: {
                prompt: usage.prompt_tokens || countTokens(JSON.stringify(messages)),
                completion: usage.completion_tokens || countTokens(text)
              },
              raw: data
            };
          }
          last = new Error(`AI returned no usable text: ${JSON.stringify(data).slice(0, 1500)}`);
        }
      } catch (e) {
        last = e.name === "AbortError" ? new Error("AI request timed out") : e;
      } finally {
        clearTimeout(timer);
      }
    }
    if (attempt < retries) await wait(Math.min(8000, 500 * 2 ** attempt));
  }
  throw last || new Error("AI request failed");
}

module.exports = { complete, completionUrls, headers };
