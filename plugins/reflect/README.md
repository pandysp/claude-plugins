# reflect

A Claude Code plugin that makes the agent honestly assess the current state of its work.

## Why

AI agents have a bias toward wrapping up and calling things done. They'll rationalize incomplete work, defer things that should be fixed now, and skip verification. This skill forces a structured, honest self-assessment before shipping.

The key insight: ask "**how** happy are you?" not "**are** you happy?" — the former demands nuance, the latter invites a polite yes.

## What it surfaces

- Incomplete spec implementation
- Missing verifications
- Bugs and edge cases
- Quality concerns (corners cut, unnecessary complexity)
- Improvement ideas — categorized as "fix now" vs. "file for later"

## Usage

```
/reflect
```

Or just ask naturally: "How happy are you with the current state?"

The agent will review actual files and diffs (not just memory), assess across completeness/correctness/quality/verification dimensions, and present concrete actionable items.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install reflect@pandysp
```

## License

MIT
