const { execSync } = require("child_process");
const fs = require("fs");
const config = require("./config");
console.log("Termux Agent v5 doctor");
console.log("Node:", process.version);
console.log("Workspace:", config.workspace, fs.existsSync(config.workspace) ? "✓" : "MISSING");
console.log("Proxy:", config.aiProxyUrl);
console.log("Model:", config.aiModel);
for (const command of ["git --version", "python --version", "npm --version"]) {
  try { console.log(`${command}:`, execSync(command, { encoding: "utf8" }).trim()); }
  catch { console.log(`${command}: unavailable`); }
}
console.log("Network:", config.allowNetwork, "Checkpoints:", config.checkpoints, "AI retries:", config.aiRetries);
if (!config.aiApiKey) console.log("Note: AI_API_KEY is empty (valid only if your endpoint does not require one).");
