# align

A Claude Code plugin that makes the agent surface its task interpretation, approach, source coverage, rendering choices, and gap-fill defaults *before* producing any artifact.

## Why

By the time you see prose, the agent has already silently committed to a hundred small things: how it read your request, what method it chose, where it filled gaps, what register it picked. Each commitment looks authoritative once written. You're left reverse-engineering what was given vs. what was made up.

This skill inverts that. The agent produces a **manifest** first — a structured, scannable summary of every silent commitment. You react. The draft happens only after you're aligned.

## What the manifest contains

Five blocks, with each item tagged `[grounded]`, `[inferred]`, or `[mine]`:

1. **My read of the task** — paraphrased request, success criteria, audience
2. **My approach** — method, scope, what's explicitly NOT being done
3. **What I'm working with** — source coverage + an explicit "what I'd invent if not stopped" callout
4. **How I'd render it** — shape (length/structure) plus a sample sentence or signature
5. **Blocking questions** — only the ones that genuinely block

## Usage

```
/align
```

Or just ask naturally: "let's align first", "mirror what you're hearing", "check in before you start".

The agent will produce the manifest, stop, and wait for you to confirm, correct, or re-scope. No drafting until alignment.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install align@pandysp
```

## License

MIT
