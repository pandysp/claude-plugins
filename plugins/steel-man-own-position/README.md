# steel-man-own-position

A Claude Code and Codex plugin that forces the agent to steel-man its own prior position before flipping under pushback.

## Why

When a previously-stated lean comes under pressure (user pushback, a reviewer, search findings, the agent's own doubt), the natural move is to flip. Sometimes that's right. Often the critique hits a decorative argument or operates on a different goal than the original decision served, and the flip happens because the critique *felt* decisive. This skill forces the check: restate the strongest form, then flip only if the core is refuted on the same goal.

## Usage

- Claude Code: `/steel-man-own-position`
- Codex: `$steel-man-own-position`

Or just say: "Steel-man your position." / "Hold the line." / "Are you sure?"

Also self-invokes when the agent notices itself about to flip a previously-stated lean.

## Installation

See the repository's [Claude Code and Codex marketplace instructions](../../README.md).

## License

MIT
