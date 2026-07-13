# design-options

A Claude Code plugin that generates multiple strong design options with explicit tradeoff profiles.

## Why

AI agents tend to present one option (their first idea) or include straw-man alternatives to make the preferred option look good. Anchoring on a single ideal has the same failure one level up: every option becomes a step along one line, and you only choose how far to go, never which direction. This skill enforces the ideals-first method: establish at least two target architectures — what perfect looks like under genuinely different tradeoff profiles — then generate options as stepping stones toward them. Every one is genuinely strong, with explicit tradeoffs and a stated lean. You choose direction and distance, not good and bad.

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
