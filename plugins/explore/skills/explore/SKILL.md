---
name: explore
description: Map the terrain before designing. Use before any substantive design or planning step. Codebase changes, doc drafting, strategy decisions, anything with non-trivial structure. Triggers on /explore, "explore first", "what's already there", "map the codebase", "survey the landscape". The output is mostly for my own grounding. Only surprises, hard constraints, and gotchas surface to the user. If exploration was uneventful, that itself is the report.
---

# /explore: map the terrain before designing

Designing without exploring produces options grounded in general priors rather than the actual terrain. They look reasonable in the abstract but don't fit how this codebase / client / domain actually works.

This skill enforces a discipline: **before any design step, systematically map what's already there.** Existing patterns, hard constraints, hooks, and things that would surprise you if you weren't looking.

## Tooling

Match the tool to the operation, not the domain:

- **Autonomous broad exploration.** Spawn the `Explore` subagent: one when scope is known, several in parallel when scope is uncertain or spans subsystems. Each agent gets a *distinct* search focus. Fan out as wide as the terrain warrants, just never duplicate a focus.
- **Targeted lookups.** Use `Grep`/`Read` directly when you need raw content in your own context.
- **Non-codebase sources.** File reads against notes/docs, web search, MCP queries.

## The four phases

The phases apply across domains. Adapt depth and tooling. The *questions* generalize even when the artifacts don't.

### 1. Locate: find what's relevant
What artifacts, sources, prior work, or context are in play? Don't accept the user's framing as the boundary. Adjacent material often turns out to be critical.

### 2. Trace: follow how things connect
Where does data/argument flow? What depends on what? Which derivations are critical?

### 3. Pattern: identify conventions
What recurring shapes and established ways of doing things exist? Fighting them creates friction; fitting them removes it.

### 4. Constrain: name the hard limits
What would create problems if violated? Knowing these upfront prevents proposing options that get killed in review.

## What to surface

Most findings stay in your context. Surface only **surprises**, **hard constraints**, **gotchas**, and **genuine ambiguities** that need user input before design can proceed. If exploration was uneventful, say that plainly. The detailed terrain map stays in your context for the next phase.

## After exploration

Findings are grounding for the next step, typically design. If you're proceeding in a way that ignores something from exploration, surface it: *"I'm doing X despite Y. The reason is..."*

## Common pitfalls

- **Performative exploration.** Reading material to look thorough, without tying findings to design implications.
- **Dumping the reading list.** "I read these 12 files". They want surprises and constraints, not the catalog.
- **Confusing locate with trace.** Listing artifacts isn't tracing how things connect. The phases build on each other.
- **Skipping because the terrain feels familiar.** Map it anyway when the work is non-trivial. The finding you'd skip past is often the one that reshapes the design.
- **Treating exploration as a deliverable.** It's grounding, not a research project. Time-box it.
- **Fanning out the same prompt to multiple Explore agents.** Each agent should have a distinct search focus, otherwise you're paying 3× for the same answer.
