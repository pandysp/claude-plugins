# second-opinion

A Claude Code plugin that spawns 1-3 independent reviewers to challenge and sharpen the agent's thinking before presenting to the user.

## How it works

When invoked, the agent distills the current context and sends it to independent reviewers running in parallel. The reviewers critically evaluate the approach and suggest alternatives. The agent then synthesizes the feedback internally — the user sees improved reasoning, not the raw reviewer output.

## Backends

| Backend | Model | Mechanism |
|---------|-------|-----------|
| `opus` | Claude Opus | Agent tool subagent |
| `codex` | OpenAI (via Codex CLI) | `mcp__codex__codex` MCP tool |

Codex backend requires the [Codex MCP server](https://github.com/anthropics/claude-code/tree/main/packages/mcp-server-codex) to be configured.

## Usage

```
/second-opinion              # 1 opus reviewer (default)
/second-opinion opus codex   # 2 reviewers in parallel
/second-opinion opus opus codex  # 3 reviewers in parallel
```

The agent also uses this skill proactively during design and plan review phases.

## Installation

```bash
# Add the marketplace (if not already added)
/plugin marketplace add pandysp/claude-plugins

# Install the plugin
/plugin install second-opinion@pandysp
```

## Philosophy

Every reviewer is injected with principles that prevent defaulting to shallow pragmatism:

- Think in terms of the **ideal** first, then work backward to what's feasible
- Aim for **clean, correct, and elegant** — no quick fixes or workarounds
- Go **deep**, not broad
- Be **direct** — challenge flawed approaches without hedging
- **Creative, unconventional** solutions are welcome

## License

MIT
