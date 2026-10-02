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
- Optional review of workers by [pi-hydra](https://github.com/pandysp/pi-hydra)
  heads, only for programs that include a `heads/` directory.

Workers have **unrestricted host access** after explicit approval. A Git copy
prevents edit collisions; it is not a security sandbox.

| Resource | Purpose |
|---|---|
| [Skill](skills/flue-workflows/SKILL.md) | Authoring workflow and operating rules |
| [API](skills/flue-workflows/references/api.md) | Exact primitives, options, operation and recovery contract |
| [Patterns](skills/flue-workflows/references/patterns.md) | Choosing dependencies, checks and coverage rules |
| [Claude comparison](skills/flue-workflows/references/claude-parity.md) | What differs from Claude Code's Workflow tool |
| [Coding example](skills/flue-workflows/examples/coding/program.mjs) | Discovery, conditional repair, parallel pipelines and independent checks |
| [Custom-tool example](skills/flue-workflows/examples/custom-tool/README.md) | A native tool factory, raw result schema and consumer check |

Prerequisites: Node 22.19+, npm, Git, macOS/Linux. CI runs the runtime and
example tests on both platforms with Node 22.19 and 26.5, using real Flue,
SQLite and Git with scripted model replies. Live runs below were started from a
shell; authoring programs from inside Claude Code or Codex has not been tried.

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

`--auth pi` reads an existing OpenAI or Claude subscription login from pi's auth
store; the runner never logs in, refreshes or copies credentials. `--auth
env:VARIABLE` selects API-key billing instead. All credential sources are listed
in the [API reference](skills/flue-workflows/references/api.md#cli-and-authentication).

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

2026-10-01, macOS, Node 26.5, Flue 2.2.2 and pi-ai 0.87.1, via `--auth pi`,
each from a fresh `setup.mjs` install, once with `openai-codex/gpt-5.5`
(ChatGPT subscription) and once with `anthropic/claude-opus-5-5` (Claude
subscription):

- The coding example above: four workers (two repairs in separate Git copies,
  two independent verifiers) completed in under 30 s; `verify.mjs` reported
  `complete` for `identity`, `slug` and `sum` with the original source, HEAD
  and index unchanged; `resume` reused all four with no new worker dispatches.
- The [custom-tool example](skills/flue-workflows/examples/custom-tool/README.md):
  `verify.mjs` passed, including the journaled `text_facts` tool completion.
- No token appeared in any run file.

Hard-kill, `SIGTERM` and receipt-free keyed recovery are covered by the
automated real-Flue suite, not these trials. The hard-kill test checks that
resume reuses the original submission ID, rather than merely finishing another
submission.
