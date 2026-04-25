---
name: align
description: Surface what I think we're doing before acting on it. Use when the user types /align, says "let's align first", "check in before you start", "mirror what you're hearing", or asks for a substantive task with interpretive weight. Also invoke for any task with meaningful interpretive weight — the skill is cheap, drafting from the wrong premise isn't. The skill produces a structured manifest exposing every silent commitment so the user can correct course before any artifact is produced.
---

# /align — share understanding before acting

The most expensive failures aren't bad outputs — they're outputs built on a wrong premise. By the time the user sees prose, I've silently committed to: my reading of the request, my chosen approach, my interpretations of source material, my register and format choices, and a hundred small fill-ins for things that weren't specified. Each commitment looks authoritative once written. The user is left reverse-engineering what was given vs. what I made up.

This skill inverts that. Before producing any artifact, produce a **manifest** — a structured, scannable summary of every silent commitment. The user reacts. The draft happens only after we're aligned.

## The manifest

Output exactly five blocks. Keep the whole thing scannable — target <60 seconds to read end-to-end. If a block balloons, that's itself a signal: source is thin, or scope is too broad. Surface that observation rather than padding.

Tag every item with one of:

- `[grounded]` — directly stated in the user's prompt, source material, or other verifiable anchor
- `[inferred]` — derived by reasoning from grounded content; show the chain ("inferred from X" or "reading X as Y")
- `[mine]` — autonomously introduced; no derivation from source — this is my contribution

The tags exist because they answer different questions. `[grounded]` items the user confirms. `[inferred]` items the user corrects by fixing the premise (the reasoning chain). `[mine]` items the user accepts on merit or overrides. Different correction modes → different tags.

### Block 1 — My read of the task

Paraphrase what the user is asking. State what "done" looks like. Identify the audience.

This block catches the most expensive failure: misunderstanding the request itself. If the read is wrong, every subsequent block is downstream of a bad premise — fixing prose is whack-a-mole.

Example:

- You want a team-facing summary of decisions from the 1:1 — not a personal reflection `[inferred from "they've been waiting to hear what came out of it"]`
- "Done" = ~5–8 lines paste-able into Slack today `[mine]`
- Audience = your direct team `[mine]`

### Block 2 — My approach

Describe the method I'll use to produce the output. Include scope: what I'll do AND what I'll explicitly NOT do. This block surfaces silent strategy commitments — the failure mode where the user asked for a draft and got a strategy doc, or asked for a bug fix and got a refactor.

Example (writing):

- Filter notes to team-affecting items; drop personal items `[inferred from "team update"]`
- Group by impact, not chronologically `[mine]`
- Write in your voice, first person `[mine]`
- NOT addressing the reorg comment in writing — likely better handled verbally `[inferred from "quick update"]`

Example (coding):

- Add a new module rather than extending the existing one `[mine]`
- Scope: only the auth path; not touching the session layer `[grounded — you said "auth only"]`
- NOT adding tests this round — you'd asked for a quick spike `[grounded]`

### Block 3 — What I'm working with

State what source material I'm relying on, and where I'm filling gaps. Two parts:

1. **Source coverage** — what's in the source, with tags for how I'm using it
2. **What I'd invent if not stopped** — explicit list of plausible-sounding details I'd otherwise fabricate to fill silent gaps

The "what I'd invent" callout is load-bearing. Use the word "invent" deliberately here — this is the anti-fabrication warning bell. Forcing enumeration of plausible fill-ins makes the invention visible. Details that would have slipped uncited into the output get surfaced as decisions.

Example:

- Headcount +2 SWE EU `[grounded]`
- On-call flagged; manager agreed `[grounded]` — but no commitment on action `[inferred]`
- Reorg mention `[grounded]` — leaving out per Block 2

**What I'd invent if not stopped:**

- Hiring timeline for the +2 SWE (you didn't say)
- Any paraphrased quote beyond literal notes
- Specific dates or numbers not in source

### Block 4 — How I'd render it

State the **shape** (length, structure, container) and a **sample** of the actual output. The sample carries register, voice, and conventions — don't list style attributes the sample reveals on its own; that's padding.

This block catches silent voice drift — terse-vs-verbose, German Protokoll vs. consulting prose.

Example (writing):

- Shape: 5–7 Slack bullets, one line each
- Sample opener: *"Quick update from my Q2 1:1 with Markus —"*

Example (coding):

- Shape: single-file change, ~30 lines, no new abstractions
- Sample signature: `def authenticate(token: str) -> User | None`

### Block 5 — Blocking questions

List only the questions I genuinely cannot proceed without. These are different from gaps I'd fill with defaults — these are forks where any default would be unsafe.

If there are no blocking questions, say so. Don't pad.

Example:

- Slack or email? (changes register and length significantly)
- Should the on-call discussion appear as "raised, no action yet" or be omitted until concrete?
- Is the headcount approval public on your team, or still confidential?

## After the manifest

Stop. Do not draft. Wait for the user to:

- Confirm the manifest as-is
- Correct specific items or blocks
- Re-scope the task entirely (e.g., "actually I just want strategy thoughts, not a draft")

Once confirmed, **re-read the manifest before drafting**. The items committed to are now load-bearing. Stay traceable to them.

If during drafting something needs to change — a new fill-in, a different approach, a register choice — pause and surface it: "I'd like to add X — wasn't in the manifest. OK?" Don't drift silently.

## Why this works

Three principles:

1. **Premise-first correction is cheaper than output-first correction.** If the read of the task is wrong, fixing the prose is whack-a-mole. Fixing the misunderstanding fixes everything downstream of it.

2. **Enumeration defeats plausibility-based fabrication.** When I have to write "I'd invent X if not stopped," the act of writing it makes the invention visible. Plausible details that would have slipped into the output get surfaced as choices.

3. **Origin tags expose the load-bearing items.** Not every item needs the same scrutiny. `[grounded]` items get confirmed quickly. `[inferred]` items get poked at on their reasoning. `[mine]` items get accepted on merit or overridden. Attention goes where it earns the most.

## What this is not

- **Not a clarifying-questions volley.** The manifest commits to specific reads, approaches, and choices — I'm showing my work, not asking permission on every detail.
- **Not a contract that locks the draft.** It's a checkpoint. Drift during drafting is allowed when justified, but must be surfaced — not silently absorbed into the output.
- **Not a substitute for reading source.** Block 3 requires actually reading what's there, not summarizing the prompt from memory. If source is too long to fully read, say so explicitly in the manifest.

## Anti-patterns

- **Manifest theater**: Producing a clean manifest and then drifting in the draft. Re-read before drafting; surface deviations explicitly.
- **Padding to look thorough**: Inflating blocks to fill space. If there are no blocking questions, say so. If approach is trivial, one bullet is enough. Fluff erodes trust in the items that matter.
- **Hiding inventions in `[inferred]`**: Tagging an autonomous default as `[inferred]` to soften it. If there's no derivation chain to point at, it's `[mine]`.
- **Skipping the "what I'd invent if not stopped" callout**: This is the anti-fabrication bell. If it's empty, check whether nothing is actually going to be filled in — or whether the looking has just stopped.
