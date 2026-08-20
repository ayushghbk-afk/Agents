const config = require("../config");
const { countTokens } = require("./parse");

function toGemini(messages) {
  let system = "";
  const contents = [];
  for (const message of messages || []) {
    if (message.role === "system") {
      system += (system ? "\n" : "") + message.content;
      continue;
    }
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content || "") }]
    });
  }
  return { system, contents };
}

async function complete({
  messages,
  model = config.model,
  apiKey = config.apiKey,
  temperature = config.temperature,
  maxTokens = config.maxOutputTokens,
  timeoutMs = config.requestTimeoutMs
} = {}) {
  if (!apiKey) throw new Error("Gemini provider requires AI_API_KEY");
  const { system, contents } = toGemini(messages);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${raw.slice(0, 1000)}`);
    const data = JSON.parse(raw);
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    if (!text) throw new Error("Gemini returned no text");
    return { text, toolCalls: [], usage: { prompt: countTokens(JSON.stringify(messages)), completion: countTokens(text) }, raw: data };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { complete, toGemini };
