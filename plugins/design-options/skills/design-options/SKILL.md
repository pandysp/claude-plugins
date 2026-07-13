---
name: design-options
description: Generate multiple strong design options with explicit tradeoff profiles. Use when the user asks "what are my options", "how should we approach this", "design this", "what's the architecture", "propose some approaches", "give me options", or /design-options. Also trigger proactively during Phase 1 (Understand & Design) of the development workflow. The gate requires presenting at least two target architectures with genuinely different tradeoff profiles, plus stepping-stone options toward them, before proceeding.
---

# /design-options: strong options, explicit tradeoffs

Present multiple strong options (all worth choosing) with explicit tradeoffs. The user picks the direction, not you.

## The ideals-first method

Don't list "Option A, B, C" off the top of your head. That produces one real option and two straw men. But don't anchor on a single ideal either: with one ideal, every option lands on the same line, and the user only chooses how far along it to go. Distance is a budget decision; direction is a design decision. The gate exists for direction. Anchor against at least two ideals.

### 1. Find the ideals — at least two

What's the right answer with no constraints? That question has no single answer: it depends on what you optimize for. Simplicity or flexibility, latency or cost, buy or build, centralize or federate. Each defensible weighting yields a different **target architecture** — different in kind, not in size. Find at least two whose tradeoff profiles genuinely differ.

Targets are navigation tools. Every practical option is a conscious step toward one of them, with a clear reason for the compromise.

Occasionally one target really does dominate on every axis the user cares about. Then say so and show why — that finding is itself the deliverable, because it tells the user the only open question is how much to invest, not which direction to take. But treat "I only found one ideal" as tunnel vision until you've honestly tried a competing weighting.

### 2. Identify the constraints

What prevents each ideal? Name each explicitly: time, existing code, dependencies, knowledge gaps, risk tolerance. Each constraint justifies a deviation.

### 3. Generate options as stepping stones toward the targets

Each option is a step toward a named target — from a modest step within current constraints, through relaxing one major constraint, to near-target. The set as a whole must span at least two targets; you don't need the full gradient for each. Options vary in **direction and scope, never in craftsmanship**. The cheaper option is a smaller, well-made thing, not a sloppy version of the bigger one. **Every option must be elegant for its declared scope**; if you wouldn't genuinely recommend it, don't include it.

A deliberate stopgap can still qualify. Elegance is judged relative to the option's scope and lifetime. A minimal, contained, reversible shim with a named removal path is elegant *as a stopgap*; an open-ended hack with no exit is not.

### 4. Make tradeoffs explicit

Use the format below. *Breaks down when* and *Rests on* are the most important labels: the boundary condition and the assumption that, if false, kills the option.

### 5. Present your lean

After the options, share which target you'd steer toward, which stepping stone you'd take now, and why. It's informed opinion, not the answer. The user has context you don't.

## Format

First the targets:

```
### Target A: [descriptive name]

[1-2 sentence architecture. What it optimizes for, at the expense of what.]
```

Then each option:

```
### Option N: [descriptive name] → Target [letter]

[1-2 sentence approach]

- **Gets:** [concrete benefit]
- **Costs:** [time, complexity, risk]
- **Breaks down when:** [at what scale, timeline, or requirement change does this become wrong?]
- **Rests on:** [single most load-bearing claim — if false, the option's case collapses]
```

Then:

```
### My lean

[Which target, which stepping stone now, and why — 2-3 sentences]
```

## Before presenting the lean

Verify any "Rests on" claims that could change your lean. If a key assumption can't be verified, name that uncertainty explicitly in the lean.

## Common pitfalls

- **The straw man.** Including a weak option to make your preferred one look good. Every option must be genuinely strong.
- **The single-target tunnel.** All options step toward the same architecture at different sizes. That hands the user a budget slider, not a design choice.
- **The fabricated second target.** A token alternative invented to fill the two-target quota — a straw man at the architecture level. If one target genuinely dominates, present that finding instead of faking a rival.
- **The sloppy-cheap option.** Varying quality instead of scope. The budget option must be a smaller, well-crafted solution, not a worse-built one. An option that's only "cheaper" because it cuts corners on craft is a straw man in disguise.
- **The false dichotomy.** Presenting "do it right vs. do it fast" when there's a spectrum. The stepping stones toward each target are the gradient.
- **Constraint worship.** Treating every constraint as immovable. Some are real (physics, money), others are habits ("we've always done it this way"). Name which is which.
