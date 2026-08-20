const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const openai = require("../../src/providers/openai");
const providers = require("../../src/providers");

test("provider failures retry then succeed", async () => {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits += 1;
    if (hits === 1) {
      res.writeHead(500);
      res.end("temporary");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"tool":"done","args":{"summary":"ok"}}' } }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const result = await openai.complete({
      messages: [{ role: "user", content: "hi" }],
      apiUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: "",
      retries: 2,
      timeoutMs: 3000
    });
    assert.match(result.text, /done/);
    assert.ok(hits >= 2);
  } finally {
    server.close();
  }
});

test("model aliases resolve without changing agent code", () => {
  const groq = providers.resolveModel("llama-3.3-70b");
  assert.equal(groq.provider, "groq");
  const gemini = providers.resolveModel("gemini-2.0-flash");
  assert.equal(gemini.provider, "gemini");
});
