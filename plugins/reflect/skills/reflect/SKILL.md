---
name: reflect
description: Capture durable lessons from a session before they fade. What surprised you, what friction repeated, which host or project instructions should change, and what belongs in memory, project notes, or a tooling ticket. Use at session end after work has shipped or reached a natural pause. Trigger when the user invokes the reflect skill, asks "what did we learn", "lessons learned", "session retro", or "what should we save". Also invoke proactively at the end of substantive work or at a natural session pause, while the friction and surprises are still in context.
---

# Reflect: capture lessons before they fade

A session ended. The work shipped, or hit a natural pause. The friction, surprises, and insights are still warm in context, but they decay fast. The next session won't remember what surprised you today.

This skill is the discipline of **capturing what's worth keeping** before the context evaporates. The output is durable artifacts: instruction changes, memory entries, note updates, or tooling tickets that help future-you avoid repeating the friction or recreating the insight.

## What to surface

Five questions to scan. Ask only those that have real signal:

- **What surprised me?** Moments where reality didn't match the prior. Usually the highest-signal lessons.
- **What friction repeated?** Pain that happened more than once this session. Single occurrences are noise; repeats are signal.
- **What instruction update would have prevented something today?** A rule or default missing from the host, project, or repository instructions that govern this work.
- **What pattern emerged that's worth naming?** A recurring shape, idiom, or approach that worked. Naming makes it reusable.
- **What's worth saving as a durable note?** Knowledge that will be useful in future sessions but doesn't fit anywhere yet.

If a question has no signal, skip it. Reflection isn't a checklist to fill. It's a salvage operation.

## Where to write

Classify the insight before choosing a destination. Follow the host and workspace's established hierarchy instead of inventing a new store:

- **Behavioral instruction**: update the applicable host, project, or repository instruction file. Common host-level names include `CLAUDE.md` and `AGENTS.md`, but the governing workspace instructions decide the real destination and scope.
- **Durable fact**: use the host's memory mechanism when one exists and the fact belongs there.
- **Project or domain knowledge**: update the existing project notes or documentation closest to the subject.
- **Session context**: use daily or session memory only when the workspace defines it and the information is short-lived.
- **Tooling friction**: create or update the relevant ticket when the remedy is a code or process change, not another instruction.

Choose the narrowest durable destination that will actually be loaded when the lesson matters. If no suitable store exists, surface that gap instead of silently creating a new convention.

## How to write the artifact

- **Lead with the actionable lesson, not the story.** *"Verify before declaring done"* beats *"Today I declared done and the bug surfaced an hour later..."* A vague *"be more careful with X"* doesn't survive contact with the next session; concrete rules do.
- **Cite the trigger if useful.** Brief context about when the lesson applies, not the full narrative.
- **Cap the length.** A reflection note longer than a paragraph won't get re-read.

## After reflecting

Surface the captured insights briefly: *"Saved: [list]."* Then proceed to next steps (or end the session). Don't re-debate the captures. They're cheap to revise later.

## Common pitfalls

Reflection is the most-skipped phase because it has no immediate payoff. Watch for:

- **"It's obvious now" drift.** Assuming the lesson doesn't need to be written because you'll remember. You won't. *"Saving without writing"* is not reflection. If it's not in a file, it didn't happen.
- **Skipping because nothing felt remarkable.** The absence of remarkable moments is itself information. Note it.
- **Padding to look thorough.** Manufacturing lessons because the skill expects output. If nothing surfaced, say so.
- **Story-shaped lessons.** Narrative without distillation. Catalog without curation. Future-you wants the rule, not the anecdote.
- **Saving in the wrong place.** Durable knowledge in short-lived session memory, or ephemeral state in global instructions. Match persistence and scope to the artifact.
