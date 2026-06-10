# design-options

A Claude Code plugin that generates multiple strong design options with explicit tradeoff profiles.

## Why

AI agents tend to present one option (their first idea) or include straw-man alternatives to make the preferred option look good. This skill enforces the ideal-first method: establish what perfect looks like, then generate options as conscious steps away from the ideal — every one genuinely strong, each with explicit tradeoffs and a stated lean. You choose between good and better, not good and bad.

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
