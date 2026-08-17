# clarify

A Claude Code, Codex, and Pi plugin that enforces an "exhaust questions before designing" discipline. After understanding what's being asked and what terrain it's working in, the agent surfaces the remaining synthesis questions and gets your input before locking in a design.

## Why

The most expensive design failures aren't bad options. They're options committed to around a hidden assumption. By the time you see a draft, the silent commitment is baked in. Catching ambiguities up front (with specific questions and defaults you can wave through) is much cheaper than reverse-engineering them after.

## Usage

- Claude Code: `/clarify`
- Codex: `$clarify`
- Pi: `/skill:clarify`

Or just describe what you're about to design. The skill fires automatically before substantive design or planning steps. Works for any structured problem space: code, writing, strategy, planning.

## Installation

See the repository's [Claude Code, Codex, and Pi instructions](../../README.md).

## License

MIT
