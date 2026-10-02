---
name: deep-research
description: >-
  Run a deep, multi-source research job on Flue workers: plan search angles,
  search the web (and X, if a search command for it exists) in parallel, merge
  the findings, have a skeptical worker check each top candidate against its
  primary sources, and synthesize a ranked, cited report with an honest
  coverage record. Use when the user asks for deep research, a research
  report, a landscape or "what are people doing with X" survey, or anything
  that needs many sources checked rather than one quick lookup. Trigger when
  the user invokes the deep-research skill or says "deep research", "research
  this thoroughly", "survey what's out there", or "find and verify". Not for
  single facts a few searches can answer.
---

# Deep research on Flue workers

A ready-made research program for the flue-workflows skill. You stay in charge: you shape the question, pick the search commands, run the program, check its strongest claims yourself and report. The program does the fan-out.

| Phase | Workers | What happens |
|---|---|---|
| Scope | 1 | A few quick searches, then N search angles that cover the question and every user hint |
| Search | N in parallel | Each angle searched with about 15 queries; findings with evidence |
| Merge | 1, no tools | Duplicates merged, candidates ordered by strength of evidence |
| Verify | up to `maxCandidates` in parallel | A skeptical worker opens the primary sources of each candidate |
| Synthesize | 1, no tools | Ranked report with patterns, skepticism, coverage and open questions |

Defaults (8 angles, 14 candidates) mean about 25 workers. With Sonnet 5.5 at high effort such a run took about 90 minutes, and one of 9 search angles hit a 40-minute worker timeout; Opus may be slower.

## 1. Prepare

1. **Read the flue-workflows skill** and follow its setup: a workflow workspace, a credential, and the user's explicit approval for unrestricted local workers. Everything below assumes its `flue.mjs` launcher.
2. **Sharpen the question.** If it is underspecified, ask the user 2–3 questions first. Put scope, period and any named sources into `question` or `hints`.
3. **Find working search commands.** Workers can only use commands that exist on this machine. Check candidates such as `exa-search`, `pplx`, `firecrawl`, `ddgr` and `gh` with `command -v` and one real test query each. List only the ones that returned results, one line each with how to call it, for example:
   - `exa-search search "query" -n 10 --format text (semantic web search); exa-search extract <url...> --format text (read pages)`
   - `gh search repos "query"; gh repo view owner/repo (GitHub)`
4. **X (Twitter) is optional.** If a command such as `x-search` exists and returns posts for a test query, pass its name as `xSearch`. It must accept `"query" [--mode top|latest] [--scrolls N]` and `--url <post-url>`, and print one JSON object per post. Otherwise leave `xSearch` out; the report then states that X was not searched.

## 2. Run

Write the arguments to a file outside the workflow workspace:

```json
{
  "question": "…",
  "hints": ["…"],
  "searchTools": ["…", "…"],
  "xSearch": "x-search",
  "angles": 8,
  "maxCandidates": 14
}
```

Start the program from this skill's `program/` directory in the background, with an empty working directory outside the workflow workspace:

```sh
node /abs/workflow-space/flue.mjs run /abs/path/to/this/skill/program/program.mjs \
  --id research-<slug> --cwd /abs/empty-work-dir \
  --model anthropic/claude-opus-5-5 --effort high --auth pi --access unrestricted \
  --timeout 2400 --concurrency 6 --args-file /abs/args.json
```

- **Credential:** `--auth pi` is an example; use the credential chosen during the flue-workflows setup.
- **Model:** use a model the pinned runtime accepts; `flue.mjs doctor --model …` checks it. `anthropic/claude-opus-5-5` at `--effort high` is the default because the pinned Flue runtime does not list Sonnet 5.5 yet.
- **Waiting:** use the waiting recipe in the flue-workflows skill rather than fixed sleeps.
- **Partial failures:** a failed search angle, check or synthesis is listed in `coverage.failed`, `status` is `partial` and the run exits with code 2.
- **Fatal failures:** if scoping or merging fails, or the search angles return no findings at all, the run exits with code 1 and writes no `result.json`. Read `flue.mjs inspect <id>` and `runs/<id>/events.jsonl` to see why.

## 3. Report

1. Read `runs/<id>/result.json`. `status` is `complete` or `partial`. `coverage` lists the angles, how many candidates were verified, which were not (beyond `maxCandidates`), what the merge dropped, what failed, and whether X was offered (`xCommand`) and actually returned posts (`xSearchesWithResults`).
2. **Check the claims your answer rests on yourself**, against their primary sources, before passing them on. Workers' reports are evidence, not proof.
3. Tell the user the ranking, what you checked yourself, and the coverage gaps: failed angles, unverified candidates, whether X was searched.
4. Fill a real gap with a second, narrower run (fewer angles, a focused question) rather than by stretching the report.
