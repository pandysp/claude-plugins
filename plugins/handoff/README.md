# handoff

A Claude Code, Codex, and Pi plugin that writes durable handoffs for work that's about to ship: PR descriptions, summaries, memos, or memory notes. Tells the next reader what was built, why, what changed, and what's next.

## Why

The agent is good at writing code, not always at writing about it. PR descriptions get terse. Summaries get verbose. Decisions get lost. Test plans become "test the feature." This plugin enforces a structure that serves the next reader (reviewer, future you, or teammate) without forcing them to dig through the diff.

## Usage

- Claude Code: `/handoff`
- Codex: `$handoff`
- Pi: `/skill:handoff`

Or just describe what you're wrapping up. Fires automatically when shipping substantive work.

## Installation

See the repository's [Claude Code, Codex, and Pi instructions](../../README.md).

## License

MIT
