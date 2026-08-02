# Claude Code and Codex Plugins by pandysp

A dual-host collection of plugins with shared skill sources and native
marketplaces for Claude Code and Codex.

## Claude Code installation

```bash
# Add the marketplace
/plugin marketplace add pandysp/claude-plugins

# Install a plugin
/plugin install <plugin-name>@pandysp
```

Claude Code disables auto-update by default for third-party marketplaces. To
keep these plugins current, run `/plugin`, open **Marketplaces**, select
`pandysp`, and enable auto-update. Claude Code updates plugins on disk in the
background after startup; run `/reload-plugins` when notified, or start a new
session, to load them. Because this marketplace publishes explicit plugin
versions, each release must bump the version before Claude Code installs the
new bundle.

## Codex installation

```bash
# Add the Git marketplace
codex plugin marketplace add pandysp/claude-plugins

# Inspect and install a plugin
codex plugin list --marketplace pandysp --available --json
codex plugin add <plugin-name>@pandysp
```

Codex automatically refreshes configured Git marketplaces on startup. Start a
new Codex session after installation or a plugin version change so it loads the
updated bundle.

The catalog contains all 18 Claude Code plugins. Codex currently offers the 12
with verified host-neutral execution paths and withholds six host-specific
plugins. See [the compatibility report](./CODEX-COMPATIBILITY.md) for the exact
boundary.

## Plugin catalog

| Plugin | Category | Description |
|--------|----------|-------------|
| [align](./plugins/align) | Workflow | Surface what the agent thinks the task is before producing any artifact |
| [explore](./plugins/explore) | Workflow | Map the terrain before designing — locate, trace, pattern, constrain |
| [clarify](./plugins/clarify) | Workflow | Resolve underspecified decisions with targeted questions before designing |
| [design-options](./plugins/design-options) | Workflow | Generate multiple strong design options with tradeoff profiles, anchored against at least two ideal targets |
| [pre-mortem](./plugins/pre-mortem) | Workflow | Identify how a plan or design could fail before committing |
| [second-opinion](./plugins/second-opinion) | Workflow | Spawn 1-3 independent reviewers from other models for critical perspectives |
| [steel-man-own-position](./plugins/steel-man-own-position) | Workflow | Restate the strongest version of a prior position before flipping under pushback |
| [spec](./plugins/spec) | Workflow | Write the implementation spec that drives execution after design is chosen |
| [verify-claims](./plugins/verify-claims) | Workflow | Identify and verify unverified claims before presenting them as conclusions |
| [verify-result](./plugins/verify-result) | Workflow | Black-box verification of any agent output — code, documents, presentations, configs |
| [silent-failures](./plugins/silent-failures) | Workflow | Audit error handling for silent failures, inadequate feedback, and inappropriate fallbacks |
| [quality-review](./plugins/quality-review) | Workflow | Audit docs, code, or any artifact through 13 quality lenses with a workflow-backed finder/verifier pipeline |
| [preflight](./plugins/preflight) | Workflow | Honest self-assessment of completeness, correctness, quality, and loose ends before shipping |
| [handoff](./plugins/handoff) | Workflow | Write a durable handoff — PR descriptions, summaries, memos, or memory notes |
| [reflect](./plugins/reflect) | Workflow | Capture durable lessons from a session before they fade |
| [understudy](./plugins/understudy) | Workflow | Write code, comments, tests, and commits that read as if the project's own maintainer wrote them |
| [worktrunk-hook](./plugins/worktrunk-hook) | Tooling | Route Claude Code's auto-created git worktrees through worktrunk so sessions inherit project hooks |
| [drive-browser](./plugins/drive-browser) | Tooling | Drive a browser with Playwright. Resilient locators for your own app, a vision loop for opaque sites |

## Development

```bash
ruby scripts/generate_codex.rb
ruby scripts/validate.rb
```

The generator derives Codex manifests and the Codex marketplace from the Claude
metadata. CI verifies that generated files are current and validates both host
packages on pull requests and pushes to `main`.

## License

MIT
