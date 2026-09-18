---
name: flue-workflows
description: Author and run dynamic multi-agent JavaScript programs using Flue workers from Claude Code, Codex or pi. Use when work needs discovered fan-out, per-item pipelines, independent checks, conditional follow-up or parallel coding workers. Supplies execution primitives, not a fixed research/review recipe. The main assistant remains outside Flue and owns the task, program and user interaction. Local workers have unrestricted file/shell access only after explicit approval; isolated copies prevent edit collisions, not host access.
---

# Flue workflows

Write a program when the next work depends on what earlier workers find. Keep
ordinary judgment in the main conversation. The program supplies the control
flow; Flue supplies the workers. Do not hand the overall task to a supervisor
model or replace it with a predefined workflow catalog.

## Start with the work, not a fleet

Scout enough to name the inputs, outputs and decisions. Decide which checks
actually need independence and where results must meet. Use ordinary JavaScript
for loops, branches, deduplication, voting and stopping rules. Worker roles and
result shapes can be invented per call; none must be selected from a catalog.

Before running, establish:

- **Authority:** workers run local commands and can access the whole host. Obtain
  explicit unrestricted-access approval. No containers or command approval UI
  are provided. A private Git copy is not security containment.
- **Inputs:** name a working directory and put programs in a separate directory.
  Keep the workflow workspace outside those directories. Do not snapshot a
  broad home/tmp directory or put changing run files among program inputs.
- **Credentials/model:** choose explicitly; the authoring host's model, login,
  instructions and tools are not inherited. `--auth pi` reads an existing valid
  OpenAI subscription login from pi. `--auth env:VARIABLE` deliberately selects
  API-key billing. Never print, copy or refresh credentials to make a test work.
- **Coverage:** define complete, partial and failed outcomes; report discovered,
  attempted, failed and deliberately omitted work. A finished program, valid
  JSON or a vote count does not prove the answer is true or complete.

## Setup and first program

Resolve the following helper relative to **this skill's directory**, not the
shell's current directory. Setup installs pinned dependencies into an explicitly
chosen workflow workspace. It does not install globally or alter host settings.
Node 22.19+ with `node:sqlite`/`registerHooks`, npm and Git are required; see the
plugin README for tested versions.

```sh
node /absolute/path/to/this/skill/scripts/setup.mjs /absolute/workflow-space
node /absolute/workflow-space/flue.mjs doctor --model openai-codex/gpt-5.5 --auth pi
```

Create a small standalone **program directory**, for example
`/absolute/programs/audit/program.mjs`. Its entry exports a default async
function. All local modules/resources belong in that directory. Keep source
repositories, outputs and credentials outside it: the entire directory is
snapshotted as program input.

```js
export default async function (run, args) {
  run.phase('Inspect');
  const checks = await run.parallel(args.files.map(file => () =>
    run.agent(`Inspect ${file}. Identify a concrete defect or explain why none
was found. Use tools to check your claim; do not modify files.`, {
      key: `inspect:${file}`,
      label: file,
      tools: ['read', 'grep', 'glob'],
      schema: {
        type: 'object',
        properties: { defect: { type: 'boolean' }, evidence: { type: 'string' } },
        required: ['defect', 'evidence'], additionalProperties: false,
      },
    })
  ));
  const failed = args.files.filter((_, i) => checks[i] === null);
  return {
    status: failed.length ? (failed.length === checks.length ? 'failed' : 'partial') : 'complete',
    attempted: args.files, failed, omitted: [], checks,
  };
}
```

Here, complete means every requested inspection returned—not that the files
have no defects. An empty list reports empty coverage, not useful work done.

Put actual JSON in `args.json`, such as `{"files":["src/a.mjs","src/b.mjs"]}`:

```sh
node /absolute/workflow-space/flue.mjs check /absolute/programs/audit/program.mjs
node /absolute/workflow-space/flue.mjs run /absolute/programs/audit/program.mjs \
  --id audit-1 --cwd /absolute/source-repo \
  --model openai-codex/gpt-5.5 --auth pi --access unrestricted \
  --args-file /absolute/args.json
```

`check` is a **syntax check**, not proof that dynamic calls or findings are
correct. `doctor` checks local dependencies/configuration/credentials without a
model request. Do not turn either into a claim of successful execution.

## Compose the right dependencies

| Need | Use |
|---|---|
| One worker; arbitrary prompt and result shape | `agent(prompt, options)` |
| All results together, e.g. compare proposals | `parallel([() => work(), …])` |
| Independent items moving through stages | `pipeline(items, stage1, stage2, …)` |
| Branch/retry/refine based on evidence | Ordinary `if`, loops and functions |
| Another program sharing worker limits/cancellation | `workflow('child.mjs', args)` |
| Progress and bounded admission | `phase`, `log`, `budget` |

Read [the API contract](references/api.md) before authoring substantive programs.
Read [patterns](references/patterns.md) when choosing verification, coverage or
stopping rules. They are building blocks, not mandatory phases.

A pipeline has **no barrier between stages**: one item can be verified while
another is still being investigated. Every stage receives
`(previousResult, originalItem, index)`. Explicit `null` values reach the next
stage, so handle them. A thrown item-stage error skips its remaining stages and
records a failure. `parallel` and `pipeline` return `null` for such failed items;
configuration, safety-limit and cancellation errors stop the run instead.
Never filter nulls and then call the work complete.

## Coding workers and delivery

Use `isolation: 'snapshot'` for parallel edits. It creates an independent Git
copy with history, the current tracked dirty files and non-ignored untracked
inputs. It disables hooks/signing and removes the source remote. No original
index or working tree is changed by provisioning or collection. Ignored inputs
are not copied; install needed dependencies inside the worker's copy.

Workers can run `read`, `write`, `edit`, `bash`, `grep` and `glob`. Without a
snapshot, their working directory is the supplied source directory: edits are
**direct edits**, not staged proposals. Do not run competing writers there.
Commands must stay in the foreground with bounded timeouts. Do not leave
servers, daemons or detached work behind.

`run.artifacts()` and `inspect` return retained workspace/patch paths. Collecting
captures committed changes, working-tree edits and non-ignored untracked files,
without changing the worker's index. Ignored/generated outputs remain in the
retained workspace. Check the actual files and run relevant tests yourself;
workers saying “tests passed” is not consumer-side verification. Never silently
apply/merge patches or delete successful, failed or cancelled workspaces.

## Operate and resume

```sh
node /absolute/workflow-space/flue.mjs inspect audit-1
node /absolute/workflow-space/flue.mjs cancel audit-1
node /absolute/workflow-space/flue.mjs resume audit-1
```

Progress is structured stderr; stdout ends with an inspection summary. Read its
`result` file and retained artifacts. `execution: finished` means JavaScript
returned, not that every requested input was covered. Worker/composition errors
produce exit 2 even if the program returns a useful partial result; fatal errors
or cancellation produce exit 1. Keep a live run in a terminal or host session
you can inspect and cancel.

`resume` re-enters the pinned program from the beginning and reuses saved jobs
by key: completed results are returned, failed/aborted jobs stay `null`, and
interrupted jobs re-attach to their Flue submission. It is not a JavaScript
stack checkpoint, and it refuses to start while the program changed or a shell
command from the previous attempt is still running. The exact rules are in the
[API reference](references/api.md#operate-and-re-enter).

See the [coding example and consumer checks](../../README.md#a-disposable-coding-example)
and the [Claude comparison](references/claude-parity.md). For custom tools or
native Flue hooks, see the API reference; keep them in the program directory.
