# dispatch-bg

Dispatch a background Claude Code session (`claude --bg`) to the right repo and verify it actually landed — instead of trusting the `backgrounded · <id>` banner. Ships a skill (the discipline) and `bin/bg-dispatch` (dispatch + verify in one step).

## Why

The command is a one-liner. The failures are silent. A background session dispatched from the wrong current directory quietly does the wrong repo's work; a botched dispatch leaves a session sitting with no prompt; and the dispatch banner prints success for both. The banner then suggests `claude logs <id>` / `claude attach` / `claude stop` — none of which are real subcommands (verified on Claude Code 2.1.x). The CLI parses them as a fresh prompt, so `claude logs <id>` spins up a new session that answers the word "logs", which reads exactly like a broken agent. The only job subcommand is `claude agents`.

So the value isn't the dispatch. It's the two checks around it: dispatch into the right place, and confirm the session exists in the expected cwd before reporting it done. This plugin encodes both.

## Usage

```
/dispatch-bg
```

Or just ask to dispatch a background agent. The skill first steers the fork-vs-background choice (in-session subagents share your context and die with your session; background sessions start fresh, run independently, and outlive it — a different tool for a different job), then runs the disciplined dispatch:

```bash
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-dispatch --repo <dir> --name <name> --prompt-file <file>
# or pipe the prompt on stdin:
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-dispatch --repo <dir> --name <name> < prompt.md
# override the model (the bg dispatcher can ignore settings.json):
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-dispatch --repo <dir> --model <model> --prompt-file <file>
```

## What `bin/bg-dispatch` does

1. Reads the prompt from `--prompt-file` or stdin and refuses to dispatch an empty one (the session starts with fresh context, so the prompt is the entire handoff).
2. `cd`s into `--repo` explicitly and runs `claude --bg` there — never the caller's current directory.
3. Parses the session id and polls `claude agents --json --all` (the documented, TTY-free interface) until it appears.
4. Verifies `cwd` is the requested repo, an in-repo worktree (`<repo>/.claude/worktrees/*`), or a sibling worktree (`<repo>.<suffix>`) — agents fork into a worktree to work, so all three pass; anything else is a loud warning.
5. Prints a compact status and exits non-zero on a cwd mismatch (3) or a session that never registered (2), so a wrapper or a human notices.

It reads the documented `claude agents --json` interface, not the internal `~/.claude/jobs/<id>/state.json`, whose schema drifts between CLI versions.

## Requirements

- Claude Code with `claude` on `PATH` (job subcommand `claude agents`; verified on 2.1.x).
- `python3` on `PATH` (JSON parsing and the wait loop).

## Not this plugin

- **In-session subagents** — use the Agent tool / a fork; they share your context and report back automatically.
- **Scheduled or recurring agents** — use `/schedule` for cron-style runs.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install dispatch-bg@pandysp
```

## License

MIT
