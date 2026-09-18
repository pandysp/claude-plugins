# Flue workflows

Author dynamic JavaScript programs from Claude Code, Codex or pi. The main
assistant owns the task, program and conversation; [Flue](https://flueframework.com/)
runs the workers. No supervisor model, fixed workflow catalog or prescribed
roles, phases, votes or stopping rules.

**Development draft:** runtime review, final installed-build verification and
fresh cross-host authoring trials are still open. Earlier live receipts do not
certify the final build. This is not a completed release or parity claim.

## What it provides

- Per-call prompts, JSON result schemas, model/effort, tools and working directory.
- Parallel barriers, overlapping per-item pipelines and child programs.
- Optional independent Git copies for edits, retained files and reviewable patches.
- Explicit authentication, pinned programs/runtime, progress and run inspection.
- Cancellation and bounded saved-result reentry—not JavaScript stack recovery.

Workers have **unrestricted host access** after explicit approval. A Git copy
prevents edit collisions; it is not a security sandbox. No containers or
per-command approval interface are provided.

## Start here

| Resource | Purpose |
|---|---|
| [Skill](skills/flue-workflows/SKILL.md) | Authoring workflow and operating rules |
| [API](skills/flue-workflows/references/api.md) | Exact primitives, options and extension seams |
| [Patterns](skills/flue-workflows/references/patterns.md) | Choosing dependencies, checks and coverage rules |
| [Claude comparison](skills/flue-workflows/references/claude-parity.md) | Matches, differences and remaining work |
| [Coding example](skills/flue-workflows/examples/coding/program.mjs) | Discovery, conditional repair, parallel pipelines and independent checks |
| [Custom-tool example](skills/flue-workflows/examples/custom-tool/README.md) | A native tool factory, raw result schema and consumer check |

Resolve helper paths relative to the installed skill directory. Do not hardcode
one host's plugin-cache path into authored programs. The dedicated workflow
workspace keeps run state and each run's pinned runtime outside that cache.

Declared prerequisites are Node 22.19+, npm, Git and POSIX process groups
(macOS/Linux). Local tests have run on Node 22.19.0 and 26.5.0 on macOS, including
scripted-transport native probes; known failures remain. Final installed-build
verification and Linux CI are still open.

## A disposable coding example

The example creates its own repository and refuses an existing destination.
Never point the fixture builder at real work. It includes two broken functions,
one already-correct function, dirty/untracked inputs and an external-access case
that the program deliberately does not attempt.

Set `SKILL` to the installed skill directory and choose a new `ROOT`:

```sh
SKILL=/absolute/path/to/skills/flue-workflows
ROOT=/absolute/new-flue-example
mkdir "$ROOT"
cp -R "$SKILL/examples/coding" "$ROOT/program"
node "$ROOT/program/create-fixture.mjs" "$ROOT/source" > "$ROOT/baseline.json"
node "$SKILL/scripts/setup.mjs" "$ROOT/workflow-space"
node "$ROOT/workflow-space/flue.mjs" doctor --model openai-codex/gpt-5.5 --auth pi
node -e 'console.log(JSON.stringify({source: process.argv[1], include: ["identity", "slug", "sum"]}))' \
  "$ROOT/source" > "$ROOT/args.json"
node "$ROOT/workflow-space/flue.mjs" check "$ROOT/program/program.mjs"
node "$ROOT/workflow-space/flue.mjs" run "$ROOT/program/program.mjs" \
  --id coding-1 --cwd "$ROOT/source" \
  --model openai-codex/gpt-5.5 --auth pi --access unrestricted \
  --args-file "$ROOT/args.json"
node "$ROOT/workflow-space/flue.mjs" inspect coding-1 > "$ROOT/inspection.json"
node "$ROOT/program/verify.mjs" "$ROOT/inspection.json" "$ROOT/baseline.json" "$ROOT/args.json"
```

`--auth pi` requires an already-valid OpenAI OAuth credential in pi's auth store.
The runner does not log in, refresh or copy credentials, and does not borrow a
Claude/Codex login. Alternatively, explicitly choose an `openai/…` or
`anthropic/…` model with `--auth env:VARIABLE` for API billing. Never put a token in
arguments or copy an auth file into the example.

`check` validates syntax only. `doctor` makes no model request. The consumer
verifier checks final candidate files with the original fixture's checks, checks
patch bytes and task boundaries, reconciles coverage, and checks the original
files/HEAD/index. Passing finite fixture cases is not proof for arbitrary inputs.
The example has not yet passed the final live authoring/verification gate.

### Exercise different outcomes

Keep `source` in every args file. Use a **new run ID** for changed arguments.
These switches belong to the example, not the runtime's workflow policy.

| Args besides `source` | Expected coverage, if ordinary checks succeed |
|---|---|
| `"include": ["identity", "slug", "sum"]` | Complete selected work; external case explicitly out of scope |
| No selection filter | Partial: external-access case remains omitted with a reason |
| `"include": ["sum"], "injectFailure": ["sum"]` | Failed: deliberate stage exception, no completed selected work |
| `"maxCases": 1` | Explicitly limited work; every unattempted selected case is reported |

`injectFailure` must name runnable function cases: external or `maxCases`-omitted
cases are rejected before the pipeline starts. The injected failure tests
composition/error reporting; it is not a simulated successful model call. Inspect `discovered`, `selected`, `outOfScope`, `attempted`,
`completed`, `failed` and `omitted`, not just the status word. Empty selected work
is explicitly empty coverage, not evidence of useful work.

## Operate the same run

```sh
node "$ROOT/workflow-space/flue.mjs" inspect coding-1
node "$ROOT/workflow-space/flue.mjs" cancel coding-1
node "$ROOT/workflow-space/flue.mjs" resume coding-1
```

`cancel` contacts the existing owner; it does not start recovery. Success confirms
clean shutdown, terminal workers and quiescent recorded commands—not task success.
Cleanup failures and missing/unknown/live command ownership cause refusal; inspect
the retained files and stop surviving writers explicitly.
`resume` uses the saved configuration and runtime, reenters the pinned program
from the beginning, and can reuse recorded matching jobs. Failed/aborted keys
are not silently retried. Changed work needs new keys or a new run.

An owner process dying does not prove its commands died. Live recorded groups,
unknown command ownership and damaged inputs/outputs block reentry. `resume`
refuses while old command groups remain; it does not wait for them to exit.
After those checks pass, the built-in-worker recovery path settles already
admitted Flue work, then reenters the program. Pending work from programs with
`tools.mjs` or `worker.mjs` is refused because those custom effects are outside
that command-tracking boundary. Stronger recovery remains separate work.

No patch is automatically merged and no retained workspace is automatically
removed. Review outputs before applying them. `execution: finished`, exit 0,
a valid schema and model agreement are not guarantees of correctness or coverage.
