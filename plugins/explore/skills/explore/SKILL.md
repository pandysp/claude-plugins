---
name: explore
description: Map the terrain before designing. Use before any substantive design or planning step — codebase changes, doc drafting, strategy decisions, anything with non-trivial structure. Triggers on /explore, "explore first", "what's already there", "map the codebase", "survey the landscape". The output is mostly for my own grounding — only surprises, hard constraints, and gotchas surface to the user. If exploration was uneventful, that itself is the report.
---

# /explore — map the terrain before designing

Designing without exploring produces options grounded in general priors rather than the actual terrain. The result is options that look reasonable in the abstract but don't fit how this codebase / this client / this domain actually works.

This skill enforces a discipline: **before any design step, systematically map what's already there.** Existing patterns, hard constraints, hooks, things that would surprise me if I weren't looking.

The output is mostly for my own grounding. Only **surprises, blockers, and gotchas** surface to the user. If exploration was uneventful, that itself is the report.

## The four phases

Adapt depth and tooling to the domain. For coding: `Explore`, `Grep`, `Read`. For writing/strategy: file reads, web search, MCP/qmd queries against the user's notes, conversational context.

### 1. Locate — find what's relevant

What artifacts, sources, prior work, or context are in play? Don't accept the user's framing as the boundary — adjacent material often turns out to be load-bearing.

- *Coding*: entry points, related files, similar features, config.
- *Writing*: source notes, prior drafts, transcripts, related correspondence.
- *Strategy*: market data, prior decisions, competitive landscape, stakeholder context.

### 2. Trace — follow how things connect

Where does data flow? What depends on what? Which derivations are load-bearing?

- *Coding*: call chains, data transformations, dependencies, side effects.
- *Writing*: argument structure, evidence chains, voice/tone propagation.
- *Strategy*: cause-effect chains, dependencies between decisions, downstream impacts.

### 3. Pattern — identify conventions

What recurring shapes and established ways of doing things exist? These constrain design — fighting them creates friction; fitting them creates leverage.

- *Coding*: design patterns, abstraction layers, naming/architectural conventions.
- *Writing*: structural conventions (Protokoll format, email register), house style.
- *Strategy*: industry patterns, the user's own past framings.

### 4. Constrain — name the hard limits

What would create problems if violated? Knowing these upfront prevents proposing options that get killed in review.

- *Coding*: language/runtime constraints, dependency rules, performance budgets.
- *Writing*: audience expectations, legal/compliance limits, length/format requirements.
- *Strategy*: financial runway, contractual commitments, brand positioning.

## What to surface

Most findings are context for yourself. Don't dump them on the user. Surface only:

- **Surprises** — things that contradict the user's apparent expectation or the obvious approach.
- **Hard constraints** that block the obvious approach.
- **Gotchas** — patterns or commitments the user might not remember.
- **Genuine ambiguities** that need user input before design can proceed.

If exploration was uneventful, say so plainly: *"Mapped the terrain. Existing patterns are X, Y. No surprises. Ready for next steps."*

If significant: lead with it. *"Worth flagging before design: [the surprise]."*

The detailed terrain map stays in your context, ready to feed into the next phase.

## After exploration

Findings are now grounding context for whatever comes next — typically design (proposing options), sometimes direct execution, sometimes re-scoping the task itself if exploration revealed something that changes the picture. Anything proposed downstream should be informed by what was found. If proceeding in a way that ignores something from exploration, surface it: *"I'm doing X despite Y — the reason is..."*

## Common pitfalls

- **Performative exploration.** Reading material to look thorough, without tying findings to design implications.
- **Dumping the reading list.** Telling the user "I read these 12 files" when none of them matter. They want surprises and constraints, not the catalog.
- **Confusing locate with trace.** Listing artifacts isn't tracing how things connect. The phases build on each other.
- **Skipping when you "know enough."** That judgment is exactly the one that fails. The skill is cheap. Run it.
- **Treating exploration as a deliverable.** It's grounding before design, not a research project. Time-box it.
