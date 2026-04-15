# verify-claims

A Claude Code plugin that catches unverified claims in Claude's own responses and forces verification before presenting them as conclusions.

## Why

AI agents construct narratives — plausible stories from pattern-matching — and present them as analysis. "Make.com changed their enforcement" sounds like a diagnosis but is actually a guess. This skill forces the agent to identify its claims, plan how to verify each one, and execute that verification. Claims get classified as VERIFIED, PARTIAL, INCONCLUSIVE, DISPROVEN, or UNVERIFIABLE.

## What it does

1. Scans responses for factual assertions (causal, state, historical, attribution, hedged)
2. Tests each claim: "What is my proof for this?"
3. Plans verification using the right method per claim type
4. Executes verification and classifies results
5. Reports what's proven, what isn't, and what can't be checked

## Usage

```
/verify-claims
```

Or just say: "Check your claims." / "Back that up." / "Prove it."

Also self-invokes proactively after analysis, diagnosis, or causal reasoning.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install verify-claims@pandysp
```

## License

MIT
