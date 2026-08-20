function extractJson(input) {
  if (!input) return null;
  const text = String(input).trim();
  const candidates = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  candidates.push(text);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}
    for (let start = candidate.indexOf("{"); start >= 0; start = candidate.indexOf("{", start + 1)) {
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let i = start; i < candidate.length; i++) {
        const c = candidate[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (c === "\\" && quoted) {
          escaped = true;
          continue;
        }
        if (c === '"') {
          quoted = !quoted;
          continue;
        }
        if (quoted) continue;
        if (c === "{") depth++;
        if (c === "}" && --depth === 0) {
          try {
            const parsed = JSON.parse(candidate.slice(start, i + 1));
            if (parsed.tool || parsed.action || parsed.plan || parsed.steps || parsed.summary) return parsed;
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
    const value = message.content.map((x) => (typeof x === "string" ? x : x?.text || x?.content || "")).join("");
    if (value.trim()) return value.trim();
  }
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  if (Array.isArray(data?.output)) {
    const value = data.output
      .flatMap((x) => x?.content || [])
      .map((x) => x?.text || x?.content || "")
      .join("");
    if (value.trim()) return value.trim();
  }
  if (typeof message?.reasoning === "string") {
    const json = extractJson(message.reasoning);
    if (json) return JSON.stringify(json);
  }
  return "";
}

function toolCallsOf(data) {
  const message = data?.choices?.[0]?.message;
  const calls = message?.tool_calls || data?.choices?.[0]?.delta?.tool_calls || [];
  if (!Array.isArray(calls)) return [];
  return calls
    .map((call) => ({
      name: call.function?.name || call.name,
      arguments: (() => {
        const raw = call.function?.arguments || call.arguments || "{}";
        if (typeof raw === "object") return raw;
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
      })()
    }))
    .filter((call) => call.name);
}

function countTokens(text) {
  return Math.ceil(String(text ?? "").length / 4);
}

function countMessages(messages) {
  return (messages || []).reduce((sum, msg) => sum + countTokens(msg.content || JSON.stringify(msg)), 0);
}

module.exports = { extractJson, textOf, toolCallsOf, countTokens, countMessages };
