# steel-man-own-position

A Claude Code plugin that forces the agent to steel-man its own prior position before flipping under pushback — preventing capitulation to critiques that hit a weak flank while the strong core still stands.

## Why

When a previously-stated lean comes under pressure — from user pushback, a reviewer, a second-opinion, web search findings, or the agent's own reconsideration — the natural move is to flip. Sometimes that's right. Often it isn't: the critique hits a decorative argument while the load-bearing one still holds, and the agent flips because the critique *felt* decisive. This skill forces the check.

## What it does

1. Restates the prior lean verbatim and names the load-bearing reason for it.
2. States the triggering argument verbatim.
3. Checks whether the triggering argument refutes the strong core or only a weaker flank.
4. Classifies the argument: new fact / logical error in prior reasoning / genuine blind spot / style preference on a known axis.
5. Flips the lean only if the core is actually refuted *and* the trigger is a substantive one.

## Usage

```
/steel-man-own-position
```

Or just say: "Steel-man your position." / "Hold the line." / "Are you sure?"

Also self-invokes proactively whenever the agent notices itself about to flip a previously-stated lean.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install steel-man-own-position@pandysp
```

## License

MIT
