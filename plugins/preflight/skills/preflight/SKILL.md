---
name: preflight
description: Honest self-assessment of the current state of work before shipping. Use when the user invokes the preflight skill or asks "how happy are you", "how do you feel about this", "preflight check", "honest assessment", "are you satisfied", or "what's the state of things". Surface what's genuinely good, incomplete, buggy, or improvable. Pass --fix to fix actionable issues and repeat the assessment until no autofixable issues remain.
---

# Preflight: honest assessment before shipping

Stop and honestly assess: how happy are you with the current state of the work?

Not "are you happy" (binary, invites a polite yes). "HOW happy" (graduated, demands nuance). This is your chance to surface everything you've been holding back, rationalizing, or planning to mention later.

## Modes

Usage: `preflight [--fix]` (use the host's skill invocation syntax).

- **Without `--fix`**: assess and report. Wait for the user to choose what to act on.
- **With `--fix`**: assess, fix, verify, and repeat. The flag authorizes fixes within the current task, not new scope, destructive actions, or bypassing permissions.

## How to reflect

Review what actually exists. Read files, check the diff, examine the produced artifacts. Don't assess from memory.

Self-assessment has a built-in blind spot: you're grading your own work. For high-stakes ships, follow `second-opinion` if available and fold any findings into the assessment.

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

## NOW vs LATER

Default concrete issues in the current work to **NOW**. Bugs, missing requirements, verification gaps, stale docs, and quality problems a sharp reviewer would flag belong here. Being preexisting, small, tedious, or more work than expected is not a reason to defer them.

**LATER is the exception**: an independent enhancement not needed to ship the current work correctly, or something the user explicitly chose to defer. Explain why leaving each item does not compromise this ship; for user-directed deferrals, record the decision and any remaining risk. Don't turn unfinished work into a follow-up just to finish the session.

A NOW item needing access, approval, or a user decision is **blocked NOW**, not LATER. Separate urgency from whether you can fix it yourself.

## Output

Be direct. No diplomatic softening.

**Overall**: a genuine feeling, not a score. *"I'm happy with the core logic but uncomfortable with the error handling"* beats *"7/10."*

**What's good**: briefly. Don't pad to soften the bad news.

**What needs attention NOW**: specific remaining items to fix before shipping. Include enough detail to act on: file paths, line numbers, what's wrong, what to do about it. For blocked items, state the blocker and the exact input, access, or approval needed.

**What should be filed for LATER**: only items that meet the deferral rule above. For each: title + why it matters + why it can wait. An empty list is fine.

## After

**Without `--fix`**: present the assessment and wait. The user decides what to act on. Don't preemptively fix things or open tickets.

**With `--fix`**, run this loop in the current conversation:

1. **Assess** the actual artifacts across all five dimensions above. Validate findings before acting; if evidence refutes one, say why rather than fixing a non-issue.
2. **Fix** every autofixable NOW item: a confirmed issue with a clear correction you can make within the current task and permissions. Fix the cause, not just the symptom. Keep blocked items visible and continue with independent fixes; don't pause for approval of already-authorized work.
3. **Verify** the fixes with the relevant tests, checks, or direct use of the artifact. A change isn't fixed until verification supports it. Failed or unavailable verification remains NOW; repair what you can and name any real blocker.
4. **Run preflight again with `--fix`** on the updated work, starting at the full assessment, not just the previous findings list. Re-read the artifacts and diff with tools; remembering your edits is not a fresh assessment. Do this even when known remaining issues are blocked. Include newly exposed issues and regressions. Repeat after every fix batch; a passing test run alone is not the exit condition.
5. **Stop only when a fresh assessment finds no autofixable NOW issues.** Don't stop merely because one fix pass is done, impose an arbitrary pass count, or relabel unresolved items as LATER to exit. If a repair stalls or the same failure recurs, investigate the cause and change approach; if you cannot proceed, record the attempted fixes, evidence, and concrete blocker rather than retrying blindly or claiming success.

Keep a concise record of findings, fixes, and verification across passes so nothing disappears. At the end, present the assessment of the **final state**, plus what was fixed and how it was verified. If blocked NOW items remain, say the work is still blocked, not clean or ready to ship. Don't open tickets unless asked.
