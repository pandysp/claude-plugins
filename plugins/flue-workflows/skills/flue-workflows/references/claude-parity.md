# Claude workflow comparison

**Baseline:** the delivered workflow-authoring reference and exercised primitive
contract captured from **Claude Code 2.1.263**. This is not an inventory of every
current Claude internal, a complete system-prompt capture, or a quality/cost
benchmark. The shared guidance here is an original adaptation, not a copy of the
captured prompt or research program.

Claude already has a primitive kit. The distinction is **execution mechanism
versus authored policy**, not a rigid Claude engine versus flexible JavaScript.
Both approaches leave discovery, branching, checks, voting and stopping rules in
ordinary code.

“Present” below means implemented in the current plugin surface. See the
[live verification](../../../README.md#live-verification) for the tested Pi path.
Claude/Codex authoring and host-specific discovery/UI have not been independently
tried. They are untested differences, not additional gates for this shared-runner
workflow; complete native-feature parity is not claimed.

## What matches, what differs, what closes the gap

| Area | Current plugin | Difference or work needed |
|---|---|---|
| Main assistant | Stays outside Flue and owns the task, program and user interaction. | Same division of responsibility at the authoring level; no added supervisor model. |
| Ordinary programs | JavaScript branches, loops, dynamic fan-out and per-call prompts/options. No fixed role, phase or voting catalog. | The program exports `default async (run, args)` rather than running inside Claude's native Workflow tool. A host adapter could translate invocation, but no policy engine is needed. |
| `agent` results | Text without a schema; validated object results through a native Flue data writer and terminating result tool with a schema. | Different runtime/result plumbing. Full option/schema compatibility requires enumerating the native contract and contract tests; the current root-object/Ajv schema boundary is explicit, not a universal converter. |
| `parallel` / `pipeline` | Result-order-preserving barriers and overlapping independent item chains; stages receive prior result, original item and index. | Ordinary item exceptions produce visible `null` results; configuration, limits and cancellation are fatal. Keep source-equivalence/error fixtures rather than assuming every native failure behaves identically. |
| Child programs | `workflow(name, args)` composes pinned modules with shared admission limits and cancellation. | Child call namespaces include their invocation order. This is program composition, not a separately managed native host task/session tree. A host adapter would need identity, display and cancellation mapping. |
| Tools | Native Flue read/write/edit/bash/grep/glob, plus explicit custom factories and synchronous Flue hooks. | Claude's host tool registry, web tools, MCP, skills and approvals are not automatically imported. Closing each gap needs an explicit adapter, permission/config mapping and a live tool test—not just matching the tool name. |
| Models and effort | Per-call model/effort under the run's explicitly selected provider and pinned model catalog. | No host-model inheritance or arbitrary cross-provider run. Add per-host model/effort resolution and an explicit provider-to-credential map before supporting broader inheritance/mixing; verify supported levels and reject unavailable models. |
| Context and instructions | Task prompt, explicit instructions/data and the worker's local Flue environment. | No automatic transfer of the main conversation, Claude system prompt or host memory/settings. Matching the intended native inheritance requires a documented per-host allowlist, authority boundaries and context-provenance tests. Do not assume native workers inherit the entire conversation. |
| Authentication | Explicit read-only existing pi OpenAI OAuth, or a deliberately chosen API-key variable for OpenAI/Anthropic. | A Claude/Codex login alone is not a worker credential source. Additional subscription sources need supported read-only resolvers with preventive no-refresh/no-copy tests. Never close this gap by silently switching billing routes. |
| Coding workspaces | Independent Git copies preserve history and current dirty/non-ignored untracked inputs; retained workspaces and patches are not automatically merged. | Not a claim of native Claude worktree UX equivalence. Stable artifact publication and optional host diff/apply views need their own tests. Git copies do not contain unrestricted host access. |
| Progress / operation | Structured stderr/events, stdout inspection summary, `inspect`/`cancel`/`resume` and persisted worker identities. | No native workflow panel or host task notifications. A host adapter could wrap the same run id and journal. |
| Budget | Persisted worker-admission ceiling, concurrency and worker timeouts. `spent()` counts saved jobs; `remaining()` permits new jobs only. | Not token/cost accounting or full native `budget` parity. Verify the captured native fields/semantics, then add provider usage accounting, explicit units and enforcement tests across retries/reuse/custom model calls. Never substitute worker counts for token usage. |
| Worker recovery | Flue persists accepted submissions; `resume` re-dispatches the same keyed request and Flue returns the existing one. Old shell process groups block reentry. | Covered by the automated real-Flue suite (hard kill with submission identity preserved, SIGTERM, receipt-free keyed replay). Not exactly-once external effects. |
| Program recovery | Reentry from the beginning with pinned code/configuration and matching saved job identities/results. | No stack, timing or completion-order checkpoint, and no exactly-once external effects. Native Claude hard-crash continuation was not established by the reference capture either. Stronger program recovery needs a separately chosen durable execution mechanism and effect semantics; it is not a small host-UI adapter. |
| Coverage and quality | Authors report discovered, selected, attempted, failed, omitted and out-of-scope work; examples include independent checks. | This is authored policy, not a runtime guarantee. Fresh-author tests must prove that the guidance yields honest complete/partial/failed reports. Schemas, votes, worker counts and successful execution do not establish truth or completeness. |

## Deliberate boundaries

- One compatible Flue/dependency graph lives in a dedicated workflow workspace,
  outside changing host plugin caches. Lifecycle commands resolve the run's
  original installation.
- Access is unrestricted local execution, explicitly authorized. Containers and
  a security runtime are not part of this implementation.
- No automatic “run a workflow on every task” policy, silent provider fallback,
  automatic patch merge or deletion of retained work.
- The historical research port demonstrated that one native recipe can be
  translated. It did not demonstrate equal answers, fair cost/latency, complete
  host-environment parity or general program continuation.

## Verification boundary

The [live trial](../../../README.md#live-verification) does not establish
automatic discovery in every host, native host UI or context inheritance,
every example branch, or live abrupt-crash recovery.
The additional integrations in the matrix are optional, not delivery gates.
