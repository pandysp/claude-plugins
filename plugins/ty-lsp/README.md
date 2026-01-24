# ty-lsp

A Claude Code plugin that integrates [ty](https://github.com/astral-sh/ty), the extremely fast Python type checker from Astral (creators of Ruff and uv).

## Features

- Go-to-definition for Python symbols
- Find all references
- Hover information with type details
- Document symbols
- Real-time diagnostics

## Requirements

- [uv](https://github.com/astral-sh/uv) must be installed (for `uvx` command)

The plugin uses `uvx ty@latest server` to automatically fetch and run the latest version of ty.

## Installation

```bash
# Add the marketplace
/plugin marketplace add pandysp/claude-plugins

# Install the plugin
/plugin install ty-lsp@pandysp
```

## Usage

Once installed, Claude Code will automatically use ty for Python files (`.py`, `.pyi`).

Enable the LSP tool if not already enabled:
```bash
export ENABLE_LSP_TOOL=1
```

## Why ty over Pyright?

ty is built by Astral, the team behind Ruff and uv. It's designed to be extremely fast while maintaining compatibility with Python's type system. Early benchmarks show significant performance improvements over Pyright.

## License

MIT
