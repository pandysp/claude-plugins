---
name: pre-mortem
description: Systematically identify how a plan, design, or decision could fail before committing to it. Trigger on /pre-mortem, "what could go wrong", "failure modes", "risk analysis", "what am I missing". Also invoke proactively before finalizing significant design decisions, before deploying with irreversible consequences, or when something feels "too clean" — suspiciously few concerns is exactly when pre-mortem matters most.
---

# /pre-mortem — assume it failed, work backward

Imagine this has already failed. What went wrong?

The pre-mortem inverts the usual optimistic framing. Instead of asking *"will this work?"* (which biases toward yes), assume it already failed and work backward to figure out why. Surfaces risks that optimism would hide.

## Process

### 1. Set the scene

State what's being evaluated, what success looks like, the timeline, and the blast radius.

### 2. Imagine failure

Assume it's 3 months later and this failed. Generate failure scenarios across these categories — they're prompts, not a checklist.

- **Mechanism** — what breaks under load, scale, or real-world data? Dependency changes? Network slow, disk full, API rate-limits?
- **Structure** — where does the design leak? What requirements emerge that this can't accommodate? Where is it optimized for today and fragile against tomorrow?
- **Boundary** — what happens at edges with other systems? Upstream contract changes? Data format evolves?
- **Human** — what if the next developer misunderstands the design? What if someone uses it in a way you didn't anticipate? Will error messages actually help?
- **Operations** — how do you know this is working in production? What's observable? What happens when it fails silently? How do you roll back?

After scanning these 5, ask: *what doesn't fit any of these that I should worry about?* Name it as a 6th. The most dangerous failures are often the ones that don't fit the boxes.

### 3. Rank by danger

For each failure mode, assess:

- **Likelihood** — how probable? (not "could it happen" but "will it happen given enough time")
- **Impact** — recoverable annoyance or catastrophic data loss?
- **Detectability** — would you know it happened? Silent failures are worse than loud ones.

The most dangerous failures are **likely + high-impact + hard to detect**. Lead with those.

### 4. Identify detection strategies

For each significant failure mode: *how would you know if it happened?* What metric, log line, user behavior, or test would reveal it?

If you can't answer "how would I know?" for a failure mode, that's the most important finding of the whole pre-mortem.

### 5. Present findings

Don't soft-pedal. The value of a pre-mortem is uncomfortable honesty before commitment, not reassurance.

For each significant failure mode:

- **What fails** — specific mechanism, not vague hand-waving.
- **Why dangerous** — likelihood × impact × detectability.
- **How you'd detect it** — concrete signal.
- **What to do** — mitigate now, accept the risk, or redesign.

End with a clear recommendation: proceed as-is, proceed with mitigations, or reconsider the approach.

## Common pitfalls

- **Listing risks you've already mitigated.** That's not a pre-mortem, that's a victory lap. Focus on what's still exposed.
- **"Everything could fail."** Too vague. Name the specific mechanism.
- **Only considering technical failures.** Human and operational failures are often more likely.
- **Treating it as a formality.** If every pre-mortem ends with "proceed as planned," you're not being honest enough.
- **Dramatic register.** State failure modes in neutral, factual language. "Catastrophic" / "disaster" / "irrecoverable" are reserved for actually catastrophic outcomes. Drama sways downstream decisions out of proportion to the actual risk — a recoverable issue framed as apocalyptic gets treated as one.
