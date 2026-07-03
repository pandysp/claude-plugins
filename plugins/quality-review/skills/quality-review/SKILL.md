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

## The 13 adjectives

| Adjective       | Meaning                                                        |
| --------------- | -------------------------------------------------------------- |
| **unity**       | consistency, cohesiveness, recurring themes, harmony           |
| **vividness**   | strong, clear, detailed, lively, bright, contrasting, dynamic  |
| **authority**   | credibility, confidence, expertise, reliability, assertiveness |
| **economy**     | simplicity, efficiency, minimalist, brevity, maximum effect    |
| **sensitivity** | empathy, resonance, subtlety, nuance, awareness                |
| **clarity**     | transparency, no ambiguity, easy-to-understand, intuitive      |
| **emphasis**    | highlighting key elements, steering attention, focus           |
| **flow**        | seamless transitions, logical progression, 'in the zone'       |
| **suspense**    | anticipation, buildup, keeping engaged                         |
| **brilliance**  | innovation, exceptional creativity, excellence                 |
| **precision**   | accuracy, exactness, consistency, reliability                  |
| **proportion**  | balance, harmony, aesthetic appeal                             |
| **depth**       | complexity, layers of meaning, multiple perspectives           |

This table is the canonical definition of quality. Translate before use: the bare adjectives are not the instrument. The translations live exclusively in `references/` (`docs.md`, `code.md`), one hunting procedure per lens.

## Lens order and promotion

All 13 lenses run at every workflow level. The effort level decides how many get a dedicated finder; the rest share one finder per bucket. This deviates from /code-review, which drops angles at lower levels: its dropped angles are rare-case specialists on homogeneous diffs, while lens relevance varies per artifact, so coverage is not our effort knob.

- **Priority order** (decides promotion): precision, clarity, depth, economy, brilliance, authority, flow, unity, proportion, vividness, sensitivity, emphasis, suspense. This is the plugin author's preference ranking (2026-07-03); it is the tuning surface, to be revised against measured lens yield.
- **Promotion**: the first 3 lenses (high) or 6 (xhigh) get one finder each; at max, every lens does.
- **Buckets**: each unpromoted lens joins its bucket's shared finder. Buckets group lenses whose territories overlap (they flag the same passages), so a duplicate collapses inside one head instead of crossing heads. The membership test is where the fix lands:
  - **ordering** (the fix reorders: move the point up, introduce the term earlier): flow, suspense, sensitivity
  - **salience** (the fix rebalances attention: cut, resize, foreground): emphasis, proportion, economy, brilliance
  - **statement** (the fix rewrites the statement in place): precision, unity, depth, authority, clarity, vividness
- Known cut: emphasis overlaps suspense and flow across the ordering/salience boundary, so a buried-lede quote can surface in both heads. Tolerated for even head workloads: both lenses are bottom-tier, and per-location verification catches the duplicate.
- A bucket whose remainder is a single lens becomes an individual finder; the call is identical either way.

Findings rank by severity first, then verdict, then kind (individual or merged). Kind is only a tiebreaker: it records how the lens was staffed, not how much the finding matters.

Future option, gated on accumulated yield data: let the scope agent pick which lenses to promote for the artifact instead of using the fixed order. Not implemented; the fixed order keeps yield data comparable across runs.

## Level parameters (candidate and finding caps 1:1 with /code-review)

| Level | Mode | Finders | Candidates per lens | Sweep | Max findings |
|---|---|---|---|---|---|
| low | inline | none, one quick pass | – | no | 5 |
| medium | inline | none, one thorough pass | – | no | 10 |
| high | workflow | 6: top 3 individual + ordering head (3 lenses) + salience head (4) + statement head (3) | 6 | no | 10 |
| xhigh | workflow | 9: top 6 individual + ordering head (3) + salience head (2) + statement head (2) | 8 | yes (cap 8) | 15 |
| max | workflow | 13: every lens individual | 8 | yes (cap 8) | 15 |

A bucket head's candidate cap is its lens count times the per-lens cap. The head compositions in the table follow from the priority order and bucket membership; the script derives them, the table just shows the result.

## Procedure

1. Parse the arguments. The first token is the level only if it is one of the five level names; everything else is the target.
2. Determine the domain and read the matching lens sheet from `references/` (`docs.md` or `code.md`). The sheet has one `###` section per lens plus a `## Calibration` section.
3. **Inline (low, medium)**: review the target yourself in one pass, holding the whole sheet. Report only findings you are confident in, most severe first, each with file, verbatim quote, issue, and fix. Low means a quick pass and at most 5 findings; medium means a thorough pass and at most 10.
4. **Workflow (high, xhigh, max)**:
   - Build the `lenses` array from the sheet: one `{key, procedure, bucket}` object per `###` section, sorted into the priority order listed above, with `bucket` set to `ordering`, `salience`, or `statement` per the membership list above. The script computes promotion and bucket heads from the order and membership; do not pass a kind.
   - Build `calibration` from the sheet's `## Calibration` section.
   - Resolve the target to absolute paths.
   - Invoke the Workflow tool with `scriptPath` pointing to `references/audit-workflow.js` inside this skill's base directory, and `args` as a real JSON object (never a string): `{level, target, domain, lenses, calibration}`. The script asserts its inputs and fails fast if args did not arrive.
5. When the workflow result arrives, report:
   - The findings, most severe first, each with file, quote, issue, fix, verdict (CONFIRMED or PLAUSIBLE), and the lens that flagged it.
   - The lens-yield table (raw vs kept per lens) and any counts the workflow dropped or capped, so coverage limits are visible.
6. If `--fix` was passed, apply the findings now: skip any that are wrong or not worth it, keep fixes inside the style rules the scope agent collected, and state per finding what happened (fixed, skipped, or no change needed).
7. Lens yield is the tuner. If the workspace keeps a note tracking lens yield across runs, offer to append this run's numbers to it; reorder the lens priority only when accumulated data warrants it.

## Notes

- The level parameters assume a bounded target, the way /code-review assumes a diff. For targets beyond roughly ten files, run the audit in slices (per directory or per doc set) instead of one giant scope; do not compensate with bigger caps.
- The lens sheets are the single source of truth for both the inline and workflow modes. Do not restate lens content in prompts; read the sheet.
- The code sheet audits the communication half of code only. For correctness bugs, run /code-review; the two do not overlap.
- Findings must quote the artifact verbatim. A finding whose quote does not appear in the file is refuted by definition.
