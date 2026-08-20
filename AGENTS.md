# Termux Agent

This repository is the agent itself, not a typical application workspace.

- Keep the runtime loop in `src/agent/runtime.js`.
- Do not collapse providers, tools, memory, or CLI back into a single file.
- Prefer precise patches and Node's built-in test runner (`node --test`).
- Never weaken sandbox tests to make a change look safe.
