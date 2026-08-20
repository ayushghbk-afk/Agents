const testing = require("../tools/testing");
const config = require("../config");

function shouldRepair(verification) {
  if (!verification) return false;
  if (verification.attempts >= config.maxRepairAttempts) return false;
  return verification.results.some((item) => item.kind === "test" && item.ok === false);
}

async function run(task) {
  const results = [];
  const test = await testing.run("test");
  results.push({
    kind: "test",
    ok: test.skipped || test.code === 0,
    skipped: Boolean(test.skipped),
    command: test.command || null,
    failures: test.skipped ? [] : testing.extractFailures(test),
    output: test
  });
  const lint = await testing.run("lint");
  if (!lint.skipped) {
    results.push({ kind: "lint", ok: lint.code === 0, command: lint.command, output: lint });
  }
  task.verification = {
    status: results.every((item) => item.ok) ? "passed" : "failed",
    results,
    attempts: (task.verification?.attempts || 0) + (results.some((item) => item.kind === "test" && !item.ok && !item.skipped) ? 1 : 0)
  };
  return task.verification;
}

function qualityGate(task) {
  return task.changedFiles.length > 0 && !task.toolHistory.some((item) => ["run_test", "run_lint", "run_build", "run_shell", "exec"].includes(item.tool) && item.ok);
}

module.exports = { run, shouldRepair, qualityGate };
