# pandysp Plugins

Workflow plugins for AI coding agents. Each plugin is a standalone skill that works with both Claude Code and OpenAI Codex.

## Available Plugins (Codex-compatible)

| Plugin | Description | Install |
|--------|-------------|---------|
| [verify-claims](./plugins/verify-claims) | Catch and verify unverified claims before presenting them as conclusions | `plugins/verify-claims` |
| [verify-code](./plugins/verify-code) | Black-box end-to-end verification — run the system, show evidence | `plugins/verify-code` |
| [preflight](./plugins/preflight) | Honest self-assessment before shipping | `plugins/preflight` |
| [pre-mortem](./plugins/pre-mortem) | Identify how plans could fail before committing | `plugins/pre-mortem` |
| [design-options](./plugins/design-options) | Generate strong design options with explicit tradeoff profiles | `plugins/design-options` |

## Codex Installation

Each plugin directory contains a `.codex-plugin/plugin.json` manifest and a `skills/` directory with SKILL.md files.

To use a skill in Codex CLI, copy or symlink the skill directory:

```bash
# Example: install verify-claims
git clone https://github.com/pandysp/claude-plugins.git /tmp/pandysp-plugins
cp -r /tmp/pandysp-plugins/plugins/verify-claims/skills/verify-claims ~/.agents/skills/

# Or symlink for automatic updates
ln -s /path/to/claude-plugins/plugins/verify-claims/skills/verify-claims ~/.agents/skills/verify-claims
```

## Claude Code-only Plugins

These plugins use Claude Code-specific features and are not available for Codex:

- **second-opinion** — Spawns parallel Opus subagents for independent review (requires Claude Code Agent tool)
- **typescript-lsp** — TypeScript language server integration (requires Claude Code LSP system)
