# Termux Agent v5

A memory-first autonomous coding agent for Termux, built around any OpenAI-compatible chat endpoint.

## What makes v5 stronger

- **Durable, relevant memory** — versioned project profile, facts, decisions, notes, task outcomes, keyword-ranked recall, deduplication, bounded compaction, legacy migration, and atomic private writes.
- **A disciplined engineering loop** — inspect → implement → verify → diagnose → finish, with a quality gate that catches untested edits.
- **Long-task resilience** — bounded transcript compaction, repeated-action detection, protocol repair, up to 200 configurable steps, request timeout, and exponential AI retries.
- **Better tools** — ranged file reads, deep tree inspection, scoped search, file metadata, project detection, AGENTS.md-aware context, precise patches, automatic pre-edit backups, bounded outputs, process-group timeouts, and read-only Git inspection.
- **Real safety boundaries** — workspace path sandboxing, network policy, catastrophic command blocking, confirmation for risky commands, secret-aware instructions, and plan-only enforcement.
- **Non-destructive checkpoints** — Git snapshots are recorded without committing, staging, or changing the worktree.
- **Honest completion reports** — summaries include actual verification evidence; task outcomes become future context.

## Install

Install under `$HOME`, not shared Android storage.

```bash
pkg update
pkg install nodejs git python unzip -y
mkdir -p ~/agents && cd ~/agents
unzip ~/storage/downloads/termux-agent-v5.zip
cd termux-agent-v5
cp .env.example .env
nano .env
npm install
npm test
npm run doctor
npm start
```

Set `WORKSPACE` in `.env` to the project the agent may control. Set your endpoint, model, and API key. Network and package-manager commands are denied unless `ALLOW_NETWORK=true`.

## Commands

```text
/help                 Show commands
/status               Runtime and memory status
/inspect              Print workspace tree
/plan TASK            Research and produce a read-only plan
/task TASK             Execute a task (plain text also works)
/auto TASK             Run the autonomous inspect → implement → verify → repair loop
/debug ISSUE           Reproduce, diagnose, fix, and regression-test an issue
/diff                  Show the current unstaged Git diff
/undo                  Apply the latest checkpoint after confirmation
/history               Show recent completed tasks
/memory [QUERY]        Show stats or query relevant memory
/remember KIND TEXT    Save a fact, decision, or note
/forget SCOPE          Clear one memory category or all memory
/checkpoint [LABEL]    Snapshot tracked Git state without a commit
/rollback              Restore the latest snapshot after confirmation
/quit                  Exit
```

## Memory model

Memory is stored at `WORKSPACE/.agent/memory.json` with owner-only permissions. It is intentionally bounded by `MEMORY_MAX_ITEMS`; recall selects items relevant to the current task rather than dumping the entire history into every prompt. The format automatically migrates the old v4 `{project, facts, tasks}` structure.

Never put passwords, API keys, tokens, or private user data in memory. Use `/forget all` to erase it.

## Configuration

See `.env.example`. Important controls include:

- `MAX_STEPS`, `CONVERSATION_WINDOW` — autonomy and context bounds
- `AI_RETRIES`, `REQUEST_TIMEOUT_MS` — endpoint resilience
- `MEMORY_MAX_ITEMS`, `MEMORY_RECALL_ITEMS` — memory depth and recall size
- `AUTO_APPROVE_SAFE` — whether harmless commands run without prompting
- `BACKUPS`, `MAX_BACKUPS` — retain private pre-edit file copies beneath `.agent/backups`
- `ALLOW_NETWORK` — permit network/package commands (they still require confirmation)
- `MAX_TOOL_OUTPUT`, `MAX_FILE_BYTES` — context and file safety limits
- `IGNORED_DIRS` — directories excluded from tree/search

## Checkpoint limits

Checkpoints use `git stash create`, which captures tracked Git state while leaving the index and worktree untouched. Untracked files are not captured. Rollback uses `git stash apply --index` and may report normal merge conflicts if the workspace diverged.
