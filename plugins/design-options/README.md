# design-options

A Claude Code, Codex, and Pi plugin that generates multiple strong design options with explicit tradeoff profiles.

## Why

AI agents tend to present one option (their first idea) or include straw-man alternatives to make the preferred option look good. Anchoring on a single ideal has the same failure one level up: you only choose how far to go, never which direction. This skill enforces the ideals-first method: establish at least two ideal target architectures, each unconstrained but optimizing for different values, then generate options as stepping stones toward them. Every one is genuinely strong, with explicit tradeoffs and a stated lean. You choose direction and distance, not good and bad.

## Usage

- Claude Code: `/design-options`
- Codex: `$design-options`
- Pi: `/skill:design-options`

Or: "What are my options for this?"

## Installation

See the repository's [Claude Code, Codex, and Pi instructions](../../README.md).

## License

MIT
