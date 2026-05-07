---
name: align
description: Surface what I think we're doing before acting on it. Use when the user types /align, says "let's align first", "check in before you start", "mirror what you're hearing", or asks for a substantive task with interpretive weight. Also invoke for any task with meaningful interpretive weight — the skill is cheap, drafting from the wrong premise isn't. The skill produces a structured manifest exposing every silent commitment so the user can correct course before any artifact is produced.
---

# /align — share understanding before acting

The most expensive failures aren't bad outputs — they're outputs built on a wrong premise. By the time the user sees prose, you've silently committed to: your reading of the request, your chosen approach, your interpretations of source, your register and format choices, and a hundred small fill-ins for things that weren't specified. Each commitment looks authoritative once written.

This skill inverts that. Before producing any artifact, produce a **manifest** — a structured, scannable summary of every silent commitment. The user reacts. Drafting happens after.

## The manifest

Output exactly five blocks. Target <60 seconds to read. If a block balloons, the source is thin or the scope is too broad — surface that, don't pad.

Tag every item:
- `[grounded]` — directly stated in the prompt or source.
- `[inferred from "X"]` — derived from grounded content; show the chain.
- `[mine]` — autonomously introduced; no derivation from source.

Tags answer different questions: grounded → confirm, inferred → correct the premise, mine → accept or override.

### Block 1 — My read of the task

Paraphrase the request. State the audience. State **why** this matters / what it's for. Note any timing constraints. Form details (length, voice, structure) belong in Block 4.

### Block 2 — My approach

Describe the method. Include scope: what to do AND what to explicitly NOT do. Surfaces silent strategy commitments — asked for a draft, got a strategy doc; asked for a bug fix, got a refactor.

### Block 3 — What I'm working with

Two parts:

1. **Source coverage** — what's in the source, tagged.
2. **What I'd invent if not stopped** — explicit list of plausible-sounding details you'd otherwise fabricate.

The "what I'd invent" callout is the anti-fabrication bell — forcing enumeration makes invention visible; details that would have slipped uncited get surfaced as choices.

Format:

```
- Source fact `[grounded]`
- Derivation from source `[inferred from "..."]`

**What I'd invent if not stopped:**
- A plausible detail not in source
- A specific number or date the source doesn't mention
```

### Block 4 — How I'd render it

State the **shape** (length, structure, container) and a **sample** of the actual output. The sample carries register, voice, conventions — don't list style attributes the sample reveals on its own. Catches silent voice drift.

Format:

```
- Shape: [length, structure, container]
- Sample: *"[an actual opening line of the output, in the intended voice]"*
```

### Block 5 — Blocking questions

Only forks where any default would be unsafe. Different from gaps you'd fill with defaults — those go in Block 3 as "what I'd invent." If there are none, say so. Don't pad.

If you have many blocking questions, you're not aligned — you're under-clarified. Invoke `/clarify` first, then return to align with the gaps closed.

## After the manifest

Stop. Wait for the user to confirm, correct, or re-scope. Once confirmed, **re-read the manifest before drafting** — committed items are load-bearing. If something needs to change during drafting, pause and surface it: *"I'd like to add X — wasn't in the manifest. OK?"* Don't drift silently.

## Common pitfalls

- **Manifest theater.** Clean manifest, then drift in the draft. Re-read before drafting; surface deviations.
- **Padding to look thorough.** Inflating blocks to fill space. If approach is trivial, one bullet is enough.
- **Hiding inventions in `[inferred]`.** If there's no derivation chain to point at, it's `[mine]`.
- **Skipping the "what I'd invent" callout.** The anti-fabrication bell. Empty means either nothing's being filled in, or the looking has stopped.
- **Treating the manifest as a contract.** It's a checkpoint. Drift is allowed *when surfaced*, not when silently absorbed.
- **Confusing align with clarify.** Align commits to specific reads; clarify asks where you're stuck. Different modes.
- **Summarizing from memory instead of reading source.** Block 3 requires actually reading what's there. If source is too long, say so explicitly.
