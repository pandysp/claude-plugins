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

| Plugin | Description |
|--------|-------------|
| [typescript-lsp](./plugins/typescript-lsp) | TypeScript/JavaScript language server |

## Looking for a Python (ty) plugin?

The ty-lsp plugin previously in this repo has been superseded by the official [Astral plugin](https://github.com/astral-sh/claude-code-plugins), which provides ty integration along with ruff and uv skills.

```bash
# Add the Astral marketplace
/plugin marketplace add astral-sh/claude-code-plugins

# Install the Astral plugin
/plugin install astral@astral-sh
```

## License

MIT
