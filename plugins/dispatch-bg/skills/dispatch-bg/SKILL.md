---
name: dispatch-bg
description: Dispatch background Claude Code sessions, read the fleet they form, and drive it through the daemon control socket. Use when the user says "dispatch a background agent", "launch a bg agent", "run this in the background", or asks what their background agents are doing, whether one landed, what one produced, how to reply to or unblock one, stream its output, revive or reap one, or /dispatch-bg. Covers the fork-vs-background choice (subagents share your context and die with your session; background sessions start fresh and outlive it), the dispatch discipline that fails silently (explicit cd, prompt in a file, name/model flags), the landing check through `claude agents --json` rather than the banner or the non-existent `claude logs`/`attach`/`stop` subcommands, harvesting state and results across agents, and the control-socket ops the CLI cannot do. Not for in-session subagents (use the Agent tool) or scheduled routines (use /schedule).
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

The **CLI** exposes no stop, attach, or reply: `claude agents` takes only `--json`/`--all`/`--cwd` plus defaults for sessions dispatched from the agent view. The daemon does expose all three, on a private socket — see the next section. Through documented interfaces alone:

- **Stop** — the TUI (`claude agents`) is the first resort. Scripted, the CLI-only lever is `kill <pid>` from the roster. That ends the *process*, not the job: within seconds `status` and `pid` drop out and `cwd` falls back to the dispatch directory, while `state`, `detail` and `result` stay intact — and replying to the job in the TUI afterwards **revives it under the same id with a new pid**. So a kill is a pause you cannot cleanly resume from, not a delete. It also lands wherever the agent happened to be, so mid-tool-call it can leave a half-written worktree. Do not reach for it as routine cleanup. An in-session stop tool cannot reach these at all — they are daemon jobs, not children of your session.
- **Reply** — do this over the socket (`reply`, or a `resume` dispatch if the process is gone); the CLI cannot. For the record, `claude -r <sessionId> --bg` silently **forks**, minting a new job id and copying the transcript, so the continuation pays a cold prefill on context it already had — the foreground path refuses outright and tells you to add `--fork-session`, while `--bg` applies that opt-in silently. If you ever do take the fork, pass `--name` (the new job is auto-named from its prompt) and record the chain yourself: nothing links a fork to its parent, `resumeSessionId` self-references by design, and lineage survives only in transcript internals where copied lines retain the parent's `session_id`.
- **Clean up** — the roster ages out and job directories get reaped, but the session transcript under `~/.claude/projects/<slug>/<sessionId>.jsonl` outlives both. That transcript is the durable record of what an agent actually did once `bg-fleet` can no longer see it.

## The daemon control socket — the real interface

`claude agents` and `claude --bg` are thin wrappers over a complete fleet RPC, and the wrappers are the weaker surface: they hardcode choices the RPC lets you make. Drive the socket directly.

**Connect.** `claude daemon status` (a hidden subcommand — also `run`/`logs`/`stop --keep-workers`) prints the socket path, `/tmp/cc-daemon-<uid>/<hash>/control.sock`. It speaks **newline-delimited JSON**, one request per connection, every frame carrying `proto`:

```bash
printf '{"proto":1,"op":"ping"}\n' | nc -U "$SOCK"
# {"ok":true,"op":"ping","version":"2.1.220","proto":1}
```

Privileged ops (`dispatch`, `reply`, `attach`, `permission-response`) take `auth`: the 32-byte `~/.claude/daemon/control.key`. `ping`, `list`, `has` need none. `short` is the 8-char job id.

**The ops** — a discriminated union on `op`, so this is the entire surface: `ping`, `nudge`, `yield`, `lease{client}`, `leases`, `await-ack{short,nonce,timeoutMs}`, `dispatch{d,timeoutMs,auth}`, `list`, `has{short}`, `kill{short,signal,handoff,evict}`, `reply{short,text,auth}`, `subscribe{short,tail}`, `attach{short,auth,cols,rows,caps}`, `resize{short,cols,rows}`, `ensure-spare{cwd}`, `permission-response{short,requestId,allow,auth}`, `respawn-stale{short}`, `shutdown{reapWorkers}`.

**The dispatch descriptor** (`d`) is plain data — no server-minted tokens needed:

```jsonc
{"proto":1, "short":"<8 hex, yours to choose>", "sessionId":"<uuid>", "createdAt":<ms>,
 "source":"fleet",                       // shell | slash | fleet | spare | respawn
 "cwd":"/abs/path",
 "launch": {"mode":"prompt","args":["--session-id","<uuid>","--name","x","<the prompt>"]},
 // or: {"mode":"resume","sessionId":"<uuid>","transcriptPath":"…","fork":false,"flagArgs":[…]}
 // or: {"mode":"exec","cmd":"…","args":[…]}
 "env":{}, "isolation":"none",           // or "worktree" with worktree:{path,ownershipToken}
 "respawnFlags":[], "agent":"claude", "seed":{"intent":"<prompt>","name":"x"}}
```

`launch.args` / `flagArgs` are just the child's argv. **You choose `short` and `sessionId`** — so a logical task can keep one stable job id for its whole life instead of accumulating a chain.

**The four things the CLI cannot do, all verified:**

- **`reply{short,text}`** — message a live agent *in place*. Tested against an agent sitting at `state: blocked`: it unblocked, acted on the content (told "Use B.md" it created B.md, not A.md), and finished — same job id, same pid, roster unchanged, prompt cache intact.
- **`dispatch` with `launch.mode:"resume", fork:false`** — revive a job whose **process has exited**, under its original `short` and `sessionId`, appending to the original transcript. Verified: roster size unchanged, no new id, no copied transcript. `claude -r <sessionId> --bg` records `fork:true` and cannot do this; the foreground path refuses outright. This is the whole reason to be on the socket.
- **`subscribe{short,tail}`** — stream a session as typed JSON frames, opening with `{"type":"snapshot","record":{…}}` (the full worker record, ~8 KB) and continuing as events arrive. Keep the connection open and read; this is the `claude logs` that does not exist, and it is the natural event source to hand to a watcher instead of polling.
- **`kill{short,evict:true}`** — stop *and* delete the worker from the roster: a real programmatic reap.

**Error codes you will meet:** `ENOJOB` (no live worker — for `reply`; revive it with a `resume` dispatch first), `ENOREPLY` (worker is non-interactive right now), `ERESPAWNING`/`ESTARTING` (retry), `EAUTH` (missing or stale control key), `EPROTO` (client/daemon version mismatch), `ESTALE` (previous dispatch with that id still cleaning up), `ETIMEOUT`.

**Two wrapper-only leftovers.** A pure-IPC dispatch writes a slightly thinner job record than the CLI does — `name`, `nameSource`, `respawnFlags`, `daemonShort` come from the wrapper — so pass `--name` in argv and set `respawnFlags` yourself if you want a respawn to keep its identity. And the job registry (`~/.claude/jobs/<id>/`) is written by the session as it boots, so a freshly dispatched job takes a few seconds to appear in `claude agents`; poll the daemon with `has{short}` instead, which is true immediately.

## When the socket breaks under you

This is a private interface with a version gate. It *will* change. When it does — `EPROTO`, an unknown op, a renamed field, a moved socket — **stop the task you are on and repair this skill first**, because every later task inherits the breakage. Then continue the original task.

Re-derive from the binary rather than guessing; the whole surface above was recovered this way in minutes:

```bash
claude daemon status                     # current socket path + daemon pid/version
printf '{"proto":1,"op":"ping"}\n' | nc -U "$SOCK"   # current proto number
B=~/.local/share/claude/versions/$(claude --version | awk '{print $1}')
# the op union, the dispatch descriptor, the id regex, the error codes:
python3 - "$B" <<'EOF'
import mmap,re,sys
mm=mmap.mmap(open(sys.argv[1],'rb').fileno(),0,access=mmap.ACCESS_READ)
for pat in (b'discriminatedUnion("op"', b'Wnn=Se(', b'rIe=/'):
    i=mm.find(pat); print(re.sub(rb'[^\x20-\x7e]',b'.',mm[i:i+2600]).decode(),"\n")
EOF
```

`Wnn` is the dispatch-descriptor schema and the symbol name is minified, so if it has moved, search instead for the literal `rendezvousSock` — the worker-record schema sits beside it, and the descriptor is referenced there as `dispatch:`. Ground truth for a *valid* descriptor is always `~/.claude/daemon/roster.json`, which stores the real one the CLI last sent for every live worker: copy its shape.

Then **persist the fix here** — update the op list, the descriptor, the error codes, and note the version you verified against. A repair that lives only in a transcript is a repair you will pay for again.

## Gotchas

- **cwd drift** — the single most common misfire. Always `cd`; always verify.
- **Empty-prompt session** — a botched dispatch yields a session waiting for instructions. The verify step (intent attached) catches it.
- **Model default** — the background dispatcher can start on an older model and ignore your `settings.json`/`ANTHROPIC_MODEL`. Pass `--model` explicitly when the model matters.
- **Nothing is pushed, but nothing is lost** — a background agent never reports back to you. It does, however, *record* its result: `detail`, `output.result`, and any PR it opened land in its job file, so you harvest with `bg-fleet` rather than having to re-read a transcript. Note the id and go collect.
- **An unnamed agent gets its whole prompt as its name.** Pass `--name` if you ever want to find it in a list again.
