---
name: handoff
description: Write a durable handoff for work that's about to ship — structured PR descriptions, summaries, memos, or memory notes about completed work. Use when creating a PR, wrapping up a session, writing a project summary, drafting documentation about what was built, or composing memory notes for future sessions. Triggers on /handoff, "write the PR description", "summarize what we did", "wrap up the work", "create a summary". Also invoke proactively when shipping substantive work — a hasty handoff means the next reader (reviewer, future you, teammate) has to reconstruct context from scratch.
---

# /handoff — write a durable handoff

The work is done. Now write a handoff that serves the next reader without forcing them to spelunk the diff.

A good handoff answers four questions in order:

1. **What was built** — in plain language, not commit-list paraphrase
2. **Key decisions and why** — choices that shaped the work, alternatives considered
3. **Files modified and why** — not just paths; the purpose each change serves
4. **Suggested next steps** — follow-ups, deferred work, known gaps, things to watch

The reader could be a code reviewer, future-you in three months, or a teammate picking up the thread. Write so any of them gets oriented in under a minute.

## Standard PR shape

> ### What was built
> [2–4 sentences — what the change does, in plain language]
>
> ### Why
> [the motivating problem, user need, or constraint that triggered the work]
>
> ### Key decisions
> - [decision]: chose X over Y because Z
>
> ### Files modified
> - `path/to/file` — [purpose of this file's change]
>
> ### Test plan
> - [ ] [how to verify — concrete steps, not "test the feature"]
> - [ ] [edge cases worth checking]
>
> ### Next steps
> - [follow-up]: [why it's deferred or when it matters]

For shorter handoffs (commit messages, slack updates, memory notes), compress to the load-bearing parts. For longer ones (design docs, ADRs), expand "Why" and "Key decisions" with rationale.

## Adapt to the audience

- **Code reviewer** — technical, structured, focus on what to look at and why each part matters
- **Future you** — context-rich, with decisions and rationale, no shorthand that depends on session memory
- **Stakeholder** — plain language, outcome-focused, less jargon
- **Memory note** — terse; capture only what couldn't be derived from the current state of the code or notes

## What to avoid

- **Diff narration** — *"Modified `auth.ts` to add a check; updated `tests.ts` with a test."* The reader can read the diff. Tell them the *purpose*, not the mechanics.
- **Backstory padding** — *"We initially considered approach A, then decided B, then went back to A..."* Final shape and load-bearing decisions, not the journey.
- **Vague test plans** — *"Test the feature."* Replace with specific scenarios that exercise edge cases.
- **Hidden gaps** — silently dropping requirements is worse than naming them as deferred. Be explicit.
- **Promotional voice** — *"This significantly improves system reliability."* Just say what it does.

## Tone

Direct, factual, short sentences. Match the audience: technical for reviewers, plain for stakeholders. Avoid marketing register.

## Anti-patterns

- **Over-summarizing** — compressing an important decision into one sentence so the rationale is invisible.
- **Under-summarizing** — listing every change so the reader has to find the load-bearing ones themselves.
- **Missing the "why"** — describing what was done without stating the problem it solves.
- **Stale template sections** — copying a template structure but leaving sections empty or filled with "N/A" when they should be removed.
