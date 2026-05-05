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
| [verify-claims](./plugins/verify-claims) | Workflow | Identify and verify unverified claims before presenting them as conclusions |
| [verify-result](./plugins/verify-result) | Workflow | Black-box verification of any agent output — code, documents, presentations, reports, configs |
| [second-opinion](./plugins/second-opinion) | Workflow | Get 1-3 independent second opinions from other models |
| [preflight](./plugins/preflight) | Workflow | Honest self-assessment before shipping |
| [pre-mortem](./plugins/pre-mortem) | Workflow | Identify how a plan or design could fail before committing |
| [design-options](./plugins/design-options) | Workflow | Generate multiple strong design options with tradeoff profiles |
| [typescript-lsp](./plugins/typescript-lsp) | Development | TypeScript/JavaScript language server |

## License

MIT
