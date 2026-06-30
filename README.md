# Claude Plugins by pandysp

A collection of Claude Code plugins.

## Installation

```bash
# Add the marketplace
/plugin marketplace add pandysp/claude-plugins

# Install a plugin
/plugin install <plugin-name>@pandysp
```

## Available Plugins

| Plugin | Category | Description |
|--------|----------|-------------|
| [align](./plugins/align) | Workflow | Surface what the agent thinks the task is before producing any artifact |
| [explore](./plugins/explore) | Workflow | Map the terrain before designing — locate, trace, pattern, constrain |
| [clarify](./plugins/clarify) | Workflow | Resolve underspecified decisions with targeted questions before designing |
| [design-options](./plugins/design-options) | Workflow | Generate multiple strong design options with tradeoff profiles, anchored on the ideal |
| [pre-mortem](./plugins/pre-mortem) | Workflow | Identify how a plan or design could fail before committing |
| [second-opinion](./plugins/second-opinion) | Workflow | Spawn 1-3 independent reviewers from other models for critical perspectives |
| [steel-man-own-position](./plugins/steel-man-own-position) | Workflow | Restate the strongest version of a prior position before flipping under pushback |
| [spec](./plugins/spec) | Workflow | Write the implementation spec that drives execution after design is chosen |
| [verify-claims](./plugins/verify-claims) | Workflow | Identify and verify unverified claims before presenting them as conclusions |
| [verify-result](./plugins/verify-result) | Workflow | Black-box verification of any agent output — code, documents, presentations, configs |
| [silent-failures](./plugins/silent-failures) | Workflow | Audit error handling for silent failures, inadequate feedback, and inappropriate fallbacks |
| [preflight](./plugins/preflight) | Workflow | Honest self-assessment of completeness, correctness, quality, and loose ends before shipping |
| [handoff](./plugins/handoff) | Workflow | Write a durable handoff — PR descriptions, summaries, memos, or memory notes |
| [reflect](./plugins/reflect) | Workflow | Capture durable lessons from a session before they fade |
| [understudy](./plugins/understudy) | Workflow | Write code, comments, tests, and commits that read as if the project's own maintainer wrote them |
| [worktrunk-hook](./plugins/worktrunk-hook) | Tooling | Route Claude Code's auto-created git worktrees through worktrunk so sessions inherit project hooks |
| [drive-browser](./plugins/drive-browser) | Tooling | Drive a browser with Playwright. Resilient locators for your own app, a vision loop for opaque sites |

## Development

```bash
ruby scripts/validate.rb
```

CI runs the same validation on pull requests and pushes to `main`.

## License

MIT
