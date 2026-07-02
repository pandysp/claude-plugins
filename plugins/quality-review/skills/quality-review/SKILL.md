---
name: quality-review
description: >-
  Multi-lens quality audit of docs, code, or other artifacts using the 13-adjective quality rubric. Use when the user asks for a quality review, quality audit, docs audit, "run the rubric", "audit these files", or /quality-review. Levels mirror /code-review (low/medium inline, high and above workflow-backed; default is the session's effort level). Pass --fix to apply confirmed findings after the review.
---

# /quality-review — multi-lens quality audit

Usage: `/quality-review [level] [--fix] [--domain docs|code] [<target>]`

- **level**: `low` | `medium` | `high` | `xhigh` | `max`. If no level is given, use the session's current effort level (what /effort reports); if it cannot be determined, use `medium`. Low and medium run inline in this conversation, tuned for fewer, high-confidence findings. High and above launch the audit workflow. Xhigh and max add a gap sweep and larger candidate budgets.
- **--fix**: after the review, apply the findings to the working tree. Skip findings that are wrong or not worth fixing, and run the relevant checks after (for docs, the writing-voice self-test if that skill is available).
- **--domain**: force the lens sheet. Without it, infer from the target: prose and markdown files are `docs`, source files are `code`. If the target mixes both or fits neither, ask.
- **target**: files, directories, or a description of what to audit. Required; if missing, ask what to audit rather than guessing.

## Lens kinds

The lens sheets in `references/` define 13 lenses in two kinds, mirroring /code-review's correctness angles and merged cleanup finder:

- **Individual lenses** (one finder each, count varies by level), in priority order: emphasis, flow, unity, proportion, depth, sensitivity, authority, brilliance, suspense. Generalists come first and specialists last (brilliance needs novel ideas to bite, suspense needs buildup); the order is the tuning surface, reorder it as yield data accumulates.
- **Merged lenses** (one finder covering all of them, at every level): clarity, economy, precision, vividness. These are judged per sentence in a single reading pass, so separate agents buy duplicates, not coverage.

Findings rank by severity first, then verdict, then kind. Kind is only a tiebreaker: the kinds split by reading mode, not by stakes, so a major merged-lens finding (a factually wrong number, precision) outranks a moderate structural one.

Future option, gated on accumulated yield data: let the scope agent pick which individual lenses fit the artifact instead of using the fixed order. Not implemented; the fixed order keeps yield data comparable across runs.

## Level parameters (1:1 with /code-review)

| Level | Mode | Individual lenses | Candidates per finder | Sweep | Max findings |
|---|---|---|---|---|---|
| low | inline | whole sheet, one pass | – | no | 5 |
| medium | inline | whole sheet, one thorough pass | – | no | 10 |
| high | workflow | first 3 + merged finder | 6 | no | 10 |
| xhigh | workflow | first 5 + merged finder | 8 | yes (cap 8) | 15 |
| max | workflow | first 5 + merged finder | 8 | yes (cap 8) | 15 |

Max differs from xhigh in reasoning effort, not fan-out.

## Procedure

1. Parse the arguments. The first token is the level only if it is one of the five level names; everything else is the target.
2. Determine the domain and read the matching lens sheet from `references/` (`docs.md` or `code.md`). The sheet has one `###` section per lens plus a `## Calibration` section.
3. **Inline (low, medium)**: review the target yourself in one pass, holding the whole sheet. Report only findings you are confident in, most severe first, each with file, verbatim quote, issue, and fix. Low means a quick pass and at most 5 findings; medium means a thorough pass and at most 10.
4. **Workflow (high, xhigh, max)**:
   - Build the `lenses` array from the sheet: one `{key, procedure, kind}` object per `###` section. `kind` is `"individual"` or `"merged"` per the Lens kinds section above; keep the individual lenses in the priority order listed there.
   - Build `calibration` from the sheet's `## Calibration` section.
   - Resolve the target to absolute paths.
   - Invoke the Workflow tool with `scriptPath` pointing to `references/audit-workflow.js` inside this skill's base directory, and `args` as a real JSON object (never a string): `{level, target, domain, lenses, calibration}`. The script asserts its inputs and fails fast if args did not arrive.
5. When the workflow result arrives, report:
   - The findings, most severe first, each with file, quote, issue, fix, verdict (CONFIRMED or PLAUSIBLE), and the lens that flagged it.
   - The lens-yield table (raw vs kept per lens) and any counts the workflow dropped or capped, so coverage limits are visible.
6. If `--fix` was passed, apply the findings now: skip any that are wrong or not worth it, keep fixes inside the style rules the scope agent collected, and state per finding what happened (fixed, skipped, or no change needed).
7. Lens yield is the tuner. If the workspace has the quality-rubric note (`notes/growth/quality-rubric.md`), offer to append the yield numbers to its measured-yield section and to reorder the individual-lens priority when the data warrants it.

## Notes

- The level parameters assume a bounded target, the way /code-review assumes a diff. For targets beyond roughly ten files, run the audit in slices (per directory or per doc set) instead of one giant scope; do not compensate with bigger caps.
- The lens sheets are the single source of truth for both the inline and workflow modes. Do not restate lens content in prompts; read the sheet.
- The code sheet audits the communication half of code only. For correctness bugs, run /code-review; the two do not overlap.
- Findings must quote the artifact verbatim. A finding whose quote does not appear in the file is refuted by definition.
