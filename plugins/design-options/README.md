# design-options

A Claude Code plugin that generates multiple strong design options with explicit tradeoff profiles.

## Why

AI agents tend to present one option (their first idea) or include straw-man alternatives to make the preferred option look good. This skill enforces the "ideal-first" method: establish what perfect looks like, then generate options as conscious steps away from the ideal, each with clear tradeoffs.

## The ideal-first method

1. **Find the ideal** — What's the right answer with no constraints?
2. **Name the constraints** — What prevents the ideal?
3. **Generate options as steps toward the ideal** — From a step toward the ideal to near-ideal.
4. **Make tradeoffs explicit** — Gets, Costs, Breaks down when, Rests on.
5. **Share your lean** — Which option you'd choose and why.

Every option must be genuinely strong. The user chooses between good and better, not good and bad.

## Usage

```
/design-options
```

Or: "What are my options for this?"

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install design-options@pandysp
```

## License

MIT
