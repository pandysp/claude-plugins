# Compared with Claude Code's Workflow tool

Both leave discovery, branching, checks, voting and stopping rules in ordinary
code; neither adds a supervisor model or a fixed role catalog. The differences
below decide which one to use and what not to assume when moving a program
between them.

| Area | This plugin | What differs; what to do |
|---|---|---|
| Invocation | A program exports `default async (run, args)` and runs through `flue.mjs`. | Not Claude's native Workflow tool. Programs written for one need their entry point adapted. |
| `agent` results | Text, or an object validated against a JSON Schema with an `object` root and submitted through `submit_result`. | Wrap arrays and scalars in an object. Chat text is never parsed as JSON. |
| `parallel` / `pipeline` | Results keep input order; a thrown item becomes `null`; configuration, limit and cancellation errors stop the run. | Handle `null` explicitly. Don't assume another runtime treats item errors the same way. |
| Child programs | `workflow(name, args)` composes modules from the pinned program directory, sharing limits and cancellation. | Program composition, not a host task tree; the host shows no child tasks. |
| Tools | Flue's read, write, edit, bash, grep and glob, plus custom factories in `tools.mjs` and native hooks in `worker.mjs`. | The host's tools, web search, MCP servers, skills and approvals are not imported. Add what a worker needs explicitly. |
| Models | Per call, under the run's one selected provider and its pinned model catalog. | No host-model inheritance and no mixing providers in one run. |
| Context | The task prompt, explicit `instructions`/`data` and the worker's working directory. | Workers don't see the main conversation, its system prompt or host memory. Put everything they need in the prompt. |
| Authentication | An existing pi login (OpenAI Codex or Anthropic) read-only, or an API-key variable; see [credential sources](api.md#cli-and-authentication). | The host's own Claude Code or Codex login is not used. |
| Coding workspaces | Independent Git copies with history, dirty and untracked inputs; retained patches. | Nothing is merged or deleted automatically. A Git copy is not a sandbox. |
| Progress | Structured stderr, a journal, and `inspect`/`cancel`/`resume`. | No workflow panel or host notifications; poll `inspect`. |
| Budget | A worker-admission ceiling, concurrency and per-worker timeouts. | Not token or cost accounting. |
| Recovery | Flue keeps accepted submissions and retries interrupted ones (up to 3 attempts); `resume` re-enters the program from the start and reuses saved jobs by key. | No JavaScript stack checkpoint and no exactly-once external effects. Write prompts and tools that are safe to repeat. |
| Coverage | Authored policy: report discovered, attempted, failed and omitted work. | A finished run, a valid schema or a vote count does not prove truth or completeness. |

Deliberate boundaries:

- Each run is pinned to the runtime installation that created it, inside the
  workflow workspace and outside host plugin caches. `inspect`, `resume` and
  `cancel` use that runtime.
- Workers have unrestricted local access after explicit approval. No containers
  or command approval UI.
- No automatic workflow on every task, no silent provider fallback, no automatic
  patch merge, no deletion of retained work.
