# verify-claims

A Claude Code, Codex, and Pi plugin that catches unverified claims in the agent's own responses and forces verification before presenting them as conclusions.

## Why

AI agents construct narratives (plausible stories from pattern-matching) and present them as analysis. "Make.com changed their enforcement" sounds like a diagnosis but is actually a guess. This skill forces the agent to find proof for each claim, and to classify what it can't prove as exactly that instead of restating it as a conclusion.

## Usage

- Claude Code: `/verify-claims`
- Codex: `$verify-claims`
- Pi: `/skill:verify-claims`

Or just say: "Check your claims." / "Back that up." / "Prove it."

Also self-invokes when a claim is about to become the foundation for action.

## Installation

See the repository's [Claude Code, Codex, and Pi instructions](../../README.md).

## License

MIT
