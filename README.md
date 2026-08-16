# Claude Code, Codex, and Pi Plugins by pandysp

A multi-host collection of plugins with shared skill sources: native
marketplaces for Claude Code and Codex, and a native package for Pi.

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

## Pi installation

```bash
# Install the package (add -l to install into project settings)
pi install git:github.com/pandysp/claude-plugins

# Pin a tag or commit, or roll back to one
pi install git:github.com/pandysp/claude-plugins@<tag-or-sha>

# Inspect, update, remove
pi list
pi update git:github.com/pandysp/claude-plugins
pi remove git:github.com/pandysp/claude-plugins
```

Pi installs one package per repository rather than individual plugins. The
package exposes its skills as `/skill:<name>` commands and adds no extensions,
prompt templates, or themes. Pi refreshes the checkout at startup, so start a
new session to load changed skills.

## Plugin catalog

| Plugin | Category | Codex | Pi | Description |
|--------|----------|-------|----|-------------|
| [align](./plugins/align) | Workflow | yes | yes | Surface what the agent thinks the task is before producing any artifact |
| [explore](./plugins/explore) | Workflow | yes | yes | Map the terrain before designing — locate, trace, pattern, constrain |
| [clarify](./plugins/clarify) | Workflow | yes | yes | Resolve underspecified decisions with targeted questions before designing |
| [design-options](./plugins/design-options) | Workflow | yes | yes | Generate multiple strong design options with tradeoff profiles, anchored against at least two ideal targets |
| [pre-mortem](./plugins/pre-mortem) | Workflow | yes | yes | Identify how a plan or design could fail before committing |
| [second-opinion](./plugins/second-opinion) | Workflow | yes | yes | Get an independent review through the strongest channel the host provides |
| [steel-man-own-position](./plugins/steel-man-own-position) | Workflow | yes | yes | Restate the strongest version of a prior position before flipping under pushback |
| [spec](./plugins/spec) | Workflow | yes | yes | Write the implementation spec that drives execution after design is chosen |
| [verify-claims](./plugins/verify-claims) | Workflow | yes | yes | Identify and verify unverified claims before presenting them as conclusions |
| [verify-result](./plugins/verify-result) | Workflow | yes | yes | Black-box verification of any agent output — code, documents, presentations, configs |
| [silent-failures](./plugins/silent-failures) | Workflow | yes | yes | Audit error handling for silent failures, inadequate feedback, and inappropriate fallbacks |
| [quality-review](./plugins/quality-review) | Workflow | no | no | Audit docs, code, or any artifact through 13 quality lenses with a workflow-backed finder/verifier pipeline |
| [preflight](./plugins/preflight) | Workflow | yes | yes | Honest self-assessment of completeness, correctness, quality, and loose ends before shipping |
| [handoff](./plugins/handoff) | Workflow | yes | yes | Write a durable handoff — PR descriptions, summaries, memos, or memory notes |
| [reflect](./plugins/reflect) | Workflow | yes | yes | Capture durable lessons from a session before they fade |
| [understudy](./plugins/understudy) | Workflow | yes | yes | Write code, comments, tests, and commits that read as if the project's own maintainer wrote them |
| [worktrunk-hook](./plugins/worktrunk-hook) | Tooling | no | no | Route Claude Code's auto-created git worktrees through worktrunk so sessions inherit project hooks |
| [drive-browser](./plugins/drive-browser) | Tooling | yes | no | Drive a browser with Playwright. Resilient locators for your own app, a vision loop for opaque sites |
| [transcribe](./plugins/transcribe) | Tooling | no | no | Turn recordings into speaker-labelled markdown notes with AssemblyAI, with the language detected rather than assumed |

## Withheld

Six plugin/host combinations are deliberately not shipped. `scripts/generate.rb`
holds the declaration; a plugin that states neither support nor a reason fails CI.

- `quality-review` (Codex, Pi): high, xhigh, and max reviews invoke Claude's
  `Workflow` tool. A main-model fallback would not preserve the finder/verifier
  contract.
- `worktrunk-hook` (Codex, Pi): hooks only, and it needs Claude Code's
  `WorktreeCreate` and `WorktreeRemove` events.
- `drive-browser` (Pi): Playwright runs over `bash`, but the vision loop also
  needs a browser runtime and screenshots returned to the model. Unverified on Pi.
- `transcribe` (Codex, Pi): the only plugin here that runs a script it ships,
  which means locating that script inside its own bundle. It does that through
  `CLAUDE_PLUGIN_ROOT`, which only Claude Code sets, and neither host's
  equivalent has been exercised. Nothing about the skill is Claude-specific
  otherwise, so this is a verification gap rather than a capability one.

Four skills pick host mechanics by capability and work on all three hosts:
`explore` falls back from exploration workers to search and file reads,
`second-opinion` to a labelled self-critique when no reviewer channel exists,
`silent-failures` carries its methodology in its own `SKILL.md`, and `reflect`
follows the host's own instruction hierarchy.

## Development

```bash
ruby scripts/generate.rb    # rewrite the Codex and Pi packages
ruby scripts/validate.rb    # check everything, including generated-file drift
```

[`scripts/generate.rb`](./scripts/generate.rb) derives the Codex manifests and
marketplace and the Pi package from the Claude metadata. Its `HOST_SUPPORT`
table is the only place host support is declared: a plugin missing from it fails
validation, so nothing reaches Codex or Pi by accident. CI runs both scripts and
checks that `npm install` leaves a Pi checkout clean.

## License

MIT