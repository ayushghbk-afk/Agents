# Termux Agent V6 — Token Usage & Tool-Calling Fix Report

## 1. Problem

The agent was repeatedly failing against the Groq proxy with errors such as:

```
AI HTTP 413
Request too large for model `openai/gpt-oss-20b`
TPM Limit: 8000
Requested: 8993
```

and:

```
AI HTTP 400
Tool choice is none, but model called a tool
```

These were two related but separate problems.

---

## 2. Root Causes

### A. Requests were exceeding the proxy's TPM limit

The proxy/Groq organization has an approximately:

```
TPM limit = 8000
```

but V6 was sometimes producing requests around:

```
8500–9000+ tokens
```

The request contains more than just the user's message:

- System prompt
- Tool catalog
- Project context
- Current task
- Plan
- Previous actions
- Tool results
- Conversation history
- Requested output

Therefore, even a short user request can eventually produce a very large request.

---

### B. V6 explicitly disabled tool calling

The existing `src/providers/openai.js` contained:

```js
if (tools?.length) body.tools = tools;
else body.tool_choice = "none";
```

This meant that when V6 didn't pass tools to the provider, the API request explicitly said:

```json
{
  "tool_choice": "none"
}
```

But V6's agent protocol requires the model to call tools such as:

- `read_file`
- `search_files`
- `run_shell`
- `write_file`
- `edit_file`
- `done`

Therefore Groq could return:

```
Tool choice is none, but model called a tool
```

The agent was effectively saying:

> "Don't call tools."

while simultaneously expecting:

> "Please call a tool."

---

## 3. Runtime Fix Applied

The `think()` function in:

```
src/agent/runtime.js
```

was changed.

### Previous behavior

The agent created:

```js
const options = {
  provider,
  messages: compacted
};
```

So the provider received no OpenAI-compatible tool definitions.

### New behavior

The function now creates:

```js
async function think(messages, provider, policy = {}) {
  const compacted = context.enforceBudget(messages);

  const options = {
    provider,
    messages: compacted,
    tools: tools.openaiTools()
  };

  if (policy.temperature != null) {
    options.temperature = policy.temperature;
  }

  if (policy.maxOutputTokens != null) {
    options.maxTokens = policy.maxOutputTokens;
  }

  const completion = await providers.complete(options);

  return { compacted, completion };
}
```

### Why this matters

Now the request contains the available tools:

```js
tools: tools.openaiTools()
```

which causes `src/providers/openai.js` to execute:

```js
if (tools?.length) body.tools = tools;
```

instead of:

```js
body.tool_choice = "none";
```

Therefore the API can legitimately return tool calls.

---

## 4. Expected Request Flow

The corrected flow is now:

```
User
 ↓
Termux Agent V6
 ↓
runtime.think()
 ↓
context.enforceBudget()
 ↓
tools.openaiTools()
 ↓
providers.complete()
 ↓
OpenAI-compatible API
 ↓
Groq Proxy
 ↓
Groq
 ↓
Model
 ↓
Tool call / JSON action
 ↓
V6 executor
 ↓
Tool result
 ↓
Next agent step
```

---

## 5. Token Problem Still Needs Fixing

The tool-calling fix does not automatically solve the 8k TPM problem.

The agent can still produce:

```
Requested 8993
Limit 8000
```

Therefore V6 needs stronger token management.

Recommended initial settings:

```
CONTEXT_WINDOW=4000
TOKEN_BUDGET=3500
MAX_OUTPUT_TOKENS=1000
```

For Fast mode:

```
maxOutputTokens: 1000
```

instead of:

```
maxOutputTokens: 2048
```

This gives the agent substantially more room under the proxy's 8k TPM ceiling.

---

## 6. Proxy Key Rotation Problem

The proxy currently has multiple API keys.

The error showed:

```
key_count: 4
```

However, a 413 Request Too Large is not a key-specific rate-limit problem.

For example:

```
Key 1 → 413
Key 2 → 413
Key 3 → 413
Key 4 → 413
```

doesn't help.

The request itself is too large.

The proxy should ideally handle errors differently:

| Error | Meaning | Action |
| --- | --- | --- |
| 429 | Rate limited | Rotate key / wait |
| 413 | Request too large | Compact request |
| 500 | Server failure | Retry |
| 502 | Gateway failure | Retry |
| 503 | Provider unavailable | Rotate/retry |
| 400 tool_choice | Invalid request | Fix request construction |

This is an important improvement for your proxy.

---

## 7. Recommended V6 Architecture

The agent should progressively load context instead of sending everything repeatedly.

### Current risk

```
SYSTEM PROMPT
+ TOOL CATALOG
+ PROJECT CONTEXT
+ PLAN
+ HISTORY
+ TOOL OUTPUT
+ HISTORY
+ TOOL OUTPUT
+ ...
```

### Better architecture

```
User request
     ↓
Small project summary
     ↓
Plan
     ↓
Read only relevant file
     ↓
Small tool result
     ↓
Edit
     ↓
Focused test
     ↓
Done
```

This makes V6 behave much more like a modern coding agent.

---

## 8. Verification

After applying your `runtime.js` change, run:

```bash
cd ~/Agents
node --check src/agent/runtime.js
node --check src/providers/openai.js
npm test
npm start
```

You should not type JavaScript statements such as:

```js
const options = ...
```

directly into Termux.

Those belong inside the `.js` files.

---

## 9. Important Safety Check

Before testing the agent, verify the actual modified section:

```bash
sed -n '45,85p' src/agent/runtime.js
```

It should contain:

```js
async function think(messages, provider, policy = {}) {
  const compacted = context.enforceBudget(messages);
  const options = {
    provider,
    messages: compacted,
    tools: tools.openaiTools()
  };

  if (policy.temperature != null) {
    options.temperature = policy.temperature;
  }

  if (policy.maxOutputTokens != null) {
    options.maxTokens = policy.maxOutputTokens;
  }

  const completion = await providers.complete(options);
  return { compacted, completion };
}
```

---

## 10. Final Status

### Fixed

- ✅ Agent/provider tool mismatch identified
- ✅ `tools.openaiTools()` added to `runtime.think()`
- ✅ Prevents V6 from unnecessarily sending `tool_choice: "none"`
- ✅ Allows model tool calls through the OpenAI-compatible API
- ✅ Existing temperature configuration preserved
- ✅ Existing max-output configuration preserved
- ✅ Existing context-budget enforcement preserved

### Still needs improvement

- ⚠️ Request size can still exceed 8k TPM
- ⚠️ Tool outputs should be aggressively compressed
- ⚠️ Conversation history needs better pruning
- ⚠️ Project context should be loaded selectively
- ⚠️ Proxy should treat 413 differently from 429
- ⚠️ Model fallback should not blindly retry oversized requests
- ⚠️ Fast mode should use a smaller output budget

### Target

The goal should be to keep normal V6 requests around:

```
Input context: ~2,500–4,000 tokens
Output: ~500–1,000 tokens
Total: comfortably below 8,000 TPM
```

That will make your 4-key proxy much more reliable, instead of repeatedly getting `413 → 413 → 413 → 413 → 503`.

---

## Appendix — Implementation Status in This Repository

Status as of 2026-08-22, tracked alongside the report.

### Applied in this repo

- `src/agent/runtime.js` — `think()` now sends `tools: tools.openaiTools()` (§3, §9). The provider therefore receives tool definitions and the OpenAI-compatible path sets `body.tools` instead of `body.tool_choice = "none"`.
- `src/modes/index.js` — Fast mode `maxOutputTokens` lowered from `2048` to `1000` (§5). This is required for the §5 recommendation to take effect, because mode policies override `MAX_OUTPUT_TOKENS` from `.env`. (This crosses off the last ⚠️ item in §10.)
- `.env.example` — ships the recommended initial settings `CONTEXT_WINDOW=4000`, `TOKEN_BUDGET=3500`, `MAX_OUTPUT_TOKENS=1000` with a comment explaining the ~8000 TPM ceiling (§5).
- `test/agent/runtime.test.js` — added a regression test asserting the runtime passes OpenAI tool definitions to the provider.

### Still open (documented in §5–§7, §10)

- Aggressive tool-output compression and conversation-history pruning (`src/context`).
- Selective / progressive project-context loading instead of full context every step.
- Treating 413 as a request-size problem (compact the request) rather than retrying an oversized body — affects both the agent retry loop and the proxy.
- Proxy-side 413-vs-429 handling and `key_count` rotation behavior (lives in the Cloudflare Worker proxy, outside this repo).

### Verify

```bash
node --check src/agent/runtime.js
node --check src/providers/openai.js
node --check src/modes/index.js
npm test
```
