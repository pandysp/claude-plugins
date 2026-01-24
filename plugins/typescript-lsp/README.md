# typescript-lsp

A Claude Code plugin that integrates the [TypeScript Language Server](https://github.com/typescript-language-server/typescript-language-server).

## Features

- Go-to-definition for TypeScript/JavaScript symbols
- Find all references
- Hover information with type details
- Document symbols
- Real-time diagnostics

## Requirements

Install the language server:

```bash
npm install -g typescript-language-server typescript
```

## Installation

```bash
# Add the marketplace
/plugin marketplace add pandysp/claude-plugins

# Install the plugin
/plugin install typescript-lsp@pandysp
```

## Supported Files

- `.ts`, `.tsx` - TypeScript
- `.js`, `.jsx` - JavaScript
- `.mts`, `.cts` - TypeScript ESM/CJS
- `.mjs`, `.cjs` - JavaScript ESM/CJS

## License

MIT
