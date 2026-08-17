# preflight

A Claude Code, Codex, and Pi plugin that makes the agent honestly assess the current state of its work before shipping.

## Why

AI agents have a bias toward wrapping up and calling things done. They'll rationalize incomplete work, defer things that should be fixed now, and skip verification. This skill forces a structured, honest self-assessment first.

The key insight: ask "**how** happy are you?" not "**are** you happy?" The former demands nuance. The latter invites a polite yes.

## Usage

- Claude Code: `/preflight`
- Codex: `$preflight`
- Pi: `/skill:preflight`

Or just ask naturally: "How happy are you with the current state?"

The agent reviews the actual artifacts (not memory) and presents concrete items, split into fix-now vs. file-for-later.

## Installation

See the repository's [Claude Code, Codex, and Pi instructions](../../README.md).

## License

MIT
