# clarify

A Claude Code plugin that enforces a "exhaust questions before designing" discipline. After understanding what's being asked and what terrain we're working in, the agent surfaces remaining synthesis questions — boundaries, edge behavior, trade-offs, integration, hard constraints, audience specifics — and gets user input before locking in a design.

## Why

The most expensive design failures aren't bad options — they're options committed to around a hidden assumption. By the time the user sees a draft, the silent commitment is baked in. Catching ambiguities up front, with specific questions and defaults, is much cheaper than reverse-engineering them after.

## What it does

Six dimensions to scan, each only when load-bearing:

1. **Scope & boundaries** — what's in, out, deferred
2. **Edge & extreme behavior** — unusual conditions
3. **Trade-offs & calibration** — where on a spectrum, how far
4. **Integration with surroundings** — what must fit alongside what
5. **Hard constraints** — what would create downstream problems if violated
6. **Audience specifics** — what the actual consumer needs

Each surfaced question is specific and includes a default where applicable, so the user can answer "default" or pick fast.

## Usage

```
/clarify
```

Or just describe what you're about to design — the skill should fire automatically before substantive design or planning steps.

Works for any structured problem space: code, writing, strategy, planning.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install clarify@pandysp
```

## License

MIT
