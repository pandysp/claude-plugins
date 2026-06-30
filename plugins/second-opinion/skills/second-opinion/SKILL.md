---
name: second-opinion
description: Get an independent review of your thinking before presenting it to the user, from the strongest independent channel the session offers (a full-transcript advisor tool if available, fresh-context reviewers otherwise). Use when you need a fresh take, alternative approaches, or independent validation on a design, plan, code, or any non-trivial decision. Triggers on "second opinion", "another perspective", "ask fable", "independent review", or /second-opinion. Also trigger proactively during the design and plan review phases, before presenting options or a spec.
---

# /second-opinion: independent review before presenting

Before presenting non-trivial thinking to the user, get an independent review of it. A second opinion is what a second doctor does: look at the situation fresh, form an independent view, say where they agree and where they'd do differently. The output is for *you*. The user sees the result of your improved reasoning, not the raw review.

## What a valid second opinion is

Bind to the strongest channel available in this session that satisfies all three properties. The properties are fixed; the mechanism is whatever best provides them.

- **Independent**: produced by something that didn't do the work and isn't anchored on your reasoning. Self-review wearing a reviewer hat is not a second opinion.
- **Fully informed**: sees as much of the real context as possible. Prefer a channel that reads the **full transcript** over one you hand a summary: a distillation is curated by the same mind being reviewed, so your blind spots survive it. Distill only when the channel can't take the whole context.
- **At least peer-strength**: a weaker model reviewing a stronger one mostly generates noise. Match or exceed your own capability.

## Choosing the channel

In rough order of preference:

1. **A dedicated reviewer/advisor tool the harness exposes** that sees the full transcript: best on the "fully informed" axis, no distillation loss.
2. **Fresh-context subagents at peer strength** (e.g. the Agent tool), given a faithful distillation, when no full-transcript channel exists. Spawn more than one for high-stakes or genuinely multi-faceted decisions; they run in parallel and their convergence or divergence is itself signal.
3. **No independent channel available**: say so plainly and fall back to a structured self-critique, *labeled as such*. A self-review honestly named beats one dressed up as independent. Don't simulate a second opinion that isn't there.

Let the stakes drive depth (a quick sanity check versus a full adversarial pass), not a fixed reviewer count.

## What to send

If the channel takes the full transcript, let it. If you must distill, include: what's being decided and why it matters; the approach or options on the table; constraints, prior decisions, rejected alternatives; supporting material (code, data, drafts). Don't curate away the parts you're least sure of. Those are exactly what a reviewer is for.

## Review principles to convey

However you invoke the reviewer, convey these (verbatim when the channel is a subagent prompt, as framing otherwise):

> - You are an independent reviewer, not the decision-maker. Form your own assessment as if coming to it fresh. Agree where you agree, disagree where you disagree. Let it emerge from your analysis, not a prescribed adversarial stance.
> - Apply clean/correct/elegant: no quick fixes or hacks; ideal-first (what's the right answer with no constraints?); depth over breadth; every alternative strong and elegant for its declared scope.
> - Be direct when you disagree. Don't hedge or soften genuine pushback. But don't manufacture disagreement either.
> - Ground in evidence. Open referenced files, fetch primary sources, web-search current practice and known failure modes. The value of a second opinion is bringing in what the author didn't, not re-processing what they gave you.

## Integrating the response

- **Absorb, don't relay.** The user sees your improved reasoning, not the raw review.
- **Don't flip on style preference alone.** A reviewer optimizing a different tradeoff axis (pragmatic over clean) isn't new information. It's a different axis. Update only on new facts, logical errors, or genuine blind spots. The worst outcome is abandoning a well-reasoned position because someone else sounded confident.
- **Do update when warranted.** Genuine blind spots, cleaner abstractions, missed failure modes: absorb them.
- **Own the changed mind.** If the review shifted your assessment, present the updated thinking as your own. The user cares about quality, not process.

When multiple reviewers converge, absorb the confidence. When they fundamentally disagree, that's the most valuable outcome: the decision has tradeoffs you may not have mapped, so dig into the *why* before deciding. When every reviewer flags the same concern, take it seriously even if you initially dismissed it.

## Before finalizing: steel-man

Apply **Hold the Line**: re-articulate your prior position and the goal it served, then check whether the review refutes the core on the same goal, or merely operates on a different axis. The specific failure mode: a reviewer's "fresh take" silently replaces the *problem* you were solving rather than critiquing your *answer*, and you absorb the reframe because it arrived wrapped in confidence. Reframes deserve a *harder* pass, not a softer one. If the full procedural check would help, run `/steel-man-own-position`.
