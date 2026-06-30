---
name: clarify
description: Surface and resolve underspecified decisions before designing. Use after task interpretation and terrain mapping, when you've understood what's being asked AND what's already there but still need user input on judgment calls: boundaries and scope, edge behavior, trade-offs and calibration, integration with surroundings, hard constraints, audience specifics. Triggers on /clarify, "any clarifying questions", "what should I confirm", "before designing, what's unclear". Also invoke proactively before substantive design or planning work. Designing without resolving ambiguities locks them in silently.
---

# /clarify: exhaust questions before designing

Before proposing design options, surface the synthesis questions: places where the task and terrain leave something genuinely undecided. Locking a design around a hidden assumption is more expensive than asking up front.

## Dimensions to cover

Skip dimensions that don't matter here. For each, ask only what's genuinely unclear:

- **Scope & boundaries**: what's in, out, deferred.
- **Edge & extreme behavior**: what happens at unusual conditions.
- **Trade-offs & calibration**: where on the spectrum to land.
- **Integration with surroundings**: what must this fit alongside or interact with.
- **Hard constraints**: what would create downstream problems if violated (compliance, deadlines, budget).
- **Audience specifics**: what does the actual consumer of this need.

## What to surface

Ask only what's genuinely unclear AND would change the design. Skip what task + terrain already answer, and what wouldn't change the proposed options. Group related questions. If a dimension has no open question, say so. Shows you considered it.

## Format

Each question gets specific phrasing: not *"any thoughts on edge cases?"* but a concrete, scoped question with named alternatives, plus a default when applicable.

```
### Scope & boundaries
- [Specific question with named alternatives]? My read: [recommendation].

### Edge & extreme behavior
- [Edge case condition] — [option A] *(default)* or [option B]?

### Hard constraints
- No open questions — [brief reason].
```

## When the user defers

If the user says *"whatever you think is best"* or similar: provide a specific recommendation per question, get explicit confirmation. Don't silently absorb. That's the *"I assumed you wanted X"* failure mode.

## After clarification

Briefly recap the resolved decisions: *"Confirmed: [decision 1], [decision 2]."* Then proceed to design.

## Common pitfalls

- **Asking what task + terrain already answer.** If the answer is implicit, commit instead of asking.
- **Leaving the user to do synthesis.** Specific questions with defaults, not "any thoughts on X?"
- **Ignoring user delegation.** *"Whatever you think"* requires recommendation + confirmation, not silent picking.
- **Treating it as task interpretation.** This is post-task-understanding and post-terrain synthesis, not a substitute for either.
- **Mechanical run-through.** Skip dimensions that don't matter here.
