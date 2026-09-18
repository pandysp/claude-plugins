# Flue workflows

Author dynamic JavaScript programs from Claude Code, Codex or pi. The main
assistant owns the task, program and conversation; [Flue](https://flueframework.com/)
runs the workers. No supervisor model, workflow catalog or prescribed phases.

## What it provides

- Per-call prompts, JSON result schemas, model/effort, tools and working directory.
- Parallel barriers, overlapping per-item pipelines and child programs.
- Independent Git copies for parallel edits, retained as reviewable patches.
- Explicit authentication, a pinned program and runtime per run, a journal,
  `inspect`, `cancel` and `resume` with keyed reuse of finished workers.

Workers have **unrestricted host access** after explicit approval. A Git copy
prevents edit collisions; it is not a security sandbox.

| Resource | Purpose |
|---|---|
| [Skill](skills/flue-workflows/SKILL.md) | Authoring workflow and operating rules |
| [API](skills/flue-workflows/references/api.md) | Exact primitives, options, operation and recovery contract |
| [Patterns](skills/flue-workflows/references/patterns.md) | Choosing dependencies, checks and coverage rules |
| [Claude comparison](skills/flue-workflows/references/claude-parity.md) | Matches, differences and remaining work |
| [Coding example](skills/flue-workflows/examples/coding/program.mjs) | Discovery, conditional repair, parallel pipelines and independent checks |
| [Custom-tool example](skills/flue-workflows/examples/custom-tool/README.md) | A native tool factory, raw result schema and consumer check |

Prerequisites: Node 22.19+, npm, Git, macOS/Linux. CI runs the runtime and
example tests on both platforms with Node 22.19 and 26.5, using real Flue,
SQLite and Git with scripted model replies.

## A disposable coding example

The example creates its own repository and refuses an existing destination.
It includes two broken functions, one correct function, dirty/untracked inputs
and an external-access case the program deliberately skips.

```sh
SKILL=/absolute/path/to/skills/flue-workflows
ROOT=/absolute/new-flue-example
mkdir "$ROOT"
cp -R "$SKILL/examples/coding" "$ROOT/program"
node "$ROOT/program/create-fixture.mjs" "$ROOT/source" > "$ROOT/baseline.json"
node "$SKILL/scripts/setup.mjs" "$ROOT/workflow-space"
node "$ROOT/workflow-space/flue.mjs" doctor --model openai-codex/gpt-5.5 --auth pi
echo '{"source": "'"$ROOT"'/source", "include": ["identity", "slug", "sum"]}' > "$ROOT/args.json"
node "$ROOT/workflow-space/flue.mjs" check "$ROOT/program/program.mjs"
node "$ROOT/workflow-space/flue.mjs" run "$ROOT/program/program.mjs" \
  --id coding-1 --cwd "$ROOT/source" \
  --model openai-codex/gpt-5.5 --auth pi --access unrestricted \
  --args-file "$ROOT/args.json"
node "$ROOT/workflow-space/flue.mjs" inspect coding-1 > "$ROOT/inspection.json"
node "$ROOT/program/verify.mjs" "$ROOT/inspection.json" "$ROOT/baseline.json" "$ROOT/args.json"
```

`--auth pi` reads an existing OpenAI OAuth login from pi's auth store; the
runner never logs in, refreshes or copies credentials. `--auth env:VARIABLE`
with an `openai/…` or `anthropic/…` model selects API-key billing instead.

`verify.mjs` is the consumer-side check: it reruns the fixture's checks against
each retained candidate and confirms the original files, HEAD and index are
unchanged. A finished run, a valid schema or a worker saying "tests passed" is
not that check.

| Args besides `source` | Expected coverage |
|---|---|
| `"include": ["identity", "slug", "sum"]` | Complete; the external case is out of scope |
| No selection filter | Partial; the external case is omitted with a reason |
| `"include": ["sum"], "injectFailure": ["sum"]` | Failed; a deliberate stage exception |
| `"maxCases": 1` | Explicitly limited; unattempted selected cases are reported |

Use a new run id for changed arguments. `inspect`, `cancel` and `resume` are
described in the [API reference](skills/flue-workflows/references/api.md#operate-and-re-enter).

## Live verification

2026-09-18, macOS, Node 26.5, `openai-codex/gpt-5.5` via `--auth pi`, on this
runtime: the example above ran from a fresh `setup.mjs` install. Four workers
(two repairs in separate Git copies, two independent verifiers) completed;
`verify.mjs` reported `complete` for `identity`, `slug` and `sum` with the
original source, HEAD and index unchanged. `resume` with `fetch` disabled
reused all four results with zero new dispatches or fetch attempts. Hard-kill,
`SIGTERM` and receipt-free keyed recovery are covered by the automated
real-Flue suite, not this trial. The hard-kill test checks that resume reuses
the original submission ID, rather than merely finishing another submission.
