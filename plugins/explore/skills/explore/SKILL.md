---
name: explore
description: Map the terrain before designing. Use before any substantive design or planning step — codebase changes, doc drafting, strategy decisions, anything with non-trivial structure. Triggers on /explore, "explore first", "what's already there", "map the codebase", "survey the landscape". The output is mostly for my own grounding — only surprises, hard constraints, and gotchas surface to the user. If exploration was uneventful, that itself is the report.
---

# /explore — map the terrain before designing

Designing without exploring produces options grounded in general priors rather than the actual terrain. Sometimes those align; often they don't. The result is options that look reasonable in the abstract but don't fit how this codebase / this client / this domain actually works.

This skill enforces a discipline: **before any design step, systematically map what's already there.** Existing patterns. Hard constraints. Hooks and extension points. Things that would surprise me if I weren't looking.

The output is mostly for my own grounding — I'm building context to design from. Only **surprises, blockers, and gotchas** surface to the user. If exploration was uneventful, that itself is the report.

## The four phases

Adapt depth and tooling to the domain. For coding, lean on `Explore`, `Grep`, `Read`. For writing/strategy, use file reads, web search, MCP/qmd queries against the user's notes, and conversational context.

### 1. Locate — find what's relevant

What artifacts, sources, prior work, or context are in play? Don't accept the user's framing as the boundary — adjacent material often turns out to be load-bearing.

- **Coding**: entry points, related files, similar features, config
- **Writing**: source notes, prior drafts, transcripts, related correspondence
- **Strategy**: market data, prior decisions, competitive landscape, stakeholder context

### 2. Trace — follow how things connect

Once located, trace connections. Where does data flow? What depends on what? Which derivations are load-bearing?

- **Coding**: call chains, data transformations, dependencies, side effects
- **Writing**: argument structure, evidence chains, voice/tone propagation
- **Strategy**: cause-effect chains, dependencies between decisions, downstream impacts

### 3. Pattern — identify conventions

What recurring shapes, conventions, and established ways of doing things exist? These constrain design — fighting them creates friction; fitting them creates leverage.

- **Coding**: design patterns, abstraction layers, naming/architectural conventions
- **Writing**: structural conventions (Protokoll format, email register), house style, established framings
- **Strategy**: industry patterns, the user's own past framings and positioning

### 4. Constrain — name the hard limits

What would create problems if violated? Knowing these upfront prevents proposing options that get killed in review.

- **Coding**: language/runtime constraints, dependency rules, performance budgets, compatibility requirements
- **Writing**: audience expectations, legal/compliance limits, length/format requirements
- **Strategy**: financial runway, contractual commitments, brand positioning, time pressure

## What to surface

Most findings are **context for yourself**. Don't dump them on the user. Surface only:

- **Surprises** — things that contradict the user's apparent expectation or the obvious approach
- **Hard constraints** that block the obvious approach
- **Gotchas** — patterns or commitments the user might not remember
- **Genuine ambiguities** that need user input before design can proceed

If exploration was uneventful, say so plainly: *"Mapped the terrain. Existing patterns are X, Y. No surprises. Ready for next steps."*

If significant: lead with it. *"Worth flagging before design: [the surprise]."*

The detailed terrain map stays in your context, ready to feed into the next phase.

## After exploration

The findings are now grounding context for whatever comes next — typically a design step (proposing options or planning an approach), sometimes direct execution, sometimes re-scoping the task itself if exploration revealed something that changes the picture. Anything proposed downstream should be informed by what was found. If proceeding in a way that ignores something from exploration, surface it: *"I'm doing X despite Y — the reason is..."*

## What this is not

- **Not an exhaustive deliverable.** Cover what's load-bearing for design; ignore the rest.
- **Not a substitute for surfacing task interpretation** (what I think we're doing). That's a separate discipline. This one surfaces what's already there. Natural sequence: clarify the task, map the terrain, then design.
- **Not a research project.** Time-box this. It's grounding before design, not investigation.

## Anti-patterns

- **Performative exploration**: Reading material just to look thorough, without tying findings to design implications.
- **Dumping the reading list**: Telling the user "I read these 12 files" when none of them matter. They want surprises and constraints, not the catalog.
- **Confusing locate with trace**: Listing artifacts isn't tracing how things connect. The phases build on each other.
- **Skipping when you "know enough"**: The judgment that says "I don't need to explore here" is exactly the judgment that fails. The skill is cheap. Run it.
