---
name: spec
description: Write the implementation spec (the structured document that drives execution). Use after design is chosen (e.g., via /design-options) and before writing code. Triggers on /spec, "write the spec", "draft the implementation plan", "scope this out". Also invoke proactively when starting non-trivial implementation. A spec makes success checkable and catches scope creep and missed reuse before code is written.
---

# /spec: write the implementation spec

After the design is chosen, the spec is what the agent reads while implementing. Its job is to make success **checkable before any code exists**: bind the goal, the definition of done, the boundaries, and the verification into one durable artifact a fresh-context implementer (or verifier) could execute without re-deciding.

The spec specifies *what done looks like*, not a keystroke-by-keystroke route. State outcomes and constraints; trust the implementer to find the path. Spec quality depends on prior exploration of the relevant code. If you haven't explored, do that first.

## Structure

### Goal & why
What outcome this produces, who it's for, and what prompted it. The intent matters as much as the task: it lets the implementer connect the work to the right context instead of inferring it. One paragraph.

### Definition of Done
The most important section. A checklist of acceptance criteria, each verifiable by a command to run or an observation to make, written so a fresh-context verifier could mark each one pass or fail without asking a question. *"GET /api/users returns 200 with a list matching the schema"*, not *"the endpoint works."* This is the contract; everything else serves it.

### Boundaries
What this change must NOT do: non-goals, files or systems to leave untouched, scope explicitly deferred. The failure mode here is overreach: unrequested refactors, defensive scaffolding, and abstractions for hypothetical futures. Name the edges so they aren't crossed silently.

### Terrain (advisory)
Pointers from exploration, not a prescribed route. Deviate when the code says otherwise.
- **Likely files to touch**: `path/to/file`, why it's in scope.
- **Existing utilities to reuse**: `path/to/util`, what it does and why it fits. (Empty here is a red flag on non-greenfield work. Grep before concluding nothing fits.)

### Verification
How the Definition of Done gets proven end-to-end: the commands to run, browser steps to take, and expected outputs (happy path and the most likely failure modes). For long-running work, state a self-check cadence: verify against the DoD at intervals, ideally with a fresh-context subagent, rather than only at the end.

## Sizing

Concise enough to scan in one pass, detailed enough to execute without re-deciding. If the spec exceeds two screens, the work is too coarsely scoped. Split it.

## Common pitfalls

- **Soft Definition of Done.** *"Test the feature"* / *"works correctly"* isn't checkable. Each criterion needs a command or observation that yields pass/fail.
- **Prescribing the route.** Listing every file edit in order. State the destination (DoD) and the constraints (boundaries); the path is the implementer's to find. Over-prescription degrades output on capable models.
- **No boundaries.** Omitting non-goals invites scope creep. Say what not to touch as clearly as what to build.
- **Padded goal.** The goal is the outcome and why, not a retelling of the conversation. One paragraph.
- **Empty terrain from not looking.** Either genuinely greenfield (say so) or you haven't grepped. Explore first.
- **Specing trivial work.** A one-line fix doesn't need a spec. Use /spec for non-trivial implementations.
