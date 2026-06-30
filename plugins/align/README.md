# align

A Claude Code plugin that makes the agent surface its task interpretation, approach, source coverage, rendering choices, and gap-fill defaults *before* producing any artifact.

## Why

By the time you see prose, the agent has already silently committed to a hundred small things: how it read your request, what method it chose, where it filled gaps, what register it picked. Each commitment looks authoritative once written. You're left reverse-engineering what was given vs. what was made up.

This skill inverts that. The agent produces a **manifest** first: a structured, scannable summary of every silent commitment, each item tagged `[grounded]`, `[inferred]`, or `[mine]`. You react. The draft happens only after you're aligned.

## Usage

```
/align
```

Or just ask naturally: "let's align first", "mirror what you're hearing", "check in before you start".

The agent produces the manifest, stops, and waits for you to confirm, correct, or re-scope. No drafting until alignment.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install align@pandysp
```

## License

MIT
