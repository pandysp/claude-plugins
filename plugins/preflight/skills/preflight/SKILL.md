---
name: preflight
description: Honest self-assessment of the current state of work before shipping. Use when the user invokes the preflight skill or asks "how happy are you", "how do you feel about this", "preflight check", "honest assessment", "are you satisfied", or "what's the state of things". This is about surfacing what's genuinely good, what's incomplete, what's buggy, and what could be better, with concrete actionable items.
---

# Preflight: honest assessment before shipping

Stop and honestly assess: how happy are you with the current state of the work?

Not "are you happy" (binary, invites a polite yes). "HOW happy" (graduated, demands nuance). This is your chance to surface everything you've been holding back, rationalizing, or planning to mention later.

## How to reflect

Review what actually exists. Read files, check the diff, examine the produced artifacts. Don't assess from memory.

Self-assessment has a built-in blind spot: you're grading your own work. For high-stakes ships, don't rely on introspection alone. Before assessing, try to invoke and follow the second-opinion skill, then take exactly one branch:

- **Skill absent**: state **Second-opinion skill unavailable**—not **Independent review channel unavailable**—and perform a structured self-critique directly, labeled as self-review.
- **Skill present, no independent channel**: if no distinct reviewer/advisor execution returns findings after following the skill's channel-selection procedure, state **Independent review channel unavailable**—not **Second-opinion skill unavailable**—and use its labeled self-review fallback. Loading the skill alone is this branch, not an independent review.
- **Independent review obtained**: only after a distinct reviewer/advisor execution returns findings, fold those findings into the assessment. Do not use either unavailable label or mention **Missing independent review** anywhere—not even as resolved or not applicable.

For the first two branches, include a **Missing independent review** item under **What needs attention NOW**, put the branch's availability label in that item, and preserve the self-review label. Never present self-review as independent.

Before presenting, enforce the selected branch in the final output:
- First or second branch: the NOW section must contain the missing-review item.
- Third branch: the NOW section must contain only artifact findings. Scan the draft and delete any missing-review item, including one marked resolved or not applicable.

Then assess across these dimensions:

### Completeness
Is everything implemented or written? Were any requirements quietly dropped, or items deferred without discussion?

### Correctness
Does it actually do what it claims? Any known bugs, edge cases, or unverified assumptions?

### Quality
Is this clean, correct, and elegant, or were corners cut? Would you be proud to show this to a sharp peer who'd notice problems?

### Verification
Has it been properly checked (tests, manual usage, rendered output, peer-read, whatever's appropriate)? Anything that should have been verified but wasn't?

### Loose ends
What's unfinished or deferred? Any risks or fragilities introduced?

## Output

Be direct. No diplomatic softening.

**Overall**: a genuine feeling, not a score. *"I'm happy with the core logic but uncomfortable with the error handling"* beats *"7/10."*

**What's good**: briefly. Don't pad to soften the bad news.

**What needs attention NOW**: specific items to fix this session before shipping. Include enough detail to act on: file paths, line numbers, what's wrong, what to do about it. If it would matter to a sharp reviewer, it goes here, not LATER.

**What should be filed for later**: improvement ideas, tech debt, follow-ups. For each: title + one line on why it matters.

## After

Present the assessment. Wait. The user decides what to act on. Don't preemptively fix things or open tickets.
