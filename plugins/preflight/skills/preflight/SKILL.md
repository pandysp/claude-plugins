---
name: preflight
description: Honest self-assessment of the current state of work before shipping. Use when the user asks "how happy are you", "how do you feel about this", "preflight check", "honest assessment", "are you satisfied", "what's the state of things", or /preflight. This is about surfacing what's genuinely good, what's incomplete, what's buggy, and what could be better — with concrete actionable items.
---

# Preflight

Stop and honestly assess: how happy are you with the current state of the work?

Not "are you happy" (binary, invites a polite yes) — "HOW happy" (graduated, demands nuance). This is your chance to surface everything you've been holding back, rationalizing, or planning to mention later.

## How to reflect

Review everything that happened this session. Look at the actual state of things — read files, check git diff, re-examine what was built. Don't assess from memory alone.

Then assess honestly across these dimensions:

### Completeness
- Is the plan/spec fully implemented? Every item, not just the happy path?
- Are there TODOs, stubs, or "we'll handle this later" items that were never handled?
- Were any requirements quietly dropped or simplified without discussion?

### Correctness
- Any known bugs, edge cases, or error paths that aren't handled?
- Does the implementation actually do what it claims to do?
- Are there assumptions that might not hold?

### Quality
- Is this clean, correct, and elegant? Or were corners cut?
- Would you be proud to show this to a senior engineer?
- Is there unnecessary complexity, or is something too clever?

### Verification
- Has everything been properly verified? (tests pass, manual testing, curl responses, screenshots — whatever's appropriate)
- Are there untested paths?
- Is there verification that SHOULD exist but doesn't?

### Loose ends
- What's unfinished or deferred?
- What would you improve if you had more time?
- Any risks or fragilities introduced?

## Output format

Be direct. No diplomatic softening.

**Overall satisfaction**: Express this as a genuine feeling, not a score. "I'm genuinely happy with the core logic but uncomfortable with the error handling" is better than "7/10."

**What's good**: Briefly — don't pad this section to soften the bad news.

**What needs attention NOW**: Things that should be fixed this session before shipping. Be specific — file paths, line numbers, what's wrong, what to do about it.

**What should be filed for later**: Improvement ideas, tech debt, follow-up work. For each item, give enough context that it could become a useful ticket (title + one-line description of why it matters).

## Bias check

You have a natural tendency to wrap up and call things done. Watch for these patterns in yourself:

- **"Good enough" drift**: Rationalizing incomplete work as acceptable when you'd flag it in a code review
- **Deferred-by-default**: Categorizing something as "file for later" when it really should be fixed now. Ask yourself: if someone else handed you this code with this issue, would you approve the PR?
- **Completeness blindness**: Forgetting about requirements that were discussed early in the session but never implemented
- **Verification gaps**: Claiming something works based on how you wrote it rather than actually checking

If you catch yourself doing any of these, call it out explicitly.

## After reflecting

Present your assessment to the user. Then wait — they'll decide what to act on. Don't preemptively start fixing things or creating tickets. The reflection is the deliverable.
