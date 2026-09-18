# Workflow primitives: API

The assistant owns the task and writes ordinary JavaScript. The installed runner
loads that program and uses Flue for its workers. There is no supervisor model,
role catalog or prescribed sequence of phases.

## Files and entry point

Keep three separate directories:

| Directory | Contents |
|---|---|
| Source repository | The code or documents workers inspect; Git root required for snapshots |
| Program directory | `program.mjs`, local modules and fixed resources; no credentials or changing outputs |
| Workflow workspace | Installed runtime versions, run records and retained worker copies |

```js
export default async function (run, args) {
  const answer = await run.agent('Explain the public entry point. Do not edit.', {
    key: 'entry-point', tools: ['read', 'grep', 'glob'],
  });
  return { answer };
}
```

No `meta` export or top-level injected globals are required. Use `.mjs` for
unambiguous JavaScript modules; this is not a TypeScript compiler. The CLI
parses `--args`/`--args-file` as JSON and passes the resulting value to `args`.
The final return value must be finite, acyclic JSON: no `undefined`, `Date`,
`BigInt`, functions or class instances. Await every worker and composition call.

The runner copies the **whole program directory**, excluding `.git` and
`node_modules`. File imports from it must stay within that copy or the pinned
runtime's `node_modules`. Node built-ins remain available. This import rule is
not a security sandbox: arbitrary filesystem reads, clocks, randomness and
external effects are still possible, and their state is not checkpointed.

## `await run.agent(prompt, options)`

One worker with a fresh task. With `schema`, returns a validated object; without
it, returns final text. A terminal worker failure/abort returns `null` and is
reported in the journal. Configuration, infrastructure, admission-limit and
run-cancellation failures reject rather than returning a pretend answer.

| Option | Default | Contract |
|---|---|---|
| `key` | Derived identity plus occurrence | Stable nonempty string for this job in its program invocation; changing inputs under the same key is an error |
| `label` | Empty | Nonempty display label when supplied |
| `phase` | Current phase | Explicit progress group for this call |
| `schema` | `null` | JSON Schema with `type: 'object'` at the root; wrap arrays/scalars in an object |
| `model` | CLI model | `provider/model` from the pinned catalog, under the run's **same selected provider** |
| `effort` | CLI effort (`low`) | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`; the provider/model must support the requested behavior |
| `tools` | All built-ins and declared custom factories | Array of unique tool names; `[]` is valid |
| `cwd` | CLI working directory | Absolute path or path relative to CLI `--cwd` |
| `isolation` | `none` | `none` edits directly; `snapshot` creates an independent Git copy |
| `instructions` | Empty | Additional worker instructions; not inherited host instructions |
| `data` | `null` | JSON configuration available to native hooks/tool factories as `task.data` |

Inputs are copied when `run.agent()` is called, before waiting for a worker
slot. Later changes to `data`, `tools` or `schema` do not change queued work.

Unknown options, unknown models/tools and invalid schemas are refused. The
schema validator uses Ajv's default JSON Schema dialect (draft-07), with formats
and strict keyword checking. This is not a generic proof that a schema is
satisfiable; providers may also impose their own tool-schema constraints.

```js
const result = await run.agent('Check the parser; cite a concrete test.', {
  key: 'parser-check', label: 'Parser', phase: 'Check',
  tools: ['read', 'grep', 'glob'],
  schema: {
    type: 'object',
    properties: {
      passed: { type: 'boolean' },
      evidence: { type: 'string' },
    },
    required: ['passed', 'evidence'], additionalProperties: false,
  },
});
if (result === null) {
  // Record a failed attempt, not an empty successful inspection.
}
```

Structured workers receive a `submit_result` tool in addition to their selected
tools. It validates the object, writes Flue's named result data and terminates
the task. Invalid submissions are tool errors; there is no fallback that parses
chat text as JSON. One returned validated value does **not** imply exactly one
raw tool invocation, correct facts or complete coverage.

### Identity and retries

- Reuse needs unchanged normalized prompt/options and an intact saved job. Use
  explicit keys when a job must remain recognizable across discovery or ordering
  changes. Without a key, repeated identical calls are distinguished by their
  occurrence in the program invocation.
- Do not launch the same pending key twice. Share and await its promise instead.
- Terminal failed/aborted submissions are not silently retried. An intentional
  new attempt needs a distinct key, such as `check:item:attempt:2`.
- Child program invocations have separate key namespaces that include their
  invocation order. Stable keys do not restore changed child-call ordering.
- The run-wide limit counts saved jobs, including failures. Reusing an existing
  job does not create another admission.

## Composition

### `await run.parallel(thunks)`

Pass functions, **not already-started promises**:

```js
const results = await run.parallel(items.map(item => () => inspect(item)));
```

All thunks start; worker calls queue under the shared worker concurrency limit.
The result is an array in input order. This is a barrier: the call returns once
all ordinary item work has settled. An ordinary thrown item error is logged and
becomes `null`. Fatal configuration/safety/cancellation errors reject the call
and stop the run; this deliberately differs from an always-null-on-error API.
An empty list returns `[]`.

### `await run.pipeline(items, ...stages)`

```js
const checked = await run.pipeline(items,
  item => inspect(item),
  async (inspection, item, index) => {
    if (inspection === null) return null;
    return inspection.needsChange ? repairAndCheck(item, inspection, index) : inspection;
  },
);
```

- Every stage receives `(previousResult, originalItem, index)`.
- Each item advances independently; there is **no cross-item stage barrier**.
- Returned results stay in input order, not completion order.
- Explicit `null` reaches the next stage. Handle it there.
- An ordinary thrown stage error stops that item's remaining stages, logs the
  failure and yields `null` for that item. Fatal errors stop the run.
- No stages returns the original items. An empty input returns `[]`.

The concurrency limit applies to worker calls, not arbitrary promises, shell
commands or network requests the program starts itself. Keep those effects
bounded and owned; do not use plain JavaScript to evade worker limits.

### `await run.workflow(name, args)`

`name` is a module path relative to the **program root**, even when called from a
child. It is not a saved-workflow registry name or `{scriptPath}` object.

```js
const report = await run.workflow('checks/package.mjs', { package: 'parser' });
```

The child exports the same default function and receives its own `args` value
(default `null`). It shares admission limits, cancellation and retained-artifact
collection. Nested calls are ordinary program composition, not a new worker or
supervisor. There is no built-in one-level nesting rule; do not create recursive
cycles or assume arbitrary caller execution is durable.

Child failures are printed and saved as `workflow-failed` events before being
re-thrown. The parent may catch an ordinary child error and continue without a
forced failure exit. Fatal worker/configuration errors still stop the run.

## Progress, limits and outputs

| API | Meaning |
|---|---|
| `run.phase(title)` | Set a nonempty phase label in this async branch and emit a progress event |
| `run.log(value)` | Emit `String(value)` as a progress message; never include secrets |
| `run.budget.maxJobs` | Configured run-wide worker-admission ceiling |
| `run.budget.spent()` | Number of saved jobs, not tokens, dollars or current live workers |
| `run.budget.remaining()` | Admission slots remaining under that ceiling |
| `run.artifacts()` | References (`id`, `key`, `cwd`, `patch`) into the final workspace; shutdown recollects every patch, so read them after the run. `state.json` holds the final hashes |
| `run.signal` | Run-level `AbortSignal`; pass it to caller-owned cancellable operations |

Parallel branches copy their current phase context rather than mutating one
global phase. Each child program has its own phase context; call `phase()` inside
the child to label its workers instead of relying on the parent's label.
Explicit `phase` per worker is still useful for readable pipelines. Labels do
not determine worker policy.

`budget` is **an admission counter, not token or cost accounting**. Checking it does not reserve
slots for later asynchronous work. Plan a batch before starting it; if you bound
coverage, name the omitted items and why. Crossing the hard admission limit is a
fatal error, not a silent truncation or a promise of a partial result file.

Progress is newline-delimited JSON on stderr; the durable journal is
`runs/<id>/events.jsonl`. Stdout ends with an inspection summary. The program's
returned value is saved separately as `runs/<id>/result.json` when it returns
successfully. An inspection result path does not guarantee that file exists
after a failed/cancelled run.

## Coding and artifact ownership

`isolation: 'snapshot'` requires a Git repository root with a commit. Each worker
gets a full independent local clone, not a linked worktree. The input snapshot
includes dirty tracked files, deletions and non-ignored untracked files;
executable bits and symlink targets are retained. Hooks/signing are disabled and
the source remote is removed. Ignored inputs, such as `node_modules`, are not
copied. Submodules and special files require a different explicit input plan.

These copies prevent ordinary relative-path edit collisions. They do **not**
contain shell commands, absolute paths, symlinks, network access or native hooks.
All workers remain unrestricted local processes. A tool list containing `bash`
is not read-only merely because it omits `write` and `edit`.

After a snapshot worker settles, its artifact in `state.json` includes:

| Field | Meaning |
|---|---|
| `cwd` | Retained worker directory |
| `base` | Input-snapshot commit |
| `head` | Worker HEAD when collected |
| `changed` | Paths changed relative to the input snapshot |
| `patch` / `patchHash` | Binary-capable patch path and its SHA-256 |
| `hash` | Retained file-tree identity, excluding `.git` |

Collection includes worker commits, dirty changes and non-ignored untracked
files without changing its index. Ignored outputs stay on disk but are not in
the patch. `isolation: 'none'` has no separate patch artifact: it works directly
in `cwd`. Do not mix competing writers there.

Use distinct keys to map candidates back to artifacts. Check the actual files
and run independent tests before delivery. A verifier can use
`cwd: candidate.cwd, isolation: 'snapshot'` to check a separate copy of the
candidate without modifying its retained output. Never automatically merge or
delete any successful, failed or cancelled workspace. Inspect again after
shutdown: final collection may include late failed/cancelled-worker edits.

## Custom tools and native hooks

Put `tools.mjs` beside the entry module. Its default export is a plain object
mapping names to synchronous factories:

```js
export default {
  word_count: (_sandbox, { task }) => ({
    name: 'word_count', label: 'Count words',
    description: 'Count whitespace-separated words in literal text.',
    parameters: {
      type: 'object', properties: { text: { type: 'string' } },
      required: ['text'], additionalProperties: false,
    },
    async execute(_call, { text }) {
      const count = text.trim() ? text.trim().split(/\s+/u).length : 0;
      return { content: [{ type: 'text', text: String(count) }], details: { count } };
    },
  }),
};
```

Omit the file when no custom tools are needed. A present file needs a defined
default export: named exports alone, `null`, promises and class instances are
not tool maps. A null-prototype object is also accepted.

A factory receives `(sandbox, { models, model, task, native })` and returns a
native `AgentTool` with the same name and `execute()`. `models` is the configured
pi-ai registry; `native` is the pinned Flue module. Names cannot collide with
built-ins or `submit_result`. List the tool in `agent(..., { tools: [...] })`.
Without an explicit list, all declared factories are selected. Tool errors are
visible; do not turn failures into invented successful results.

For native Flue hooks, `worker.mjs` exports a synchronous default function called
inside the worker's render. Named exports alone do not define a hook; omit the
file to opt out. The function must return `undefined`, not a promise. Import
from the pinned graph, never another plugin's or the host's Flue installation:

```js
import { useInstruction } from '@flue/runtime';

export default function (task) {
  useInstruction('Distinguish observed evidence from inference.');
  // Other native hooks belong here, synchronously—not inside execute().
}
```

Recognizable async/generator exports are rejected before native startup. If a
synchronous-looking hook or factory returns a promise or thenable, the run
fails and attempts to wait for the exposed work. Observable work retains the
owner until settlement; a never-settling promise prevents shutdown. Some custom
Promise subclasses cannot be observed. In that case the run reports the cause
and fails, but its background effects are not contained. Inspect and stop them
before retrying. This is failure cleanup, not permission to write async hooks.
Native `AgentTool.execute()` may remain async. Unreturned background work is
not contained or made recoverable. Aborted workers may already have lost their
SDK-internal resources; retaining the run owner does not keep those usable.

Prefer `agent.instructions` for a simple extra instruction; the hook entry is
for capabilities such as native durable tools or deliberately declared MCP/
subagents. See Flue's [agent hooks](https://flueframework.com/docs/reference/agent-hooks-api/)
and [durable tools](https://flueframework.com/docs/guide/tools/#durable-tools).
The kit does not automatically provide web search, host MCP connections,
custom host agent types or their credentials. Extra native tools/subagents can
also introduce work outside the kit's job accounting and effect tracking.

## Operate and re-enter

Use the workspace launcher, not a file inside the plugin cache:

```sh
node /absolute/workflow-space/flue.mjs inspect audit-1
node /absolute/workflow-space/flue.mjs cancel audit-1
node /absolute/workflow-space/flue.mjs resume audit-1
```

- `inspect` reads saved status, actual ownership, receipts, errors, command
  tracking and artifacts. It does not start recovery.
- `cancel` contacts the existing owner, then confirms lock release, clean
  `cancelled`/`finished` execution, terminal workers and quiescent recorded
  command groups. Missing ownership records, cleanup failures or unresolved
  commands are errors, not confirmation. A run that finishes before cancellation
  is reported as `finished`. Cancel does not start recovery or kill surviving
  command groups; inspect retained files and stop old writers explicitly.
- `resume` uses the saved configuration and original installed runtime. It
  re-enters the pinned program from its start and reuses matching submissions.
  Failed/aborted keyed jobs remain terminal. Do not edit executing launchers or
  pinned code, or remove runtime versions still referenced by runs.
- Before recovery, ownership, saved configuration integrity, pinned code/dependency
  lock, retained artifacts, recorded direct working directories and tracked
  native command ownership are checked. Missing/unknown command records or surviving old process groups
  refuse startup. Inspect and stop only positively identified owned processes;
  never delete tracking files to bypass a refusal.
- A supported interrupted native-worker run can reattach after old foreground
  commands stop. The current runner settles its bounded, already-admitted
  worker set before reentering the program and admitting new work. Pending
  workers from a program containing `tools.mjs` or `worker.mjs` are refused
  before startup because their custom effects are not tracked. Do not remove
  those modules to bypass the refusal.
- Saved receipts are checked against Flue's public store before startup. An
  interrupted job without a receipt replays its original keyed request, but
  cannot create a fresh submission. Missing saved work causes a refusal with
  instructions to restore the database or create a new run. This also refuses
  an ambiguous crash just before the original submission was saved.
- If receipt delivery keeps failing, the job stays pending and the run reports
  `Worker receipt is unknown`; it never borrows another submission's outcome.
  Resume can recover the reference once delivery works again.
- These checks are not full database backup validation. Older contents that
  retain the same submission records can still lose later progress. Keep the
  whole run directory intact; do not restore database files independently.
- This is not exact JavaScript continuation or exactly-once external effects.
  Native command tracking does not establish safety for arbitrary custom
  tools, hooks, detached descendants or caller-owned effects. Treat those cases
  as requiring explicit investigation, not automatic retry.

**Verification boundary:** current offline lifecycle regressions pass for the
recovery barrier and pre-start refusals. Same-run interrupted
recovery was demonstrated on an earlier installed build. The final installed
runtime still needs its live recovery proof; earlier receipts do not certify
later code.

## CLI and authentication

| Command | Purpose |
|---|---|
| `check /path/program.mjs` | Syntax-check its program directory; no program or model execution |
| `doctor --model … --auth …` | Validate local runtime/config/credentials; no model request |
| `run /path/program.mjs --id … --cwd … --model … --auth … --access unrestricted` | Create a new run; existing IDs are refused |
| `inspect ID` / `cancel ID` / `resume ID` | Operate the saved run; no configuration overrides |

Run options: `--effort low`, `--concurrency 6`, `--max-jobs 1000`, `--timeout 600`
(seconds per worker), and either `--args JSON` or `--args-file PATH`. IDs are
1–48 lowercase letters/digits/hyphens, starting with a letter or digit. Always
quote JSON supplied in shell arguments.

| Explicit choice | Credential source |
|---|---|
| `--model openai-codex/gpt-5.5 --auth pi` | Existing valid OpenAI OAuth record at `~/.pi/agent/auth.json` |
| Same plus `--auth-file /absolute/auth.json` | Deliberately selected existing pi-format file; never make a credential copy for this |
| `--model openai/MODEL --auth env:VARIABLE` | Only that API-key environment variable; explicitly selects API billing |
| `--model anthropic/MODEL --auth env:VARIABLE` | Only that API-key environment variable; explicitly selects API billing |

The provider resolves the selected credential read-only. Expired/missing OAuth
requires the user to log in/refresh through pi separately; the runner cannot do
it and has no paid-key fallback. Claude/Codex login alone does not supply this
pi credential. No host model/context/settings/auth inheritance is implied.
Do not put keys in arguments, programs, `args`, reports, tool results or logs.

| Exit | Meaning |
|---|---|
| `0` | Command succeeded; `run`/`resume` had no counted worker/composition failures. Inspect the **domain result** separately |
| `2` | Counted terminal worker/composition failures, possibly with a useful result file |
| `1` | Fatal failure or refusal; a cancelled `run`/`resume` also exits `1` |

A successful `cancel` command exits `0` to confirm shutdown, not task success;
its owner process may exit `1` for cancellation. Inspect worker outcomes separately.

A program can return `{status: 'failed'}` with exit `0`: domain status is authored
policy, not a runner exit-code convention. Tool failures are reported separately
and may be followed by successful worker repair. Neither exit `0` nor
`execution: 'finished'` proves task correctness or completeness.
