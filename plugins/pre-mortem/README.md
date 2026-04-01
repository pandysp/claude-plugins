# pre-mortem

A Claude Code plugin that forces systematic risk identification before committing to a plan or design.

## Why

Optimism bias is real. "Will this work?" biases toward yes. This skill flips the question: "Imagine it already failed — what went wrong?" This surfaces risks that cheerful planning would hide.

## What it does

1. States what's being evaluated and what success looks like
2. Generates failure scenarios across technical, design, integration, human, and operational categories
3. Ranks by danger (likelihood x impact x detectability)
4. Identifies detection strategies — how would you know it failed?
5. Recommends: proceed, mitigate, or reconsider

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
