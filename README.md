# Termux Agent v4

Codex-style autonomous coding agent for Termux.

Features:
- adaptive OpenAI-compatible proxy parsing
- structured coding tools
- patch-first editing
- autonomous test/fix loop
- Git checkpoints
- persistent `.agent/memory.json`
- workspace sandboxing
- command safety controls

Install under `$HOME` rather than shared Android storage.

```bash
pkg update
pkg install nodejs git python unzip -y
mkdir -p ~/agents
cd ~/agents
unzip ~/storage/downloads/termux-agent-v4.zip
cd termux-agent-v4
cp .env.example .env
nano .env
npm install
npm start
```

Commands:
`/help` `/status` `/inspect` `/plan TASK` `/task TASK` `/history` `/reset` `/checkpoint` `/rollback` `/quit`

Set `WORKSPACE` to the project the agent should control.
