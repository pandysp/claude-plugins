# spec

A Claude Code plugin that writes the implementation spec — the structured document that drives execution after design is chosen.

## Why

Plans written ad-hoc tend to forget the load-bearing pieces: existing utilities to reuse, concrete verification steps, the context that justifies the work. This skill enforces a structure that catches scope creep, missed reuse opportunities, and vague verification before any code is written.

## Structure

A spec answers five questions:

1. **Context** — Why this change exists.
2. **Approach** — The chosen path (alternatives were resolved earlier).
3. **Files to modify** — What changes and why.
4. **Existing utilities to reuse** — What you're leveraging instead of writing.
5. **Verification** — How to know it works.

Concise enough to scan, detailed enough to execute. If the spec exceeds two screens, split the work.

## Usage

```
/spec
```

Or: "Write the spec for this." / "Draft the implementation plan."

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install spec@pandysp
```

## License

MIT
