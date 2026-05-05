# steel-man-own-position

A Claude Code plugin that forces the agent to steel-man its own prior position before flipping under pushback — preventing capitulation to critiques that hit a decorative argument or operate on a different goal than the original decision served.

## Why

When a previously-stated lean comes under pressure — from user pushback, a reviewer, a second-opinion, web search findings, or the agent's own reconsideration — the natural move is to flip. Sometimes that's right. Often it isn't: the critique hits a decorative argument while the load-bearing core still holds, *or* the critique operates on a different goal than the original decision served. The agent flips because the critique *felt* decisive. This skill forces the check.

## What it does

1. Restates the prior lean verbatim, names the load-bearing reason, and the goal it served.
2. States the triggering argument verbatim.
3. Checks whether the trigger refutes the core *on the same goal* — not just a decorative argument or a different axis.
4. Classifies the argument: new fact / logical error in prior reasoning / genuine blind spot / different-axis preference.
5. Flips the lean only if the core is refuted on the same goal *and* the trigger is substantive.

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
