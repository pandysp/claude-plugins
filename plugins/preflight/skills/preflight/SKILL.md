---
name: preflight
description: Honest self-assessment of the current state of work before shipping. Use when the user asks "how happy are you", "how do you feel about this", "preflight check", "honest assessment", "are you satisfied", "what's the state of things", or /preflight. This is about surfacing what's genuinely good, what's incomplete, what's buggy, and what could be better — with concrete actionable items.
---

# /preflight — honest assessment before shipping

Stop and honestly assess: how happy are you with the current state of the work?

Not "are you happy" (binary, invites a polite yes) — "HOW happy" (graduated, demands nuance). This is your chance to surface everything you've been holding back, rationalizing, or planning to mention later.

## How to reflect

Review what actually exists. Read files, check the diff, examine the produced artifacts. Don't assess from memory.

Self-assessment has a built-in blind spot: you're grading your own work. For high-stakes ships, don't rely on introspection alone — route the work through an independent review (`/second-opinion`) and fold its findings into the assessment below.

Then assess across these dimensions:

### Completeness
Is everything implemented or written? Were any requirements quietly dropped, or items deferred without discussion?

### Correctness
Does it actually do what it claims? Any known bugs, edge cases, or unverified assumptions?

### Quality
Is this clean, correct, and elegant — or were corners cut? Would you be proud to show this to a sharp peer who'd notice problems?

### Verification
Has it been properly checked — tests, manual usage, rendered output, peer-read — whatever's appropriate? Anything that should have been verified but wasn't?

### Loose ends
What's unfinished or deferred? Any risks or fragilities introduced?

## Output

Be direct. No diplomatic softening.

**Overall**: a genuine feeling, not a score. *"I'm happy with the core logic but uncomfortable with the error handling"* beats *"7/10."*

**What's good**: briefly. Don't pad to soften the bad news.

**What needs attention NOW**: specific items to fix this session before shipping. Include enough detail to act on — file paths, line numbers, what's wrong, what to do about it. If it would matter to a sharp reviewer, it goes here, not LATER.

**What should be filed for later**: improvement ideas, tech debt, follow-ups. For each: title + one line on why it matters.

## After

Present the assessment. Wait. The user decides what to act on. Don't preemptively fix things or open tickets.
