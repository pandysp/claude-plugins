# reflect

A Claude Code plugin that captures durable lessons from a session before they fade. Insights are perishable — the session that produced them is the only context where they're sharp.

## Why

Reflection is the most-skipped phase because it has no immediate payoff. By the next session, the friction is forgotten and the insight is gone. This plugin enforces a small structured pass at session end: what surprised me, what friction repeated, what CLAUDE.md update would have prevented something, what pattern is worth naming, what's worth saving as a durable note.

The output is artifacts — memory entries, note updates, CLAUDE.md changes — not just chat output that disappears.

## What it does

Five questions, asked only when they have signal:

1. What surprised me?
2. What friction repeated?
3. What CLAUDE.md update would have prevented today's friction?
4. What pattern emerged worth naming?
5. What's worth saving as a durable note?

Skip questions that don't have real material. Don't manufacture lessons.

## Usage

```
/reflect
```

Or naturally: "what did we learn", "lessons learned", "should we update CLAUDE.md".

The skill identifies the right artifact location for each insight (CLAUDE.md, project notes, memory, daily memory, or tooling ticket).

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install reflect@pandysp
```

## License

MIT
