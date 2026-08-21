const { execSync } = require("child_process");
const fs = require("fs");
const config = require("./config");

try {
  const args = config.parseArgs(process.argv.slice(2));
  if (args.workspace) config.applyWorkspace(args.workspace, { mustExist: true });
  if (args.mode) config.override({ mode: args.mode });
} catch (error) {
  console.error("ERROR:", error.message);
  process.exit(1);
}

console.log("Termux Agent v6 doctor");
console.log("Node:", process.version);
console.log("Workspace:", config.workspace, fs.existsSync(config.workspace) ? "✓" : "MISSING");
console.log("Provider:", config.provider);
console.log("Endpoint:", config.apiUrl);
console.log("Model:", config.model);
console.log("Mode:", config.mode);
for (const command of ["git --version", "python --version", "npm --version"]) {
  try {
    console.log(`${command}:`, execSync(command, { encoding: "utf8" }).trim());
  } catch {
    console.log(`${command}: unavailable`);
  }
}
console.log(
  "Network:",
  config.allowNetwork,
  "Checkpoints:",
  config.checkpoints,
  "AI retries:",
  config.aiRetries,
  "Token budget:",
  config.tokenBudget
);
if (!config.apiKey) console.log("Note: AI_API_KEY is empty (valid only if your endpoint does not require one).");
