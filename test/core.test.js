const test = require("node:test");
const assert = require("node:assert/strict");
const { extractJson, textOf } = require("../src/ai");
const { normalize, ranked } = require("../src/memory");
const { validate, trimMessages } = require("../src/agent");
const { commandRisk, safe } = require("../src/tools");
const { detectLanguage, packageInfo } = require("../src/project");

test("extractJson accepts clean, fenced, and surrounded tool actions", () => {
  assert.equal(extractJson('{"tool":"tree","args":{}}').tool, "tree");
  assert.equal(extractJson('```json\n{"tool":"read","args":{"path":"a"}}\n```').tool, "read");
  assert.equal(extractJson('thinking... {"tool":"done","args":{"summary":"ok"}} trailing').tool, "done");
});

test("textOf handles OpenAI compatible response shapes", () => {
  assert.equal(textOf({ choices: [{ message: { content: " hello " } }] }), "hello");
  assert.equal(textOf({ output_text: "done" }), "done");
});

test("legacy memory migrates to versioned structure", () => {
  const value = normalize({ project: "A CLI", facts: ["uses node"], tasks: [] });
  assert.equal(value.version, 3);
  assert.equal(value.project.summary, "A CLI");
  assert.deepEqual(value.facts, ["uses node"]);
  assert.match(normalize({ facts: ["token=super-secret-value"] }).facts[0], /REDACTED/);
});

test("memory ranking prefers query overlap", () => {
  const result = ranked([{ text: "uses Python pytest" }, { text: "uses Node and npm test" }], "node test", 1);
  assert.match(result[0].text, /Node/);
});

test("action validation enforces required arguments", () => {
  assert.equal(validate({ action: "tree" }).tool, "tree");
  assert.throws(() => validate({ tool: "read", args: {} }), /args.path/);
  assert.throws(() => validate({ tool: "invent", args: {} }), /Unknown tool/);
});

test("conversation trimming retains system, task, and recent transcript", () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({ role: i ? "user" : "system", content: String(i) }));
  const trimmed = trimMessages(messages);
  assert.equal(trimmed[0].content, "0");
  assert.equal(trimmed[1].content, "1");
  assert.equal(trimmed.at(-1).content, "19");
});

test("command risk blocks catastrophic and gates risky/network commands", () => {
  assert.equal(commandRisk("rm -rf /"), "blocked");
  assert.equal(commandRisk("rm temp.txt"), "risky");
  assert.equal(commandRisk("npm test"), "safe");
  assert.equal(commandRisk("curl https://example.com"), "network-blocked");
});

test("safe path rejects workspace escapes", () => {
  assert.throws(() => safe("../../etc/passwd"), /escapes workspace/);
  assert.doesNotThrow(() => safe("src/agent.js"));
});

test("project inspection helpers identify Node projects and scripts", () => {
  assert.equal(detectLanguage(["package.json", "src/index.ts"]), "JavaScript/TypeScript");
  const info = packageInfo('{"name":"demo","scripts":{"test":"node --test"},"dependencies":{"next":"1"}}');
  assert.equal(info.packageManager, "npm");
  assert.equal(info.framework, "next");
  assert.equal(info.scripts.test, "node --test");
});

test("new tool actions validate their arguments", () => {
  assert.equal(validate({ tool: "inspect_project" }).tool, "inspect_project");
  assert.equal(validate({ tool: "mkdir", args: { path: "tmp" } }).tool, "mkdir");
  assert.throws(() => validate({ tool: "progress", args: { phase: "test" } }), /args.message/);
  assert.equal(validate({ tool: "read_file", args: { path: "a.js" } }).tool, "read_file");
});
