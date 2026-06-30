---
name: handoff
description: Write a durable handoff for work that's about to ship. Structured PR descriptions, summaries, memos, or memory notes about completed work. Use when creating a PR, wrapping up a session, writing a project summary, drafting documentation about what was built, or composing memory notes for future sessions. Triggers on /handoff, "write the PR description", "summarize what we did", "wrap up the work", "create a summary". Also invoke proactively when shipping substantive work. Opening a PR, wrapping up a session, or handing a thread to a teammate.
---

# /handoff: write a durable handoff

The work is done. Now write a handoff that serves the next reader without forcing them to dig through the diff.

A good handoff answers five questions in order:

1. **What was built**: in plain language, not commit-list paraphrase.
2. **Why this work exists**: the motivating problem, user need, or constraint that triggered it.
3. **Key decisions and rationale**: the choices that shaped the work, alternatives considered.
4. **What specifically changed and why**: for code: files and their purpose. For docs/plans/memos: artifacts produced and what each is *for*.
5. **Suggested next steps**: follow-ups, deferred work, known gaps, things to watch.

The reader could be a code reviewer, future-you in three months, or a teammate picking up the thread. Write so any of them gets oriented in under a minute.

## Standard PR shape

> ### What was built
> [2–4 sentences. What the change does, in plain language]
>
> ### Why
> [the motivating problem, user need, or constraint that triggered the work]
>
> ### Key decisions
> - [decision]: chose X over Y because Z
>
> ### Files modified
> - `path/to/file`: [purpose of this file's change]
>
> ### Test plan
> - [ ] [how to verify. Concrete steps, not "test the feature"]
> - [ ] [edge cases worth checking]
>
> ### Next steps
> - [follow-up]: [why it's deferred or when it matters]

For shorter handoffs (commit messages, slack updates, memory notes), compress to the parts that matter. For longer ones (design docs, ADRs), expand "Why" and "Key decisions" with rationale.

For non-code handoffs (memos, design docs, memory notes), keep questions 1–3 and 5; replace "Files modified" with whatever artifacts were produced; drop "Test plan" unless verification is meaningful.

## Adapt to the audience

- **Code reviewer**: technical, structured. Focus on what to look at and why each part matters.
- **Future you**: context-rich, with decisions and rationale. No shorthand that depends on session memory.
- **Stakeholder**: plain language, outcome-focused, less jargon.
- **Memory note**: terse; capture only what couldn't be derived from the current state of the code or notes.

Tone: direct, factual, short sentences. Match the audience but avoid marketing register in any of them.

## Common pitfalls

- **Mechanics without curation.** *"Modified `auth.ts` to add a check; updated `tests.ts` with a test."* / *"Updated section 2; revised section 4."* That's diff narration. Or listing every commit so the reader has to find what matters. Tell them the *purpose* and the *important* changes.
- **Burying the why.** Compressing important decisions or motivations into one sentence so rationale is invisible. Or describing what was done without naming the problem it solves.
- **Backstory padding.** *"We initially considered A, then B, then went back to A..."* Final shape and key decisions, not the journey.
- **Vague test plans.** *"Test the feature."* Replace with specific scenarios that exercise edge cases.
- **Hidden gaps.** Silently dropping requirements is worse than naming them as deferred. Be explicit.
- **Promotional voice.** *"This significantly improves system reliability."* Just say what it does.
- **Stale template sections.** Leaving sections empty or filled with "N/A" when they should be removed.
