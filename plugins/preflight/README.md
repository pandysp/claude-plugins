# preflight

A skill for Claude Code, Codex, and Pi that makes the agent honestly assess its work before shipping, with an optional fix-and-reassess loop.

## Why

AI agents have a bias toward wrapping up and calling things done. They'll rationalize incomplete work, defer things that should be fixed now, and skip verification. This skill forces a structured, honest self-assessment first.

The key insight: ask "**how** happy are you?" not "**are** you happy?" The former demands nuance. The latter invites a polite yes.

## Usage

| Host | Assess only | Fix and reassess |
|---|---|---|
| Claude Code | `/preflight` | `/preflight --fix` |
| Codex | `$preflight` | `$preflight --fix` |
| Pi | `/skill:preflight` | `/skill:preflight --fix` |

Or just ask naturally: "How happy are you with the current state?"

Without `--fix`, the agent reviews the actual artifacts (not memory), presents concrete NOW and LATER items, and waits for your decision.

With `--fix`, it fixes actionable NOW issues, verifies the changes, then runs the full preflight again on the updated work. It repeats until a fresh assessment finds no autofixable issues, including any exposed by earlier fixes. The final report lists what changed, the verification, and anything unresolved.

Concrete current-work issues default to NOW. LATER needs a reason it can safely wait, or your explicit decision to defer it. Missing access, approval, or a decision leaves an item blocked NOW, not quietly deferred. The agent finishes independent fixes, then reports any remaining blockers without calling the work ready to ship. `--fix` does not authorize new scope, destructive actions, or bypassing permissions.

## Installation

See the repository's [installation instructions](../../README.md).

## License

MIT
