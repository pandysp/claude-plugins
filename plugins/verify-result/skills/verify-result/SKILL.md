---
name: verify-result
description: Black-box verification of any agent output. Code, documents, presentations, reports, configs. Examine from the consumer's perspective and show evidence. Use when the user says "verify", "prove it works", "test this end-to-end", "show me it works", "check the document", "does it actually work", or /verify-result. Also trigger proactively after completing implementation (Phase 4 of the development workflow). Verification means using/examining the output as a consumer would, not re-reading what was produced.
---

# /verify-result: prove it works, show evidence

Prove the work actually works. Not by re-reading what you wrote. Not by running unit tests. By examining the output from the consumer's perspective and showing concrete evidence.

"I produced it correctly" is not verification. "The tests pass" is not verification. Verification is: here's what happens when I actually use this thing, look at this thing, run this thing.

## How to verify, by output type

| Output | How to verify |
|---|---|
| Backend API | curl endpoints, check responses |
| Frontend | open browser, click through the flow, read browser/server logs, screenshot each step |
| CLI tool | run with real inputs, show output |
| Library / utility | write a small usage script, execute it |
| Config / infra | verify the effect (does the config actually get read?) |
| Data migration | check data state before and after |
| Bug fix | reproduce the original bug scenario, show it's fixed |
| Refactor | run the same operations, show identical behavior |
| Rendered document (Typst, LaTeX, markdown) | render, open the file, read every page |
| Slide deck | render, open, examine each slide |
| Generated report | open, read, spot-check claims and data |
| Writing / copy | read back, verify references, check claims |

If the work spans multiple types, verify each.

## Procedure

1. **Stand up the environment if needed.** Reuse a running instance if one exists; otherwise start what you need in the background and wait for readiness.

2. **Verify each case**: happy path, error cases, edge cases, and (for bug fixes) the original failure scenario. For each:
   - State what you're checking ("Verifying that POST /api/users returns 201").
   - Show the command, action, or rendered output.
   - Show the result. Paste output, attach screenshot, open the artifact.
   - Assess: does this match expectations? If not, why?

3. **Clean up.** Write verification artifacts (screenshots, logs, test files) to `/tmp/` by default. If any landed in the repo, remove them before reporting.

4. **Report.** Inline as you go; at the end, summarize what was verified, what passed, what failed, and what couldn't be verified, with the reason.

## Inviolable rules

- **No claiming without showing.** Every verification produces visible evidence: command output, response body, screenshot, log line, rendered file. "I verified it works" with nothing to show = you didn't verify.
- **Verify from the consumer's perspective.** Not the producer's. "Does the function return X?" is producer-perspective. "Does the user see X?" / "Does the document say X?" is consumer-perspective.
- **If you can't verify, say so.** Some things genuinely can't be verified in the current environment (no SMTP server, no production data). Name the gap explicitly. Silent skipping is not OK.
- **If verification fails, fix and re-verify.** Failure is a bug to fix, not a status to report. Escalate only when the fix requires a design decision.
