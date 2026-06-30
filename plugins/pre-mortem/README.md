# pre-mortem

A Claude Code plugin that forces systematic risk identification before committing to a plan or design.

## Why

Optimism bias is real. "Will this work?" biases toward yes. This skill flips the question: "Imagine it already failed. What went wrong?" Failure modes get ranked by likelihood, impact, and detectability, each with a concrete detection strategy. The findings end in a recommendation, not reassurance.

## Usage

```
/pre-mortem
```

Or: "What could go wrong with this approach?"

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install pre-mortem@pandysp
```

## License

MIT
