---
name: understudy
description: >-
  Write code, comments, tests, or commit messages that read as if the project's
  own maintainer wrote them, so a contribution is accepted as native rather than
  rejected as foreign. Use when writing into a codebase or document you don't own:
  a pull request or patch to an upstream project, a fix matching a specific
  maintainer's style, a change that has to blend into a teammate's module. Triggers
  on /understudy, "match the style", "make it look like theirs", "fit the house
  style", "will this look out of place in their repo", or before opening a PR
  against someone else's project. Also invoke proactively whenever you're about to
  write into code or prose whose style isn't your own — a foreign-looking
  contribution is a cost to the maintainer even when it's correct, and the cheapest
  time to match their hand is before you've written in yours.
---

# /understudy — write as the maintainer

A maintainer rejects foreign-looking code even when it's correct. A patch in the wrong idiom is a cost to them — something to mentally translate, reformat, or turn down — so a contribution that doesn't look like theirs raises the bar to merging it, sometimes past the point they'll bother. Your default makes this worse: a generic, competent style that quietly announces "written by an outsider", the same tell that reads as AI. This skill is the discipline of effacing your own hand and writing as the host, so the work arrives already in their voice and costs nothing to accept.

The bar you're aiming for: **a reviewer can't find the seam between your code and theirs.**

## The method

### 1. Sample how they actually write
Read the host's own code, comments, tests, and commit messages — and read more than the one thing you're touching. The hand shows in naming, comment density and what they bother to comment at all, where state lives, how errors flow, how config is gated, how tests are shaped, how commits are phrased. You'll default to glancing at the code and writing; the work is reading enough that their conventions, not your habits, are what's loaded when you start.

### 2. Iterate past your first pass
One reading anchors on your own habits with a thin coat of theirs, and the idioms you'd get wrong are the ones it doesn't reveal. Keep sampling until a pass comes up dry — you should be able to name what each pass turned up, not just say you "matched the style". The pull to call it done early is the failure this skill exists to counter; when in doubt, sample again.

## Style, not substance
Effacing your hand is about how the code reads, not about silencing your judgment. Match their style; don't defer on substance. If something looks wrong on the merits — a bug, a risk, a real design problem — raise it as you would anywhere. The skill doesn't tell you whether to match or push back on that; it only asks that your style be theirs, not that your opinions go quiet.

## Common pitfalls
- **Declaring convergence after one pass.** The first draft is your priors lightly painted over. If you found nothing to fix on the second pass, you didn't sample hard enough.
- **Cosmetic matching.** Getting the formatting right while the structure — allocation, state placement, helper reuse — stays in your own dialect. The code reads as theirs at a glance and as an outsider on a real read.
- **Correct but foreign.** A technically perfect patch in your style. To a minimalist maintainer that's still a rejection; correctness is necessary, nativeness is what gets it merged.
