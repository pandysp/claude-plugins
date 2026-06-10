# second-opinion

A Claude Code plugin that spawns 1-3 independent reviewers to challenge and sharpen the agent's thinking before presenting to the user.

## How it works

The agent distills the current context and sends it to 1-3 reviewer subagents running in parallel — fresh Claude Fable instances with no stake in the original reasoning. The reviewers critically evaluate the approach and suggest alternatives; the agent synthesizes the feedback internally. You see improved reasoning, not raw reviewer output.

## Usage

```
/second-opinion      # 1 reviewer
/second-opinion 3    # 3 reviewers in parallel
```

Or naturally: "get a second opinion", "another perspective on this". The agent also uses the skill proactively during design and plan review phases.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install second-opinion@pandysp
```

## Philosophy

Every reviewer is injected with principles that prevent defaulting to shallow pragmatism:

- Think in terms of the **ideal** first, then work backward to what's feasible
- Aim for **clean, correct, and elegant** — no quick fixes or workarounds
- Go **deep**, not broad
- Be **direct** — challenge flawed approaches without hedging
- **Ground in evidence** — open the files, fetch the sources, verify load-bearing claims

## License

MIT
