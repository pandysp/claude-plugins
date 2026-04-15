# Plugins by pandysp

Workflow plugins for AI coding agents. Works with **Claude Code** and **OpenAI Codex**.

## Available Plugins

| Plugin | Category | Codex | Description |
|--------|----------|:-----:|-------------|
| [verify-claims](./plugins/verify-claims) | Workflow | Yes | Identify and verify unverified claims before presenting them as conclusions |
| [verify-code](./plugins/verify-code) | Workflow | Yes | Black-box end-to-end verification — runs the system and shows evidence |
| [preflight](./plugins/preflight) | Workflow | Yes | Honest self-assessment before shipping |
| [pre-mortem](./plugins/pre-mortem) | Workflow | Yes | Identify how a plan or design could fail before committing |
| [design-options](./plugins/design-options) | Workflow | Yes | Generate multiple strong design options with tradeoff profiles |
| [second-opinion](./plugins/second-opinion) | Workflow | No | Get 1-3 independent second opinions from other models |
| [typescript-lsp](./plugins/typescript-lsp) | Development | No | TypeScript/JavaScript language server |

## Installation

### Claude Code

```bash
# Add the marketplace
/plugin marketplace add pandysp/claude-plugins

# Install a plugin
/plugin install <plugin-name>@pandysp
```

### OpenAI Codex

Copy or symlink individual skills into your Codex skills directory:

```bash
# Clone the repo
git clone https://github.com/pandysp/claude-plugins.git ~/claude-plugins

# Symlink a skill (stays updated with git pull)
ln -s ~/claude-plugins/plugins/verify-claims/skills/verify-claims ~/.agents/skills/verify-claims
```

See [AGENTS.md](./AGENTS.md) for details.

## License

MIT
