# Termux Agent v6

A memory-first autonomous coding agent for Termux. The v6 core is a real engineering loop, not a chatbot wrapper:

```text
Plan → Tool → Observe → Verify → Repair → Repeat
```

Providers, tools, memory, task state, and the CLI are separate modules. Switching models does not require changing the agent.

## What v6 adds

- **Agent runtime** with structured task state (id, plan, tool history, verification, resume).
- **Provider abstraction** for OpenAI-compatible, Groq, Gemini, custom proxy, and local endpoints, plus aliases, fallback, retries, and token accounting.
- **First-class tools** (`read_file`, `patch_file`, `run_test`, `git_checkpoint`, …) with schema, risk, timeout, and sandboxing.
- **Context engine** that ranks relevant files/symbols and keeps prompts inside a token budget.
- **AGENTS.md layering** from `~/AGENTS.md` → project → directory.
- **Full-workspace checkpoints** that restore tracked Git state *and* untracked files.
- **Verification + repair** with a quality gate and a bounded retest loop.
- **Task persistence** so `/pause`, `/resume`, and `/cancel` survive a restart.

## Install

Install under `$HOME`, not shared Android storage.

```bash
pkg update
pkg install nodejs git python unzip -y
mkdir -p ~/agents && cd ~/agents
unzip ~/storage/downloads/termux-agent-v6.zip
cd termux-agent-v6
cp .env.example .env
nano .env
npm test
npm run doctor
npm start
```

Set `WORKSPACE` to the project the agent may control. Set provider, endpoint, model, and API key. Network and package-manager commands are denied unless `ALLOW_NETWORK=true`.

## Configuration

Priority: CLI → environment / `.env` → `WORKSPACE/.agents/config.json` → `~/.agents/config.json` → defaults.

```text
MODEL_PROVIDER=custom
MODEL=openai/gpt-oss-120b
API_URL=https://your-proxy.example/v1
```

Runtime data lives in the workspace:

```text
.agents/
├── config.json
├── memory/
├── tasks/
├── checkpoints/
└── backups/
```

Legacy v5 `WORKSPACE/.agent/memory.json` is migrated automatically.

## Commands

```text
/help                 Show commands
/status               Runtime and memory status
/model [NAME]         Show or set the session model
/config               Show non-secret configuration
/inspect              Print workspace tree
/plan TASK            Research and produce a read-only plan
/task TASK            Execute a task (plain text also works)
/tasks                List persisted tasks
/auto TASK            Autonomous inspect → implement → verify → repair
/debug ISSUE          Reproduce, diagnose, fix, and regression-test
/diff                 Show the current unstaged Git diff
/history              Show recent completed tasks
/memory [QUERY]       Show stats or query relevant memory
/remember KIND TEXT   Save a fact, decision, note, failure, or discovery
/forget SCOPE         Clear one memory category or all memory
/checkpoint [LABEL]   Snapshot workspace state without changing the worktree
/rollback             Restore the latest snapshot after confirmation
/resume [TASK_ID]     Resume a paused or interrupted task
/pause [TASK_ID]      Mark a task paused
/cancel [TASK_ID]     Cancel a task
/clear                Clear the terminal
/quit                 Exit
```

## Safety

Risk levels: **SAFE** (auto when `AUTO_APPROVE_SAFE=true`) · **APPROVAL REQUIRED** · **BLOCKED**.

The sandbox confines paths to `WORKSPACE`, blocks catastrophic commands, redacts secrets, refuses `.env` / key material, and strips API keys from child environments.

## Checkpoints

Git snapshots still use `git stash create` so the worktree is not touched at checkpoint time. v6 also copies untracked files and records a file inventory. Rollback restores tracked state, reapplies untracked files, and removes files created after the checkpoint.

## Tests

```bash
npm test
```
