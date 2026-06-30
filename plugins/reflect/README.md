# reflect

A Claude Code plugin that captures durable lessons from a session before they fade. Insights are perishable. The session that produced them is the only context where they're sharp.

## Why

Reflection is the most-skipped phase because it has no immediate payoff. By the next session, the friction is forgotten and the insight is gone. This plugin enforces a small structured pass at session end, and its output is artifacts (memory entries, note updates, CLAUDE.md changes), not chat output that disappears.

## Usage

```
/reflect
```

Or naturally: "what did we learn", "lessons learned", "should we update CLAUDE.md".

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install reflect@pandysp
```

## License

MIT
