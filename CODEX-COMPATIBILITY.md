# Codex compatibility

This repository packages the same skill sources for Claude Code and Codex. The
Codex marketplace and manifests are generated from the Claude marketplace and
plugin metadata; the files under `skills/`, `agents/`, `hooks/`, and `bin/`
remain the shared source of truth.

The Codex catalog includes all 18 plugins, but only plugins with a verified
execution path are installable. Twelve are currently `AVAILABLE`; the six
host-specific plugins documented below are `NOT_AVAILABLE` until adapted and
verified.

## Available in Codex without host-specific changes

These plugins are instruction-only or already describe their dependencies in
host-neutral terms:

- `align`
- `clarify`
- `design-options`
- `drive-browser`
- `handoff`
- `pre-mortem`
- `preflight`
- `spec`
- `steel-man-own-position`
- `understudy`
- `verify-claims`
- `verify-result`

Explicit skill invocation differs by host: Claude Code uses slash commands,
while Codex uses `$` mentions. Existing slash-command trigger phrases remain in
the shared skill descriptions until there is a deliberate cross-host wording
design.

## Catalogued but unavailable in Codex

### `explore`

The workflow names Claude Code's `Explore` subagent and `Grep`/`Read` tools.
Codex needs an explicit mapping to its subagent and filesystem tools before the
same execution contract can be claimed.

### `reflect`

The workflow treats `CLAUDE.md` as the global-instruction destination. Codex
needs a policy for choosing between `AGENTS.md`, Codex memory, and durable notes.

### `second-opinion`

The skill can fall back to any peer-strength independent channel, but its plugin
summary promises fresh Claude reviewers and its trigger text names Fable and the
`Agent` tool. Codex needs neutral metadata and an explicit reviewer-tool mapping
before the same promise can be made there.

### `silent-failures`

The skill hard-codes the Claude plugin agent namespace
`silent-failures:silent-failure-hunter` and the `Agent` tool. The bundled agent
is not yet packaged as a Codex subagent.

### `quality-review`

Low and medium reviews run inline. High, xhigh, and max invoke Claude's
`Workflow` tool with `references/audit-workflow.js`; Codex needs an equivalent
orchestrator before those modes work.

### `worktrunk-hook`

Codex already supplies `CLAUDE_PLUGIN_ROOT` for hook compatibility. The blocker
is lifecycle: the plugin's entire behavior depends on Claude Code's
`WorktreeCreate` and `WorktreeRemove` events, which Codex does not provide. Do
not emulate them with session hooks; creation, teardown, and deletion semantics
must match before this plugin can be enabled safely.

## Keeping the host packages synchronized

After changing the Claude marketplace or plugin metadata, regenerate and
validate the Codex package files:

```bash
ruby scripts/generate_codex.rb
ruby scripts/validate.rb
```

Validation fails when generated Codex files drift from their canonical source.
