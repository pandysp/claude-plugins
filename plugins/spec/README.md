# spec

A Claude Code plugin that writes the implementation spec: the structured document that drives execution after design is chosen.

## Why

Plans written ad-hoc tend to forget the essential pieces: existing utilities to reuse, concrete verification steps, and the context that justifies the work. This skill enforces a structure that catches scope creep, missed reuse, and vague verification before any code is written. Concise enough to scan, detailed enough to execute.

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
