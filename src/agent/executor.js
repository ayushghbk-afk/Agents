const tools = require("../tools");
const path = require("path");

async function execute(action, ctx = {}) {
  const validated = tools.validate(action);
  const result = await tools.call(validated, ctx);
  if (result.ok && tools.fileChanging(validated.tool) && ctx.task) {
    const file = validated.args.path;
    if (file && !ctx.task.changedFiles.includes(file)) ctx.task.changedFiles.push(path.normalize(file));
  }
  ctx.task?.toolHistory.push({
    tool: validated.tool,
    args: validated.args,
    ok: result.ok,
    error: result.error || null,
    durationMs: result.durationMs,
    time: new Date().toISOString()
  });
  if (!result.ok) ctx.task?.errorHistory.push({ tool: validated.tool, error: result.error, time: new Date().toISOString() });
  return { action: validated, ...result };
}

module.exports = { execute };
