---
name: dispatch-bg
description: Dispatch background Claude Code sessions and read the fleet they form. Use when the user says "dispatch a background agent", "launch a bg agent", "run this in the background", "kick off a claude --bg session", or asks what their background agents are doing, whether one landed, what one produced, how to stop or reply to one, or /dispatch-bg. Covers the fork-vs-background choice (subagents share your context and die with your session; background sessions start fresh, run independently, and outlive it), the dispatch discipline that otherwise fails silently (explicit cd into the target repo, a self-contained prompt passed via a file, name/model flags), the landing check through `claude agents --json` rather than the "backgrounded · <id>" banner or the non-existent `claude logs`/`attach`/`stop` subcommands, and how to harvest state, progress, results, and PR links across every agent. Not for in-session subagents (use the Agent tool) or scheduled routines (use /schedule).
---

# /dispatch-bg: launch background agents and read the fleet

`claude --bg "<prompt>"` is the whole command. Everything that goes wrong is around it, and it goes wrong silently: the session dispatches into the wrong directory, or starts with no prompt, and the `backgrounded · <id>` banner reports success either way. Then, because a background agent never reports back, whatever it produced sits unread.

So the skill is two halves: dispatch to the right place and confirm the session took the work, then read the fleet — state, progress, results, artifacts — without attaching to anything. Both halves rest on one distinction: `claude agents --json` is the documented interface and the only thing to *verify* against; everything richer lives in internal job files and is a best-effort harvest.

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

Confirm three things through the documented, TTY-free interface (`bg-fleet <id>` shows all three plus the harvest; the raw query is here so you can run it anywhere):

```bash
claude agents --json --all | python3 -c "import json,sys; \
  j=[a for a in json.load(sys.stdin) if a.get('id')=='<id>']; print(j)"
```

- **It exists** — the id is in the list.
- **It was dispatched where you meant** — scope with `claude agents --json --all --cwd <repo>` and check the id is in *that* list. The filter matches the **dispatch** directory, so it still finds the agent after it has moved into a worktree (and filtering by the worktree path finds nothing).
- **It is alive or finished cleanly** — see the two axes below.

`--json` alone lists only active sessions; `--all` includes completed ones. A job dropping from one view to the other is normal state-over-time, not a fault.

### Two axes, not one status

Confusing these is how you misread a healthy agent as broken:

- **`state`** — what the agent thinks it is doing: `working`, `blocked` (waiting on you), `done`. Survives the process.
- **`status` + `pid`** — whether a process is alive right now: `busy`/`idle` plus a pid. **Both are absent once the process exits**, so a finished agent is normally `state: done` with no `status` and no `pid`. `state: done` *with* a live pid is also normal — the agent is finished but its process has not torn down yet.

`cwd` follows the same live-vs-recorded split: while the process is alive it reports the **live** directory, which becomes the worktree the agent isolated into; once the process is gone it falls back to the directory you dispatched from. That is why the dispatch check scopes with `--cwd` instead of comparing strings.

## Read the fleet programmatically

The roster tells you what exists; it does not tell you what any agent *did*. `claude agents --json` carries only `id, kind, name, cwd, sessionId, startedAt, state, status, pid`. The interesting part — the progress line, the result, the PRs it opened — is in the internal per-job files, which have no stability guarantee. So keep the boundary explicit: **verify against the documented roster, harvest best-effort on top of it.**

```bash
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-fleet                    # every agent: state, detail, result, PR links
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-fleet --live             # only agents with a live process
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-fleet --cwd ~/dev/work   # scope to one tree
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-fleet <id> --timeline 20 # one agent + its state transitions
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-fleet --json             # merged records for scripting
```

What it merges in from `~/.claude/jobs/<id>/`, and what each is good for:

- **`state.json` → `detail`** — the agent's own one-line status, updated *while it runs*. The cheapest "what is it doing" without attaching.
- **`state.json` → `output.result`** — its closing result line, written when it finishes.
- **`state.json` → `children[]`** — artifacts it produced, with hrefs (a PR it opened shows up here). This is how you collect work off a fleet.
- **`state.json` → `worktreePath`, `tokens`, `intent`, `cliVersion`** — where it really worked, what it cost, the prompt it received, and the CLI version the schema belongs to.
- **`timeline.jsonl`** — one line per state transition with its detail. Newest line is the current state; tail it to watch progress or to see when it went `blocked`. Replies typed at the agent in the TUI land here too, so this is also where you see that a human already intervened — worth checking before you act on an agent someone else is steering.

Nothing here is a stable interface. Read every field defensively — a renamed key should cost you a line of output, not a crash.

## Stop, reply, and clean up

There is **no** stop/attach/reply subcommand: `claude agents` takes only `--json`/`--all`/`--cwd` plus defaults for sessions dispatched from the agent view. So:

- **Stop** — the TUI (`claude agents`) is the first resort. Scripted, the only lever is `kill <pid>` from the roster. That ends the *process*, not the job: within seconds `status` and `pid` drop out and `cwd` falls back to the dispatch directory, while `state`, `detail` and `result` stay intact — and replying to the job in the TUI afterwards **revives it under the same id with a new pid**. So a kill is a pause you cannot cleanly resume from, not a delete. It also lands wherever the agent happened to be, so mid-tool-call it can leave a half-written worktree. Do not reach for it as routine cleanup. An in-session stop tool cannot reach these at all — they are daemon jobs, not children of your session.
- **Reply** — a live agent is TUI-only; resuming a session another process still holds means two writers on one transcript. For a *finished* agent, `state.json` records `resumeSessionId` and `respawnFlags`, which is how the TUI continues it — but replaying `respawnFlags` verbatim can silently re-grant `--dangerously-skip-permissions`, so pass permissions yourself rather than inheriting them. And resuming mints a **new** job id: "replying" is really "continuing in a new session".
- **Clean up** — the roster ages out and job directories get reaped, but the session transcript under `~/.claude/projects/<slug>/<sessionId>.jsonl` outlives both. That transcript is the durable record of what an agent actually did once `bg-fleet` can no longer see it.

## Gotchas

- **cwd drift** — the single most common misfire. Always `cd`; always verify.
- **Empty-prompt session** — a botched dispatch yields a session waiting for instructions. The verify step (intent attached) catches it.
- **Model default** — the background dispatcher can start on an older model and ignore your `settings.json`/`ANTHROPIC_MODEL`. Pass `--model` explicitly when the model matters.
- **Nothing is pushed, but nothing is lost** — a background agent never reports back to you. It does, however, *record* its result: `detail`, `output.result`, and any PR it opened land in its job file, so you harvest with `bg-fleet` rather than having to re-read a transcript. Note the id and go collect.
- **An unnamed agent gets its whole prompt as its name.** Pass `--name` if you ever want to find it in a list again.
