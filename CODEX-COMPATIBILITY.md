# Codex compatibility

This repository packages the same skill sources for Claude Code and Codex. The
Codex marketplace and manifests are generated from the Claude marketplace and
plugin metadata; the files under `skills/`, `agents/`, `hooks/`, and `bin/`
remain the shared source of truth.

The Codex catalog includes all 18 plugins, but only plugins with a verified
execution path are installable. Sixteen are currently `AVAILABLE`; the two
plugins whose core lifecycle Codex cannot execute are `NOT_AVAILABLE`.

## Available in both hosts

The skill sources use host-neutral invocation language. Claude Code exposes
skills as slash commands; Codex exposes them as `$` mentions. Neither syntax is
hard-coded into the shared instructions.

- `align`
- `clarify`
- `design-options`
- `drive-browser`
- `explore`
- `handoff`
- `pre-mortem`
- `preflight`
- `reflect`
- `second-opinion`
- `silent-failures`
- `spec`
- `steel-man-own-position`
- `understudy`
- `verify-claims`
- `verify-result`

Four skills select host mechanics by capability while keeping one semantic
source:

- `explore` uses fresh read-only exploration workers when the host provides
  them and falls back to the host's search and file-reading capabilities.
- `reflect` classifies the insight before choosing the applicable instruction
  file, memory system, project notes, session log, or tooling ticket. It follows
  the host and workspace hierarchy instead of assuming `CLAUDE.md`.
- `second-opinion` prefers a full-transcript independent advisor, then fresh
  peer-strength subagents, then a clearly labelled self-critique. Public
  metadata no longer promises a particular model or tool.
- `silent-failures` keeps the hunter methodology inside the shared `SKILL.md`.
  Claude's named plugin agent is a thin adapter over it; hosts
  without that agent pass the same methodology to a fresh reviewer.

## Catalogued but unavailable in Codex

### `quality-review`

Low and medium reviews run inline. High, xhigh, and max invoke Claude's
`Workflow` tool with `references/audit-workflow.js`. The plugin remains
Claude-native until Codex provides a supported equivalent or this repository
deliberately adopts and verifies another workflow runtime. A weaker
main-model-owned fallback would not preserve the contract.

### `worktrunk-hook`

Codex can create, snapshot, and delete its own managed worktrees, and it already
supplies `CLAUDE_PLUGIN_ROOT` for hook compatibility. The blocker is extension
lifecycle: the plugin's entire behavior depends on Claude Code's
`WorktreeCreate` and `WorktreeRemove` hook events, which Codex does not expose.
A Codex setup script can install dependencies after creation, but it cannot
replace creation with `wt switch`, return a different worktree path, or run
guaranteed teardown before deletion. Do not emulate these semantics with
session hooks. See the current [Codex worktree
lifecycle](https://learn.chatgpt.com/docs/environments/git-worktrees.md) and
[supported hook events](https://learn.chatgpt.com/docs/hooks.md).

## Keeping the host packages synchronized

After changing the Claude marketplace or plugin metadata, regenerate and
validate the Codex package files:

```bash
ruby scripts/generate_codex.rb
ruby scripts/validate.rb
```

Validation fails when generated Codex files drift from their canonical source.
