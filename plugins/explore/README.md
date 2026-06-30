# explore

A Claude Code plugin that enforces a "map the terrain before designing" discipline. The agent systematically explores what already exists (codebase, document corpus, strategy landscape) before generating design options or starting implementation.

## Why

Without explicit exploration, the agent designs from general priors rather than the actual terrain. The result: options that look reasonable in the abstract but don't fit how this codebase / this client / this domain actually works. Post-design correction is more expensive than pre-design grounding.

## Output design

The exploration is mostly **for the agent's own grounding**, not a deliverable. Only surprises, hard constraints, and gotchas surface to you; if exploration was uneventful, the report is just *"mapped the terrain, no surprises."*

## Usage

```
/explore
```

Or just describe what you're about to design. The skill fires automatically before substantive design or planning steps.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install explore@pandysp
```

## License

MIT
