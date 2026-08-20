const providers = require("../providers");
const { extractJson } = require("../providers/parse");

function heuristicPlan(goal, profile = {}) {
  const tests = profile.scripts?.test ? "Run project tests" : "Run the strongest available verification";
  return {
    steps: [
      { id: 1, title: "Inspect project structure and relevant files" },
      { id: 2, title: `Understand request: ${String(goal).slice(0, 120)}` },
      { id: 3, title: "Identify files and symbols to change" },
      { id: 4, title: "Implement the minimal complete change" },
      { id: 5, title: tests },
      { id: 6, title: "Diagnose and repair failures if needed" },
      { id: 7, title: "Review diff and summarize" }
    ],
    source: "heuristic"
  };
}

async function generate({ goal, profile, provider, mode = "normal" } = {}) {
  const fallback = heuristicPlan(goal, profile);
  if (!provider && !providers) return fallback;
  try {
    const result = await providers.complete({
      provider,
      messages: [
        {
          role: "system",
          content:
            "Return exactly one JSON object: {\"steps\":[{\"id\":1,\"title\":\"...\"}],\"notes\":\"optional\"}. No markdown. Plan a software engineering task."
        },
        {
          role: "user",
          content: `MODE: ${mode}\nTASK: ${goal}\nPROFILE: ${JSON.stringify({ language: profile?.language, scripts: profile?.scripts, tests: profile?.tests?.slice?.(0, 10) })}`
        }
      ]
    });
    const parsed = extractJson(result.text);
    if (parsed?.steps?.length) return { steps: parsed.steps, notes: parsed.notes || "", source: "model" };
  } catch {}
  return fallback;
}

function format(plan) {
  return (plan?.steps || []).map((step, i) => `${step.id || i + 1}. ${step.title || step}`).join("\n");
}

module.exports = { generate, heuristicPlan, format };
