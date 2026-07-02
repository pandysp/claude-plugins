---
name: quality-review
description: >-
  Multi-lens quality audit of docs, code, or other artifacts using the 13-adjective quality rubric. Use when the user asks for a quality review, quality audit, docs audit, "run the rubric", "audit these files", or /quality-review. Levels range from low (single inline pass) to max (full 13-lens workflow with sweep). Pass --fix to apply confirmed findings after the review.
---

# /quality-review — multi-lens quality audit

Usage: `/quality-review [level] [--fix] [--domain docs|code] [<target>]`

- **level**: `low` | `medium` | `high` (default) | `xhigh` | `max`. Low runs one inline pass with the whole lens sheet (a gate). Medium and above launch the audit workflow with one finder per lens (an audit). Xhigh and max add a gap-hunting sweep and raise the candidate budget.
- **--fix**: after the review, apply the findings to the working tree. Skip findings that are wrong or not worth fixing, and run the relevant checks after (for docs, the writing-voice self-test if that skill is available).
- **--domain**: force the lens sheet. Without it, infer from the target: prose and markdown files are `docs`, source files are `code`. If the target mixes both or fits neither, ask.
- **target**: files, directories, or a description of what to audit. Required; if missing, ask what to audit rather than guessing.

## Procedure

1. Parse the arguments. The first token is the level only if it is one of the five level names; everything else is the target.
2. Determine the domain and read the matching lens sheet from `references/` (`docs.md` or `code.md`). The sheet has one `###` section per lens plus a `## Calibration` section.
3. **Level low (gate)**: review the target yourself in one pass, holding the whole sheet. Report at most 5 findings, most severe first, each with file, verbatim quote, issue, and fix. Stop here.
4. **Level medium and above (audit)**: launch the workflow.
   - Build the `lenses` array from the sheet: one `{key, procedure}` object per `###` section (key is the heading, procedure is the section body).
   - Build `calibration` from the sheet's `## Calibration` section.
   - Resolve the target to absolute paths.
   - Invoke the Workflow tool with `scriptPath` pointing to `references/audit-workflow.js` inside this skill's base directory, and `args` as a real JSON object (never a string): `{level, target, domain, lenses, calibration}`. The script asserts its inputs and fails fast if args did not arrive.
5. When the workflow result arrives, report:
   - The findings, most severe first, each with file, quote, issue, fix, verdict (CONFIRMED or PLAUSIBLE), and the lenses that flagged it.
   - The lens-yield table (raw vs confirmed per lens) and any counts the workflow dropped or capped, so coverage limits are visible.
6. If `--fix` was passed, apply the findings now: skip any that are wrong or not worth it, keep fixes inside the style rules the scope agent collected, and state per finding what happened (fixed, skipped, or no change needed).
7. Lens yield is the tuner. If the workspace has the quality-rubric note (`notes/growth/quality-rubric.md`), offer to append the yield numbers to its measured-yield section.

## Notes

- The lens sheets are the single source of truth for both the inline gate and the workflow. Do not restate lens content in prompts; read the sheet.
- The code sheet audits the communication half of code only. For correctness bugs, run /code-review; the two do not overlap.
- Findings must quote the artifact verbatim. A finding whose quote does not appear in the file is refuted by definition.
