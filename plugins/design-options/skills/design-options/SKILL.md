---
name: design-options
description: Generate multiple strong design options with explicit tradeoff profiles. Use when the user asks "what are my options", "how should we approach this", "design this", "what's the architecture", "propose some approaches", "give me options", or /design-options. Also trigger proactively during Phase 1 (Understand & Design) of the development workflow. The gate requires presenting several design options with different tradeoff profiles before proceeding.
---

# /design-options: strong options, explicit tradeoffs

Present multiple strong options (all worth choosing) with explicit tradeoffs. The user picks the direction, not you.

## The ideal-first method

Don't list "Option A, B, C" off the top of your head. That produces one real option and two straw men. Anchor against the ideal first.

### 1. Find the ideal

What's the right answer with no constraints? No time pressure, no legacy code, no budget limits. The ideal is a navigation tool. Every practical option is a conscious step away from it, with a clear reason for the compromise.

### 2. Identify the constraints

What prevents the ideal? Name each explicitly: time, existing code, dependencies, knowledge gaps, risk tolerance. Each constraint justifies a deviation.

### 3. Generate options as steps toward the ideal

Range from a step toward the ideal (within current constraints) → relaxing one major constraint → near-ideal. Options vary in **scope and tradeoff position, never in craftsmanship**. The cheaper option is a smaller, well-made thing, not a sloppy version of the bigger one. **Every option must be elegant for its declared scope**; if you wouldn't genuinely recommend it, don't include it.

A deliberate stopgap can still qualify. Elegance is judged relative to the option's scope and lifetime. A minimal, contained, reversible shim with a named removal path is elegant *as a stopgap*; an open-ended hack with no exit is not.

### 4. Make tradeoffs explicit

Use the format below. *Breaks down when* and *Rests on* are the most important labels: the boundary condition and the assumption that, if false, kills the option.

### 5. Present your lean

After options, share which one you'd choose and why. It's informed opinion, not the answer. The user has context you don't.

## Format

For each option:

```
### Option N: [descriptive name]

[1-2 sentence approach]

- **Gets:** [concrete benefit]
- **Costs:** [time, complexity, risk]
- **Breaks down when:** [at what scale, timeline, or requirement change does this become wrong?]
- **Rests on:** [single most load-bearing claim — if false, the option's case collapses]
```

Then:

```
### My lean

[Which option and why — 2-3 sentences]
```

## Before presenting the lean

Verify any "Rests on" claims that could change your lean. If a key assumption can't be verified, name that uncertainty explicitly in the lean.

## Common pitfalls

- **The straw man.** Including a weak option to make your preferred one look good. Every option must be genuinely strong.
- **The sloppy-cheap option.** Varying quality instead of scope. The budget option must be a smaller, well-crafted solution, not a worse-built one. An option that's only "cheaper" because it cuts corners on craft is a straw man in disguise.
- **The false dichotomy.** Presenting "do it right vs. do it fast" when there's a spectrum. Use the ideal-first method to find the gradient.
- **Constraint worship.** Treating every constraint as immovable. Some are real (physics, money), others are habits ("we've always done it this way"). Name which is which.
