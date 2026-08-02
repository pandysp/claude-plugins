# dispatch-bg

Dispatch background Claude Code sessions (`claude --bg`) to the right repo, verify they actually landed instead of trusting the `backgrounded · <id>` banner, and read the fleet they form. Ships a skill (the discipline) plus two scripts: `bin/bg-dispatch` (dispatch + verify) and `bin/bg-fleet` (state, progress, results, artifacts).

## Why

The command is a one-liner. The failures are silent. A background session dispatched from the wrong current directory quietly does the wrong repo's work; a botched dispatch leaves a session sitting with no prompt; and the dispatch banner prints success for both. The banner then suggests `claude logs <id>` / `claude attach` / `claude stop` — none of which are real subcommands (verified on Claude Code 2.1.x). The CLI parses them as a fresh prompt, so `claude logs <id>` spins up a new session that answers the word "logs", which reads exactly like a broken agent. The only job subcommand is `claude agents`, and it takes only `--json` / `--all` / `--cwd` plus defaults for the agent view — so the CLI offers no scripted stop, attach, or reply.

The daemon does. Underneath both wrappers is a full fleet RPC on a unix control socket, and it is the stronger surface: it can message a live agent in place, revive a job whose process has exited under its original id and transcript, stream a session's output, and evict a worker from the roster — none of which the CLI exposes. The skill documents the whole op set, the dispatch descriptor, the error codes, and a repair procedure for re-deriving all of it when a release moves something.

Then the second half. A background agent never reports back, so once you have several running, the work is spread across jobs nobody reads. The roster is thin — `id, kind, name, cwd, sessionId, startedAt, state, status, pid` — and says nothing about what any agent *did*. The progress line, the result, and the PR it opened are recorded, but in internal job files.

So the value isn't the dispatch. It's dispatching into the right place, confirming it landed, and being able to collect the output afterwards. This plugin encodes all three, and keeps the boundary between the documented interface and the internal files explicit.

## Usage

```
/dispatch-bg
```

Or just ask to dispatch a background agent — or ask what your background agents are doing. The skill first steers the fork-vs-background choice (in-session subagents share your context and die with your session; background sessions start fresh, run independently, and outlive it — a different tool for a different job), then runs the disciplined dispatch:

```bash
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-dispatch --repo <dir> --name <name> --prompt-file <file>
# or pipe the prompt on stdin:
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-dispatch --repo <dir> --name <name> < prompt.md
# override the model (the bg dispatcher can ignore settings.json):
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-dispatch --repo <dir> --model <model> --prompt-file <file>
```

Later, read the fleet:

```bash
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-fleet                    # every agent: state, detail, result, PR links
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-fleet --live             # only agents with a live process
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-fleet --cwd ~/dev/work   # scope to one tree
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-fleet <id> --timeline 20 # one agent + its state transitions
"${CLAUDE_PLUGIN_ROOT}"/bin/bg-fleet --json             # merged records for scripting
```

## What `bin/bg-dispatch` does

1. Reads the prompt from `--prompt-file` or stdin and refuses to dispatch an empty one (the session starts with fresh context, so the prompt is the entire handoff).
2. `cd`s into `--repo` explicitly and runs `claude --bg` there — never the caller's current directory.
3. Parses the session id and polls `claude agents --json --all` (the documented, TTY-free interface) until it appears.
4. Confirms the agent was dispatched where you meant by re-querying with `--cwd <repo>` and checking the id is in that list. That filter matches the *dispatch* directory, so it still holds once the agent isolates itself into a worktree — the reported `cwd` follows the live process and becomes the worktree. A path comparison remains as a fallback.
5. Prints both liveness axes (`state` versus `status`/`pid`) and exits non-zero on a cwd mismatch (3) or a session that never registered (2), so a wrapper or a human notices.

No verdict depends on internal files: the checks run against `claude agents --json`, and `~/.claude/jobs/<id>/state.json` is consulted only for a best-effort "did a prompt attach" warning.

## What `bin/bg-fleet` does

Read-only. It merges the documented roster with a best-effort harvest of each agent's job files, so one command answers "what is running, what finished, and what did it produce":

- **From `state.json`** — `detail` (the agent's own one-line status, updated while it runs), `output.result` (its closing line), `children[]` (artifacts with hrefs, so a PR it opened shows up), plus `worktreePath`, `tokens`, `intent`, and the `cliVersion` the schema belongs to.
- **From `timeline.jsonl`** — one line per state transition with its detail, for `<id> --timeline <n>`.

Those files have no stability guarantee, so every field is read defensively: a renamed or retyped key costs a line of output, never a crash or a non-zero exit. Verified against 14 mutated schemas (missing directory, non-JSON, wrong types, renamed keys) with no failures.

One property to know before you run it: with no arguments this reads *every* background agent on the machine, not only the ones you dispatched, and `detail` for a live agent is often the last thing a human typed at it. Expect conversation text in the output, and scope with `--cwd` when that matters.

Stopping and resuming are deliberately *not* here. There is no CLI for either, and the scripted alternatives are sharp: `kill <pid>` can land mid-tool-call and leave a half-written worktree, and replaying the recorded `respawnFlags` to continue an agent can silently re-grant `--dangerously-skip-permissions`. The skill documents both as recipes with their cautions; the script stays blast-radius-free.

## Requirements

- Claude Code with `claude` on `PATH` (job subcommand `claude agents`; verified on 2.1.220).
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
