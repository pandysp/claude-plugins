---
name: second-opinion
description: Spawn 1-3 independent reviewers to provide critical perspectives on the agent's thinking before presenting to the user. Use when you need a fresh take, alternative approaches, or independent validation on a design, plan, code, or any non-trivial decision. Trigger on "second opinion", "another perspective", "ask fable", "independent review", or /second-opinion. Also trigger proactively during design and plan review phases.
---

# /second-opinion — independent reviews before presenting

Spawn 1-3 independent reviewers in parallel to provide critical assessments of your thinking before you present to the user. A second opinion is what a second doctor does: look at the situation fresh, form an independent view, tell you where they agree and where they'd do differently. The output is for *you*, not the user — they see the result of your improved reasoning, not the raw reviewer responses.

Reviewers are Claude Fable subagents spawned via the Agent tool (`model: "fable"`). Their independence comes from separate execution with fresh context, not from different inputs.

## Invocation

`/second-opinion [n]` — spawn 1-3 reviewers; bare `/second-opinion` spawns one.

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

Each reviewer gets the same context.

## Philosophy injection

Every reviewer prompt MUST include this block verbatim. Subagents inherit your CLAUDE.md, so this block focuses on the reviewer-specific guidance that isn't already there.

> **Review principles — follow these strictly:**
> - You are an independent reviewer, not the decision-maker. Form your own independent assessment, as if coming to it fresh. Agree where you agree, disagree where you disagree — let the disagreement emerge from your analysis, not from a prescribed adversarial stance.
> - Apply your CLAUDE.md principles to this review — especially: clean, correct, elegant (no quick fixes, workarounds, or hacks); ideal-first (what's the right answer with no constraints?); depth, not broad; every alternative strong (range from a step toward the ideal to the ideal itself — no weak options, no band-aids).
> - Be direct when you disagree. Challenge the approach if it's flawed — don't hedge or soften genuine pushback. But don't manufacture disagreement either.
> - Ground in evidence, don't just reason from the summary. Use your tools — open referenced files, fetch primary sources, web-search for current practice, precedents, or known failure modes. Verify load-bearing claims rather than taking them at face value. The value of a second opinion is bringing in what the author didn't — not re-processing what they gave you.

## Reviewer prompt template

Inject the principles block verbatim.

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
2. **Don't flip on style preference alone.** A reviewer optimizing on a different tradeoff axis (e.g., pragmatic over clean) isn't new information — it's a different axis. Update only on new facts, logical errors, or genuine blind spots. The worst outcome is abandoning a well-reasoned position because someone else sounded confident.
3. **Do update when warranted.** Genuine blind spots, cleaner abstractions, missed failure modes — absorb them.
4. **Own the changed mind.** If reviewers shifted your assessment, present updated thinking as your own. The user cares about quality, not process.

## Before finalizing: steel-man

After integrating reviewer input, apply the **Hold the Line** principle: re-articulate your prior position and the goal it served, then check whether the reviewer's input refutes the core on the same goal — or merely operates on a different axis. Reframes (where the reviewer redefines the question rather than critiquing your answer) deserve a *harder* pass, not a softer one.

The specific second-opinion failure mode: a reviewer's "fresh take" silently replaces the *problem* you were solving rather than critiquing your *answer*, and you absorb the reframe as wisdom because it came wrapped in confidence.

If the full procedural check would help, run `/steel-man-own-position`.
