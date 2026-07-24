---
name: dispatch-bg
description: Dispatch a background Claude Code session to a repo and verify it actually landed. Use when the user says "dispatch a background agent", "launch a bg agent", "run this in the background", "kick off a claude --bg session", or /dispatch-bg. Covers the fork-vs-background choice (subagents share your context and die with your session; background sessions start fresh, run independently, and outlive it), the dispatch discipline that otherwise fails silently (explicit cd into the target repo, a self-contained prompt passed via a file, name/model flags), and the load-bearing check — confirm the session exists in the expected cwd through `claude agents --json`, never the "backgrounded · <id>" banner or the non-existent `claude logs`/`attach`/`stop` subcommands. Not for in-session subagents (use the Agent tool) or scheduled routines (use /schedule).
---

# /dispatch-bg: launch a background agent and prove it landed

`claude --bg "<prompt>"` is the whole command. Everything that goes wrong is around it, and it goes wrong silently: the session dispatches into the wrong directory, or starts with no prompt, and the `backgrounded · <id>` banner reports success either way. So the skill is not the command. It is dispatching to the right place and confirming the session actually took the work before you report it done.

## First: is a background session even the right tool?

Three ways to run "another agent", and they are not interchangeable:

- **In-session subagent** (the Agent tool / a fork). Shares your context, runs as a child of your session, dies when your session ends, and reports back to you automatically. Use it for work scoped to *this* conversation.
- **Background session** (`claude --bg`). A fresh, independent Claude Code session with its own cwd. It survives your session ending, does **not** inherit your context, and does **not** push results back — you go look. Use it for repo-situated or long-running work that should outlive this turn.
- **Scheduled routine** (`/schedule`). A cron-style agent that runs later or on a recurring interval. Use it for "every morning" or "in an hour", not "now".

This skill is the middle one. If the work belongs to the current conversation, stop here and use the Agent tool instead.

## Dispatch

The bundled script does the dispatch and the verification in one step — prefer it:

```bash
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-dispatch --repo <dir> --name <name> --prompt-file <file>
# or pipe the prompt:  … --repo <dir> --name <name> < prompt.md
# override the model:  … --model <model>   (see Gotchas)
```

It exits non-zero and warns loudly if the session lands in the wrong cwd or never appears. If you dispatch by hand instead, hold the same three rules:

1. **`cd` into the target repo explicitly.** Never lean on your shell's current directory — it is not where you think it is, and a session dispatched from the wrong place does the wrong repo's work. `( cd <repo> && claude --bg … )`.
2. **Put a multi-line prompt in a file**, pass it as `"$(cat prompt.md)"`. Dodges shell-quoting, and forces you to write the prompt as a document.
3. **Make the prompt a self-contained handoff.** The session starts with *fresh context* — it knows nothing you know. Everything it needs (the goal, the repo state, the guardrails, where to write scratch, whether to open a PR) goes in the prompt or it is lost.

## Verify it landed — the load-bearing step

Do not report success off the `backgrounded · <id>` banner. And do not reach for `claude logs <id>`, `claude attach <id>`, or `claude stop <id>` from the dispatch banner — **those are not real subcommands** (verified on Claude Code 2.1.x). The CLI parses them as a fresh prompt, so `claude logs <id>` spins up a new session that answers the word "logs". The only job subcommand is `claude agents`.

Confirm three things through the documented, TTY-free interface:

```bash
claude agents --json --all | python3 -c "import json,sys; \
  j=[a for a in json.load(sys.stdin) if a['id']=='<id>']; print(j)"
```

- **It exists** — the id is in the list.
- **cwd is right** — the repo you asked for, or a worktree of it. Agents fork into `<repo>/.claude/worktrees/*` or a sibling `<repo>.<suffix>`, so all three count; anything else is a misfire.
- **It is progressing** — `status` is `busy`/`idle`/`done`, not absent.

`--json` alone lists only active sessions; `--all` includes completed ones. A job dropping from one view to the other is normal state-over-time, not a fault. (The internal `~/.claude/jobs/<id>/state.json` also records the prompt as `intent` — useful to confirm a prompt attached, but its schema is unstable, so treat it as a best-effort peek, not the source of truth.)

## Manage a running session

`claude --bg` sessions are daemon jobs, not children of your session, so an in-session stop tool cannot reach them. Manage them from the `claude agents` TUI (attach, reply, stop), or script status against `claude agents --json --all`.

## Gotchas

- **cwd drift** — the single most common misfire. Always `cd`; always verify.
- **Empty-prompt session** — a botched dispatch yields a session waiting for instructions. The verify step (intent attached) catches it.
- **Model default** — the background dispatcher can start on an older model and ignore your `settings.json`/`ANTHROPIC_MODEL`. Pass `--model` explicitly when the model matters.
- **No results push** — nothing comes back on its own. Note the id and go read it.
