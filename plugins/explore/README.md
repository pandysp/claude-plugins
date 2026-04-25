# explore

A Claude Code plugin that enforces a "map the terrain before designing" discipline. The agent systematically explores the existing terrain — codebase, document corpus, strategy landscape — before generating design options or starting implementation.

## Why

Without explicit exploration, the agent designs from general priors rather than the actual terrain. The result: options that look reasonable in the abstract but don't fit how this codebase / this client / this domain actually works. Post-design correction is more expensive than pre-design grounding.

This skill enforces exploration as a discrete step: **find what's relevant, trace how it connects, identify conventions, name hard limits — then hand off to design.**

## What it does

Four phases, adapted to the domain:

1. **Locate** — what artifacts, sources, prior work are in play?
2. **Trace** — how do things connect? What depends on what?
3. **Pattern** — what conventions and recurring shapes constrain design?
4. **Constrain** — what hard limits would create problems if violated?

Works for any structured problem space: coding, writing, strategy decisions, research, anything with non-trivial existing context to respect.

## Output design

The output is mostly **for the agent's own grounding**, not a deliverable for the user. Only **surprises, hard constraints, and gotchas** surface to the user. If exploration was uneventful, the report is just *"mapped the terrain, no surprises, ready for next steps."*

This is deliberate — exploration findings exist to ground design choices, not to be reviewed line-by-line.

## Usage

```
/explore
```

Or just describe what you're about to design — the skill should fire automatically before substantive design or planning steps.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install explore@pandysp
```

## License

MIT
