---
name: spec
description: Write the implementation spec — the structured document that drives execution. Use after design is chosen (e.g., via /design-options) and before writing code. Triggers on /spec, "write the spec", "draft the implementation plan", "scope this out". Also invoke proactively when starting non-trivial implementation — a spec catches scope creep, missed reuse opportunities, and unclear verification before code is written.
---

# /spec — write the implementation spec

After the design is chosen, the spec is what the agent reads while implementing. It binds context, approach, files to modify, utilities to reuse, and verification steps into one durable artifact.

Spec quality depends on prior exploration of the relevant code. If you haven't explored, do that first.

## Structure

```
### Context
Why this change is being made — the problem or need it addresses, what prompted it, and the intended outcome. One paragraph.

### Approach
The recommended path. Not alternatives — those were chosen at design time. One paragraph or a short list.

### Files to modify
- `path/to/file` — purpose of this file's change

### Existing utilities to reuse
- `path/to/util` — what it does and why it fits here

### Verification
How to test end-to-end: commands to run, browser steps to take, expected outputs. Include happy path and the most likely failure modes.
```

## Sizing

Concise enough to scan in one pass, detailed enough to execute without re-deciding. If the spec exceeds two screens, the work is too coarsely scoped — split it.

## Common pitfalls

- **Padded context.** "Context" is the why, not the what. One paragraph.
- **Listing alternatives.** The spec documents the chosen path with brief rationale ("chose X over Y because Z"). Save the full option exploration for /design-options.
- **Empty "Existing utilities to reuse."** Either the section is genuinely empty (rare for non-greenfield work — if so, say so explicitly), or you haven't searched. Grep first; spec second.
- **Vague verification.** "Test the feature" doesn't pass review. Replace with "run X, expect Y" / "open page Z, see N elements" / "GET /api/foo, expect 200 with body matching schema."
- **Specing trivial work.** A one-line fix doesn't need a spec. Use /spec for non-trivial implementations.
