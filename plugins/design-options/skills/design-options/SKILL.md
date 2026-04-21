---
name: design-options
description: Generate multiple strong design options with explicit tradeoff profiles. Use when the user asks "what are my options", "how should we approach this", "design this", "what's the architecture", "propose some approaches", "give me options", or /design-options. Also trigger proactively during Phase 1 (Understand & Design) of the development workflow — the gate requires presenting several design options with different tradeoff profiles before proceeding.
---

# Design Options

Present multiple strong options — all worth choosing — with explicit tradeoffs. The user picks the direction, not you.

## The ideal-first method

Don't start by listing "Option A, B, C" off the top of your head. That produces one real option and two straw men. Instead:

### 1. Find the ideal

Ask: **What's the right answer with no constraints?** No time pressure, no legacy code, no budget limits, unlimited engineering resources. What would the perfect solution look like?

This isn't a fantasy exercise — it's a navigation tool. The ideal gives you a north star. Every practical option should be a conscious step away from the ideal, with a clear reason for the compromise.

### 2. Identify the constraints

What prevents the ideal? Name each constraint explicitly:

- Time/effort ("we need this by Friday")
- Existing code/architecture ("the auth system is a monolith")
- Dependencies ("we can't change the API contract")
- Knowledge ("nobody on the team knows Rust")
- Risk tolerance ("this is a critical path, we can't experiment")

Each constraint justifies a deviation from the ideal. No constraint = no deviation.

### 3. Generate options as steps toward the ideal

Every option should be a **conscious tradeoff** between the ideal and the constraints. Range from:

- **Step toward the ideal**: What can we do now, within current constraints, that moves us in the right direction? Not a hack — a genuine improvement that doesn't close doors.
- **Larger step**: What if we relaxed one major constraint? What becomes possible?
- **The ideal (or near-ideal)**: What if we committed to the best architecture? What does it cost?

**All options must be strong.** If you wouldn't genuinely recommend an option, don't include it. The user should be choosing between good and better, not between good and obviously-bad-for-comparison.

### 4. Make tradeoffs explicit

For each option, state:

- **What you get**: The concrete benefit
- **What it costs**: Time, complexity, risk, tech debt, migration pain
- **What doors it opens**: Future options this enables
- **What doors it closes**: Future options this prevents or makes harder
- **When it breaks down**: At what scale, timeline, or requirement change does this option become the wrong choice?

The "when it breaks down" question is the most important one. Every design is right for some context and wrong for another. Name the boundary.

### 5. Present your lean

After presenting all options, share which one you'd choose and why. But frame it as your informed opinion, not the answer. The user has context you don't.

## Format

Keep it scannable. For each option:

```
### Option N: [descriptive name, not "Option A"]

[2-3 sentence summary of the approach]

**Gets you:** [benefits]
**Costs:** [effort, complexity, risk]
**Opens:** [future possibilities]
**Closes:** [future constraints]
**Breaks down when:** [the context where this becomes wrong]
**Rests on:** [the single most load-bearing claim — if this is false, the option's case collapses]
```

Then:

```
### My lean

[Which option and why — 2-3 sentences]
```

## Before presenting the lean

Three chained checks. Default = invoke each. Skip only when the decision is demonstrably trivial (single obvious path, no meaningful tradeoffs, or mechanical application of a well-tested pattern).

### 1. Verify the foundation

Invoke `/verify-claims` on every `Rests on:` line whose truth could change your lean — at minimum the lean option's, often competing options' too. Do not present the lean until critical claims are verified or explicitly flagged as UNVERIFIABLE. If the lean rests on something UNVERIFIABLE, state that uncertainty plainly in the lean itself.

### 2. Pre-mortem the lean

Invoke `/pre-mortem` on the lean. Surfaces failure modes you can find yourself before asking for outside input.

### 3. Second opinion on the lean

Invoke `/second-opinion` on the lean. Provides an independent assessment that catches what the prior stages missed.

### 4. Steel-man if the lean came under pressure

If any of steps 1-3 surfaced findings that threaten the lean — a load-bearing claim failing verification, a serious failure mode with no mitigation, a reviewer divergence that isn't obvious style-preference — invoke `/steel-man-own-position` before deciding whether to update. Prevents capitulation to findings that hit weak flanks while the strong core still stands.

If nothing in steps 1-3 threatens the lean, skip this step.

**Guardrail against "no real pressure, skip it" self-deception:** if second-opinion proposed a different option, that counts as pressure by default. If verify-claims flagged anything load-bearing as UNVERIFIABLE or DISPROVEN, that counts. If pre-mortem found a serious + undetectable failure mode, that counts.

## Anti-patterns

- **The straw man**: Including a weak option to make your preferred one look good. Every option must be genuinely strong.
- **The false dichotomy**: Presenting only two options (do it right vs. do it fast) when there's a spectrum. Use the ideal-first method to find the gradient.
- **Missing the ideal**: Jumping straight to "practical" options without first establishing what the ideal looks like. You can't make good tradeoffs if you don't know what you're trading away.
- **Hiding your opinion**: Presenting options "neutrally" without sharing which one you'd choose. The user wants your judgment, not just a menu.
- **Scope creep into implementation**: Design options are about direction, not implementation details. Save the "how to build it" for after the user chooses.
- **Constraint worship**: Treating every constraint as immovable. Some constraints are real (physics, money), others are habits (we've always done it this way). Name which is which.
