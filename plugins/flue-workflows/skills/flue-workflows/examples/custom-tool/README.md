# Add one native tool

This example teaches the `tools.mjs` seam, not a reason to delegate arithmetic
to a model. A worker calls a pure `text_facts` tool, returns structured fields,
and the ordinary calling program checks those fields with Node. A separate
consumer check also requires a recorded native tool completion.

There is no new worker loop, tool server, schema converter or fixed role.
The default export of `tools.mjs` is an object mapping names to synchronous
factories returning native `AgentTool` objects. Each factory can receive
`(sandbox, { models, model, task, native })`;
this pure tool needs neither the sandbox nor context. See the
[API contract](../../references/api.md#custom-tools-and-native-hooks).

## Run on non-sensitive sample text

Set `SKILL` to the installed skill directory and choose an unused `ROOT`.
The source directory can be empty: this example neither reads nor edits files.

```sh
SKILL=/absolute/path/to/skills/flue-workflows
ROOT=/absolute/new-flue-tool-example
mkdir "$ROOT"
mkdir "$ROOT/source"
cp -R "$SKILL/examples/custom-tool" "$ROOT/program"
printf '%s\n' '{"text":"café 🌱"}' > "$ROOT/args.json"
node "$SKILL/scripts/setup.mjs" "$ROOT/workflow-space"
node "$ROOT/workflow-space/flue.mjs" doctor --model openai-codex/gpt-5.5 --auth pi
node "$ROOT/workflow-space/flue.mjs" check "$ROOT/program/program.mjs"
node "$ROOT/workflow-space/flue.mjs" run "$ROOT/program/program.mjs" \
  --id text-1 --cwd "$ROOT/source" \
  --model openai-codex/gpt-5.5 --auth pi --access unrestricted \
  --args-file "$ROOT/args.json"
node "$ROOT/workflow-space/flue.mjs" inspect text-1 > "$ROOT/inspection.json"
node "$ROOT/program/verify.mjs" "$ROOT/inspection.json" "$ROOT/args.json"
```

Authentication must already be valid. `--auth pi` selects the runner's read-only
pi OpenAI OAuth route, not the main host's login. Do not copy credentials, put
keys in arguments or use secrets as the text to hash. Hashing is not a substitute
for keeping credentials out of artifacts.

The result is complete only if all three fields match the caller's computation;
it is failed if the worker fails or returns wrong facts. This single-item
example has no partial-success case or omitted work. The
[coding example](../../../../README.md#a-disposable-coding-example) demonstrates
partial outcomes, explicit omissions and a multi-item coverage ledger.
`verify.mjs` throws on an incomplete run, wrong values, or missing native tool
completion. A valid JSON shape or model assertion alone does not pass it.

## Boundaries

- `tools: ['text_facts']` selects this tool; the runtime also supplies its
  structured final-result tool. This is not OS containment: custom tool code
  remains trusted JavaScript with host access.
- The raw tool schema is separate from the worker's final-result schema.
  `content` is what the worker sees; `details` carries structured tool data.
- Finished matching jobs can be reused. Current recovery refuses pending work
  when `tools.mjs` or `worker.mjs` exists, even for this pure tool: it does not
  infer arbitrary module purity. Do not remove the module to bypass that check.
- Syntax checks are not live proof. This example still requires final installed
  runtime and consumer-side live verification before a release claim.
