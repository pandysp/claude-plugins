# handoff

A Claude Code plugin that writes durable handoffs for work that's about to ship — PR descriptions, summaries, memos, or memory notes. Tells the next reader what was built, why, what changed, and what's next.

## Why

The agent is good at writing code. Not always great at writing documentation about that code. PR descriptions get terse, summaries get verbose, decisions get lost, test plans become "test the feature." This plugin enforces a structure that surfaces what matters: what was built, key decisions and why, files modified and the purpose of each change, suggested next steps.

## What it does

Four questions, answered in order:

1. **What was built** — plain language, not commit paraphrase
2. **Key decisions and why** — what we chose, what we didn't
3. **Files modified and why** — purpose, not just paths
4. **Suggested next steps** — follow-ups, deferred work, gaps

Adapts to the audience (reviewer, future-self, stakeholder, memory note) and the format (PR, commit message, slack update, project note).

## Usage

```
/handoff
```

Or just describe what you're wrapping up. Fires automatically when shipping substantive work.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install handoff@pandysp
```

## License

MIT
