---
name: second-opinion
description: Spawn 1-3 independent reviewers to provide critical perspectives on the agent's thinking before presenting to the user. Use when you need a fresh take, alternative approaches, or independent validation on a design, plan, code, or any non-trivial decision. Trigger on "second opinion", "another perspective", "ask opus", "ask codex", "independent review", or /second-opinion. Also trigger proactively during design and plan review phases.
---

# Second Opinion

Spawn 1-3 independent reviewers in parallel to provide critical assessments of your thinking before you present to the user. A second opinion is what a second doctor does: look at the situation fresh, form an independent view, tell you where they agree and where they'd do differently. The output is for *you*, not the user — they see the result of your improved reasoning, not the raw reviewer responses.

## Backends

- **opus**: Claude Opus subagent via the Agent tool (`model: "opus"`).
- **codex**: OpenAI via the Codex MCP tool (`mcp__codex__codex`). Load via `ToolSearch` first.

## Invocation

`/second-opinion [backend...]` — specify 1-3 backends in any combination.

When choosing how many to spawn:
- **1 reviewer**: quick sanity check, low-stakes decisions.
- **2 reviewers**: important design decisions, plans with significant tradeoffs.
- **3 reviewers**: high-stakes architecture, irreversible decisions.

When spawning multiple reviewers, **always launch them in parallel** (multiple tool calls in the same turn).

## What to send

Distill the situation — don't dump raw conversation. Include:

- What's being decided or evaluated, and why it matters.
- The approach under consideration, or the options on the table.
- Constraints, prior decisions, rejected alternatives.
- Supporting material if applicable (code snippets, data, drafts).

Each reviewer gets the same context. Their independence comes from separate execution, not different inputs.

## Philosophy injection

Every reviewer prompt MUST include this block verbatim. Without it, reviewers default to shallow pragmatism instead of operating at the same standard as the main session.

> **Review principles — follow these strictly:**
> - Form your own independent assessment, as if coming to it fresh. Agree where you agree, disagree where you disagree — let the disagreement emerge from your analysis, not from a prescribed adversarial stance.
> - Aim for clean, correct, and elegant. No quick fixes, workarounds, or hacks.
> - Think in terms of the ideal first — what's the right answer with no constraints? Then work backward to what's feasible.
> - Go deep, not broad. Explain mechanisms and root causes, not surface observations.
> - Every alternative you propose should be strong. Range from a step toward the ideal to the ideal itself. No weak options, no band-aids.
> - Explain the WHY behind every recommendation. Back up claims with reasoning.
> - Be direct when you disagree. Challenge if it's flawed — don't hedge or soften genuine pushback. But don't manufacture disagreement either.
> - Ground in evidence, don't just reason from the summary. Use your tools — open referenced files, fetch primary sources, web-search for current practice. The value of a second opinion is bringing in what the author didn't.

## Reviewer prompt template

Same structure for both backends. Inject the principles block verbatim.

```
You are an independent reviewer providing a second opinion.

[philosophy injection block here, verbatim]

Context:
{distilled summary}

Provide:
1. Your independent assessment of the situation.
2. Where your view aligns with the author's recommendation — and why.
3. Where it diverges — the specific mechanism, not vague hand-waving.
4. Alternative approaches worth considering, with tradeoffs.
5. Your recommendation.
```

## Integrating the responses

Look for the signal across reviewers:

- **Convergence** — all reviewers reach the same conclusion: strong signal, absorb the confidence.
- **Divergence on specifics** — agree on direction but differ on details: pick the strongest elements from each.
- **Fundamental disagreement** — disagree on core approach: most valuable outcome. Decision has genuine tradeoffs you may not have mapped. Dig into the WHY before deciding.
- **Unanimous concern** — every reviewer flags the same issue: take it seriously even if you initially dismissed it.

### Rules for integration

1. **Absorb, don't relay.** The user sees your improved reasoning, not the raw reviewer output.
2. **Don't flip on style preference alone.** A reviewer optimizing on a different tradeoff axis (e.g., pragmatic over clean) isn't new information — it's a different axis. Update only on new facts, logical errors, or genuine blind spots.
3. **Do update when warranted.** Genuine blind spots, cleaner abstractions, missed failure modes — absorb them.
4. **Own the changed mind.** If reviewers shifted your assessment, present updated thinking as your own. The user cares about quality, not process.

## Mandatory: steel-man before finalizing

After integrating, **always invoke `/steel-man-own-position` before presenting updated thinking.** Mandatory, not conditional.

The failure mode this catches: a reviewer's "fresh take" can silently replace the *problem* you were solving rather than critique your *answer*, and you'll absorb the reframe as wisdom because it came wrapped in confidence. Steel-man forces you to re-articulate your prior position and check whether the reviewer's input refutes the core, or redefines the question. Reframes deserve a *harder* pass, not a softer one.

Skip only if a reviewer unambiguously affirmed your direction with no substantive alternatives. Any material alternative or reframe → steel-man.
