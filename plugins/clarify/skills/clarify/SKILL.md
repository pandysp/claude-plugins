---
name: clarify
description: Surface and resolve underspecified decisions before designing. Use after task interpretation and terrain mapping, when you've understood what's being asked AND what's already there but still need user input on judgment calls — boundaries and scope, edge behavior, trade-offs and calibration, integration with surroundings, hard constraints, audience specifics. Triggers on /clarify, "any clarifying questions", "what should I confirm", "before designing, what's unclear". Also invoke proactively before substantive design or planning work — designing without resolving ambiguities locks them in silently.
---

# /clarify — exhaust questions before designing

By the time you're about to propose design options, three things are typically true: you understand what the user is asking, you understand the existing terrain, and there are still unresolved **synthesis questions** — places where task + terrain leave something genuinely undecided.

This skill is the discipline of **surfacing those questions before designing, not after**. Locking a design around a hidden assumption is more expensive than asking up front.

## Dimensions to cover

Skip dimensions that aren't load-bearing for the current task. For each one, ask only what's genuinely unclear:

- **Scope & boundaries** — what's in, out, deferred. *(handle the legacy endpoint? include the reorg comment? cover Q4 in this proposal?)*
- **Edge & extreme behavior** — what happens at unusual conditions. *(empty input list, stakeholder unreachable, contradictory source notes, market downturn)*
- **Trade-offs & calibration** — where on the spectrum to land. *(terse vs. detailed, monolith vs. microservice, formal vs. casual register, depth-first vs. breadth-first)*
- **Integration with surroundings** — what must this fit alongside or interact with? *(adjacent module contracts, prior correspondence with this client, established positioning)*
- **Hard constraints** — what would create downstream problems if violated? *(compliance, deadlines, budget, brand positioning, contractual commitments)*
- **Audience specifics** — what does the actual consumer of this need? *(technical vs. layperson, German formal Sie vs. English casual, internal vs. external)*

## What to surface

Ask only what's genuinely unclear AND would change the design. Skip:

- Questions you can confidently answer from task + terrain.
- Questions where the answer wouldn't change the proposed options.

Group related questions. If a dimension has no open question, say so briefly — shows you considered it.

## Format

Each question:

- **Specific phrasing** — not *"any thoughts on edge cases?"* but *"should empty input return [] or raise InvalidInput?"*
- **A default when applicable** — your recommendation, so the user can say "default" instead of fully responding.

Example:

> ### Scope & boundaries
> - Include the legacy v1 endpoint? My read: no.
>
> ### Edge & extreme behavior
> - Empty input list — return [] *(default)* or raise InvalidInput?
>
> ### Trade-offs & calibration
> - Terse Slack-style or longer email-style for the update? *(default: Slack-style)*
>
> ### Hard constraints
> - No open questions — adjacent code suggests <100ms target is fine.

## When the user defers

If the user says *"whatever you think is best"*, *"you decide"*, or similar:

- Provide a specific recommendation per question.
- Get explicit confirmation before proceeding.
- Don't silently absorb the delegation — surface what you're choosing.

This prevents the *"I assumed you wanted X"* failure mode later.

## After clarification

Briefly recap the resolved decisions: *"Confirmed: empty inputs return [], timeouts surface, scope is current API only."* Then proceed to design.

## Common pitfalls

- **Padding with obvious questions.** *"What should I name the function?"* when naming is unambiguous.
- **Asking when you should infer.** If task + terrain imply the answer, commit.
- **Leaving the user to do synthesis.** Specific questions with defaults, not "any thoughts on X?"
- **Ignoring user delegation.** *"Whatever you think"* requires recommendation + confirmation, not silent picking.
- **Mechanical run-through.** Skip dimensions that aren't load-bearing. Don't ask just because the dimension is on the list.
