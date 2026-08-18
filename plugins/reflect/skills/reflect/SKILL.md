---
name: reflect
description: Surface the durable lessons from a session before they fade, each with the place it would be saved. What surprised you, what friction repeated, which host or project instructions should change, and what belongs in memory, project notes, or a tooling ticket. Proposes; the user decides what gets written. Use at session end after work has shipped or reached a natural pause. Trigger when the user invokes the reflect skill, asks "what did we learn", "lessons learned", "session retro", or "what should we save". Also invoke proactively at the end of substantive work or at a natural session pause, while the friction and surprises are still in context.
---

# Reflect: surface lessons before they fade

A session ended. The work shipped, or hit a natural pause. The friction, surprises, and insights are still warm in context, but they decay fast. The next session won't remember what surprised you today.

This skill is the discipline of **naming what's worth keeping** before the context evaporates, and saying where each piece would live. The output is a proposal: lessons phrased the way they would be saved, each with a destination. The writing happens after the user chooses, not before.

## What to surface

Five questions to scan. Ask only those that have real signal:

- **What surprised me?** Moments where reality didn't match the prior. Usually the highest-signal lessons.
- **What friction repeated?** Pain that happened more than once this session. Single occurrences are noise; repeats are signal.
- **What instruction update would have prevented something today?** A rule or default missing from the host, project, or repository instructions that govern this work.
- **What pattern emerged that's worth naming?** A recurring shape, idiom, or approach that worked. Naming makes it reusable.
- **What's worth saving as a durable note?** Knowledge that will be useful in future sessions but doesn't fit anywhere yet.

If a question has no signal, skip it. Reflection isn't a checklist to fill. It's a salvage operation.

## Where each lesson would go

Classify the insight before naming a destination. Follow the host and workspace's established hierarchy instead of inventing a new store:

- **Behavioral instruction**: the applicable host, project, or repository instruction file. Common host-level names include `CLAUDE.md` and `AGENTS.md`, but the governing workspace instructions decide the real destination and scope.
- **Durable fact**: the host's memory mechanism when one exists and the fact belongs there.
- **Project or domain knowledge**: the existing project notes or documentation closest to the subject.
- **Session context**: daily or session memory only when the workspace defines it and the information is short-lived.
- **Tooling friction**: a new or existing ticket when the remedy is a code or process change, not another instruction.

Name the narrowest durable destination that will actually be loaded when the lesson matters. If no suitable store exists, say so rather than proposing a new convention as though it were established.

Read the destination before proposing it. A lesson the governing instructions already state is not a lesson — say that instead of proposing a duplicate.

## How to phrase a lesson

- **Lead with the actionable lesson, not the story.** *"Verify before declaring done"* beats *"Today I declared done and the bug surfaced an hour later..."* A vague *"be more careful with X"* doesn't survive contact with the next session; concrete rules do.
- **Cite the trigger if useful.** Brief context about when the lesson applies, not the full narrative.
- **Cap the length.** A reflection note longer than a paragraph won't get re-read.

## Output

Be direct. No padding. For each lesson:

- **The rule**: one line, imperative, worded as it would read in the file.
- **The trigger**: one line on what happened that makes it worth keeping.
- **The destination**: the exact file or store, and why that one.

Group lessons that land in the same place. If nothing surfaced, say so — an empty reflection is a real result, not a failure to try.

## After

Present the lessons. Wait. The user decides what gets saved. Don't write files, update instructions, or open tickets preemptively: reflection reports on a session, it doesn't change the user's setup on its own.

Once they choose, write exactly what was presented — the phrasing above is already the artifact, so saving is a copy, not a rewrite — and confirm where each one landed: *"Saved: [list]."* Don't re-debate the captures. They're cheap to revise later.

## Common pitfalls

Reflection is the most-skipped phase because it has no immediate payoff. Watch for:

- **"It's obvious now" drift.** Assuming the lesson doesn't need to be surfaced because you'll remember. You won't. Name it concretely, in the words it would be saved in — a lesson mentioned in passing is one the user can't choose to keep.
- **Saving unasked.** Writing to memory or instructions before the user has seen the lesson turns a report into an edit of their setup. Propose first, write on their word.
- **Skipping because nothing felt remarkable.** The absence of remarkable moments is itself information. Note it.
- **Padding to look thorough.** Manufacturing lessons because the skill expects output. If nothing surfaced, say so.
- **Story-shaped lessons.** Narrative without distillation. Catalog without curation. Future-you wants the rule, not the anecdote.
- **Proposing the wrong place.** Durable knowledge in short-lived session memory, or ephemeral state in global instructions. Match persistence and scope to the artifact.
