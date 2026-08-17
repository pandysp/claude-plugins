# second-opinion

A Claude Code, Codex, and Pi plugin that gets an independent review of the agent's thinking before presenting it to the user.

## How it works

The skill chooses the strongest independent channel the host provides: a full-transcript advisor first, fresh peer-strength reviewers second, and a clearly labelled self-critique only when no independent channel exists. Reviewers critically evaluate the approach and suggest alternatives; the agent synthesizes the feedback internally. You see improved reasoning, not a raw reviewer transcript.

## Usage

- Claude Code: `/second-opinion`
- Codex: `$second-opinion`
- Pi: `/skill:second-opinion`

Or naturally: "get a second opinion", "another perspective on this". The agent also uses the skill proactively during design and plan review phases.

## Installation

See the repository's [Claude Code, Codex, and Pi instructions](../../README.md).

## Philosophy

Every reviewer is injected with principles that prevent defaulting to shallow pragmatism:

- Think in terms of the **ideal** first, then work backward to what's feasible
- Aim for **clean, correct, and elegant**: no quick fixes or workarounds
- Go **deep**, not broad
- Be **direct**: challenge flawed approaches without hedging
- **Ground in evidence**: open the files, fetch the sources, verify the claims that carry weight

## License

MIT
