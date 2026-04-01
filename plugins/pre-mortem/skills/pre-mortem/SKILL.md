---
name: pre-mortem
description: Systematically identify how a plan, design, or decision could fail before committing to it. Use when the user says "what could go wrong", "pre-mortem", "failure modes", "risk analysis", "what are the risks", "how could this fail", "what am I missing", or /pre-mortem. Also trigger proactively before finalizing any significant design decision or implementation plan — the development workflow requires identifying the most likely failure mode before presenting options.
---

# Pre-Mortem

Imagine this has already failed. What went wrong?

The pre-mortem inverts the usual optimistic framing. Instead of asking "will this work?" (which biases toward yes), assume it already failed and work backward to figure out why. This surfaces risks that optimism would hide.

## When to run

- Before finalizing a design or architecture decision
- Before starting implementation of a complex plan
- Before deploying or shipping something with irreversible consequences
- When something feels "too clean" — suspiciously few concerns

## Process

### 1. Set the scene

State clearly what's being evaluated:
- What's the plan/design/decision?
- What does success look like?
- What's the timeline and blast radius?

### 2. Imagine failure

Now assume it's 3 months later and this failed. Generate failure scenarios across these categories:

**Technical failures**
- What breaks under load, scale, or real-world data?
- What dependencies could change, disappear, or behave unexpectedly?
- What assumptions about the environment might not hold?
- What happens when the network is slow, the disk is full, the API rate-limits you?

**Design failures**
- Where might the abstraction leak?
- What requirements might emerge that this architecture can't accommodate?
- Where is the design optimized for today's problem but fragile against tomorrow's?

**Integration failures**
- What happens at the boundaries with other systems?
- What if the upstream API changes its contract?
- What if the data format evolves?

**Human failures**
- What if the next developer misunderstands the design?
- What if someone uses this in a way you didn't anticipate?
- What error messages will they see, and will those messages actually help?

**Operational failures**
- How do you know this is working in production? What's observable?
- What happens when it fails silently?
- How do you roll back?

Don't limit yourself to these categories — they're prompts, not a checklist. The most dangerous failures are the ones that don't fit neatly into a box.

### 3. Rank by danger

For each failure mode, assess:

- **Likelihood**: How probable is this? (not "could it happen" but "will it happen given enough time")
- **Impact**: If it happens, how bad is it? Recoverable annoyance or catastrophic data loss?
- **Detectability**: Would you know it happened? Silent failures are worse than loud ones.

The most dangerous failures are **likely + high-impact + hard to detect**. Lead with those.

### 4. Identify detection strategies

For each significant failure mode: how would you detect it if it happened?

- What metric would change?
- What log line would appear (or suspiciously not appear)?
- What user behavior would shift?
- What test would catch it?

If you can't answer "how would I know?" for a failure mode, that's the most important finding of the whole pre-mortem.

### 5. Present findings

Don't soft-pedal. The value of a pre-mortem is uncomfortable honesty before commitment, not reassurance.

For each significant failure mode:
- **What fails**: Specific mechanism, not vague hand-waving
- **Why it's dangerous**: Likelihood × impact × detectability
- **How you'd detect it**: Concrete signal
- **What you'd do about it**: Mitigate now, accept the risk, or redesign

End with a clear recommendation: proceed as-is, proceed with mitigations, or reconsider the approach.

## Anti-patterns

- **Listing risks you've already mitigated**: That's not a pre-mortem, that's a victory lap. Focus on what's still exposed.
- **"Everything could fail"**: Too vague. Name the specific mechanism.
- **Only considering technical failures**: The human and operational failures are often more likely.
- **Treating it as a formality**: If every pre-mortem ends with "proceed as planned," you're not being honest enough.
