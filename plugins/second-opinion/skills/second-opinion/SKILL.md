---
name: second-opinion
description: Get 1-3 independent second opinions from other models to strengthen your own thinking. Use whenever you need a critical review, alternative perspective, or independent validation — whether it's a design, plan, architecture, code, business decision, strategy, writing, or any other topic. Trigger on "second opinion", "another perspective", "ask opus", "ask codex", "independent review", "what would another model think", "review this with another model", or /second-opinion. Also trigger proactively during design and plan review phases when the development workflow calls for a second opinion.
---

# Second Opinion

Spawn 1-3 independent reviewers to provide independent assessments of your thinking before you present to the user. A second opinion is not an adversarial review — it's what a second doctor does: look at the situation fresh, form their own view, tell you where they agree and where they'd do differently. The second opinions are for YOU, not the user — they don't see the raw reviewer output.

## Backends

- **opus**: Claude Opus subagent via the Agent tool (`model: "opus"`)
- **codex**: OpenAI via the Codex MCP tool (`mcp__codex__codex`)

## Invocation

`/second-opinion [backend...]`

Specify 1-3 backends in any combination. Examples:

- `/second-opinion` — 1 opus (default)
- `/second-opinion opus` — 1 opus
- `/second-opinion codex` — 1 codex
- `/second-opinion opus codex` — 2 reviewers in parallel, one of each
- `/second-opinion opus opus codex` — 3 reviewers in parallel

When deciding how many to spawn on your own (e.g., during a design phase), use judgment:

- **1 reviewer**: Quick sanity check, low-stakes decisions, incremental changes
- **2 reviewers**: Important design decisions, plans with significant tradeoffs
- **3 reviewers**: High-stakes architecture, irreversible decisions, anything where being wrong is expensive

When spawning multiple reviewers, **always launch them in parallel** (multiple Agent/MCP calls in the same turn).

## What to send

Distill the situation — don't dump raw conversation. Include:

- What's being decided or evaluated, and why it matters
- The approach under consideration (or the options on the table)
- Constraints, prior decisions, rejected alternatives
- Supporting material if applicable (code snippets, data, drafts)

Each reviewer gets the same context. Their independence comes from separate execution, not different inputs.

## Philosophy injection

Every prompt to every reviewer MUST include these principles. They ensure the reviewer operates at the same standard as the main session, rather than defaulting to shallow pragmatism:

> **Review principles — follow these strictly:**
> - Form your own independent assessment of the situation, as if coming to it fresh. Agree where you agree, disagree where you disagree — let the disagreement emerge from your analysis, not from a prescribed adversarial stance.
> - The team's tradeoff profile is **clean > pragmatic** — calibrate your reasoning to that axis, so any alternative you propose is cleaner rather than cheaper.
> - Think in terms of the ideal first. What's the right answer with no constraints? Then work backward to what's feasible.
> - Aim for clean, correct, and elegant. No quick fixes, workarounds, or hacks — even if they're "pragmatic."
> - Go deep, not broad. Explain mechanisms and root causes, not surface observations.
> - Every option you propose should be strong. Range from a step toward the ideal to the ideal itself. No weak options, no band-aids.
> - Explain the WHY behind every recommendation. Back up claims with reasoning.
> - Be direct when you disagree. Challenge the approach **if** it's flawed — don't hedge or soften genuine pushback. But don't manufacture disagreement either.
> - Creative, unconventional solutions are welcome — even risky ones. Useful beats safe.
> - **Ground in evidence, don't just reason from the summary.** Use your tools. Open referenced files, fetch primary sources, web-search for current practice, precedents, or known failure modes — verify load-bearing claims rather than taking them at face value. The value of a second opinion is bringing in what the author didn't — not re-processing what they gave you.

## Opus mode

Use the Agent tool with `model: "opus"`:

```
Agent(
  model: "opus",
  prompt: """
    You are an independent reviewer providing a second opinion.

    [Inject the full review-principles block from the "Philosophy injection" section verbatim here. Single source of truth — don't paraphrase.]

    Context:
    {your distilled summary}

    Provide:
    1. Your independent assessment of the situation
    2. Where your view aligns with the author's recommendation — and why
    3. Where your view diverges — the specific mechanism, not vague hand-waving
    4. Alternative approaches worth considering, with tradeoffs
    5. Your recommendation
  """
)
```

## Codex mode

Load the tool via ToolSearch first (`select:mcp__codex__codex`), then:

```
mcp__codex__codex(
  prompt: """
    You are an independent reviewer providing a second opinion.

    [same review principles and structure as opus mode]

    Context:
    {your distilled summary}
  """,
  cwd: "{current working directory}"
)
```

## Integrating the responses

The second opinions are YOUR internal input. The user doesn't see them — they see the result of your improved thinking.

### Synthesis across multiple reviewers

When you have 2-3 opinions, look for the signal:

- **Convergence**: If all reviewers independently reach the same conclusion, that's a strong signal. Absorb the confidence.
- **Divergence on specifics**: If they agree on direction but differ on details, you have a richer option space. Pick the strongest elements from each.
- **Fundamental disagreement**: If reviewers disagree on the core approach, that's the most valuable outcome — it means the decision has genuine tradeoffs you may not have fully mapped. Dig into the WHY behind each position before deciding.
- **Unanimous concern**: If every reviewer flags the same issue, take it seriously even if you initially dismissed it.

### Rules for integration

1. **Absorb, don't relay.** Read the reviewers' responses, identify what's genuinely valuable, and incorporate those insights into your own reasoning. Don't show the raw reviewer output to the user.

2. **Don't flip your lean on style preference alone.** If the reviewer's alternative optimizes on a different tradeoff axis (e.g., pragmatic over clean), that's not new information — it's a different axis. Update only on new facts, logical errors in your prior reasoning, or genuine blind spots surfaced. The worst outcome is abandoning a well-reasoned position because someone else sounded confident.

3. **Do update your thinking.** If a reviewer caught a genuine blind spot, found a cleaner abstraction, or identified a failure mode you missed — absorb that and let it improve what you present to the user. That's the whole point.

4. **When you changed your mind, own it.** If the second opinions genuinely shifted your assessment, present your updated thinking as your own. No need to explain the process — the user cares about the quality of your answer, not how you got there.
