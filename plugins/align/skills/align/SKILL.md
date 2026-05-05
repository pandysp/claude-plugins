---
name: align
description: Surface what I think we're doing before acting on it. Use when the user types /align, says "let's align first", "check in before you start", "mirror what you're hearing", or asks for a substantive task with interpretive weight. Also invoke for any task with meaningful interpretive weight — the skill is cheap, drafting from the wrong premise isn't. The skill produces a structured manifest exposing every silent commitment so the user can correct course before any artifact is produced.
---

# /align — share understanding before acting

The most expensive failures aren't bad outputs — they're outputs built on a wrong premise. By the time the user sees prose, I've silently committed to: my reading of the request, my chosen approach, my interpretations of source material, my register and format choices, and a hundred small fill-ins for things that weren't specified. Each commitment looks authoritative once written.

This skill inverts that. Before producing any artifact, produce a **manifest** — a structured, scannable summary of every silent commitment. The user reacts. The draft happens only after we're aligned.

## The manifest

Output exactly five blocks. Target <60 seconds to read end-to-end. If a block balloons, that's itself a signal: source is thin, or scope is too broad. Surface the observation rather than padding.

Tag every item with one of:

- `[grounded]` — directly stated in the user's prompt or source material
- `[inferred]` — derived by reasoning from grounded content; show the chain ("inferred from X")
- `[mine]` — autonomously introduced; no derivation from source

The tags answer different questions: `[grounded]` items the user confirms, `[inferred]` items the user corrects by fixing the premise, `[mine]` items the user accepts on merit or overrides. Different correction modes → different tags.

### Block 1 — My read of the task

Paraphrase what the user is asking. State what "done" looks like. Identify the audience.

This catches the most expensive failure: misunderstanding the request itself. If the read is wrong, every subsequent block is downstream of a bad premise.

Example:
- You want a team-facing summary of decisions from the 1:1 — not a personal reflection `[inferred from "they've been waiting to hear what came out of it"]`
- "Done" = ~5–8 lines paste-able into Slack today `[mine]`
- Audience = your direct team `[mine]`

### Block 2 — My approach

Describe the method I'll use. Include scope: what I'll do AND what I'll explicitly NOT do. Surfaces silent strategy commitments — the failure mode where the user asked for a draft and got a strategy doc, or asked for a bug fix and got a refactor.

Example:
- Filter notes to team-affecting items; drop personal items `[inferred from "team update"]`
- Group by impact, not chronologically `[mine]`
- Write in your voice, first person `[mine]`
- NOT addressing the reorg comment in writing — likely better handled verbally `[inferred from "quick update"]`

### Block 3 — What I'm working with

State what source material I'm relying on, and where I'm filling gaps. Two parts:

1. **Source coverage** — what's in the source, with tags.
2. **What I'd invent if not stopped** — explicit list of plausible-sounding details I'd otherwise fabricate.

The "what I'd invent" callout is load-bearing. Use the word "invent" deliberately — this is the anti-fabrication bell. Forcing enumeration makes the invention visible, so details that would have slipped uncited get surfaced as decisions.

Example:
- Headcount +2 SWE EU `[grounded]`
- On-call flagged; manager agreed `[grounded]` — but no commitment on action `[inferred]`
- Reorg mention `[grounded]` — leaving out per Block 2

**What I'd invent if not stopped:**
- Hiring timeline for the +2 SWE (you didn't say)
- Any paraphrased quote beyond literal notes
- Specific dates or numbers not in source

### Block 4 — How I'd render it

State the **shape** (length, structure, container) and a **sample** of the actual output. The sample carries register, voice, and conventions — don't list style attributes the sample reveals on its own.

This catches silent voice drift — terse-vs-verbose, German Protokoll vs. consulting prose.

Example:
- Shape: 5–7 Slack bullets, one line each
- Sample opener: *"Quick update from my Q2 1:1 with Markus —"*

### Block 5 — Blocking questions

List only the questions you genuinely cannot proceed without. Different from gaps you'd fill with defaults — these are forks where any default would be unsafe. If there are none, say so. Don't pad.

Example:
- Slack or email? (changes register and length significantly)
- Should the on-call discussion appear as "raised, no action yet" or be omitted until concrete?

## After the manifest

Stop. Do not draft. Wait for the user to confirm, correct, or re-scope.

Once confirmed, **re-read the manifest before drafting**. The items committed to are now load-bearing. If during drafting something needs to change — a new fill-in, a different approach — pause and surface it: *"I'd like to add X — wasn't in the manifest. OK?"* Don't drift silently.

## Common pitfalls

- **Manifest theater.** Producing a clean manifest and then drifting in the draft. Re-read before drafting; surface deviations explicitly.
- **Padding to look thorough.** Inflating blocks to fill space. If approach is trivial, one bullet is enough. Fluff erodes trust in the items that matter.
- **Hiding inventions in `[inferred]`.** Tagging an autonomous default as `[inferred]` to soften it. If there's no derivation chain to point at, it's `[mine]`.
- **Skipping the "what I'd invent if not stopped" callout.** This is the anti-fabrication bell. If empty, check whether nothing's actually being filled in — or whether the looking has just stopped.
- **Treating the manifest as a contract that locks the draft.** It's a checkpoint, not a contract. Drift during drafting is allowed *when surfaced*, not when silently absorbed.
