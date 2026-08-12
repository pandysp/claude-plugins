---
name: silent-failures
description: Audit error handling in local code changes for silent failures, inadequate error feedback, and inappropriate fallback behavior. Trigger when the user invokes the silent-failures skill, says "check error handling", "find silent failures", "audit fallbacks", or "review error handling". Also invoke proactively right after writing or modifying error handling. Try-catch blocks, callbacks, fallback logic, retries, or any code that could swallow an error.
---

# Silent failures: audit error handling for hidden failures

Apply the canonical hunter methodology in this skill through the strongest
isolated review channel the host provides. The findings are for **your**
grounding. Synthesize before surfacing anything to the user.

## Hunter methodology

Audit error handling. The defects to hunt surface days after they happen, when
the trail is cold: errors that occur without logging or user feedback, catch
blocks that swallow what they did not expect, and fallbacks that hide the real
problem.

### Principles

1. **Silent failures are defects.** An error without logging and user feedback
   is CRITICAL, however unlikely it looks.
2. **Error messages must be actionable.** State what went wrong and what the
   user can do about it. Make the message specific enough to distinguish this
   error from its neighbors.
3. **Fallbacks must be explicit and justified.** Falling back to alternative
   behavior without the user's awareness hides problems.
4. **Catch blocks must be specific.** A broad catch suppresses errors nobody
   anticipated; enumerate what else it could swallow.
5. **Mocks belong in tests.** Production code falling back to a mock or stub is
   an architectural problem, not error handling.

### Process

1. **Locate every error-handling site** in the diff or files under review:
   try/catch (or except, Result types), error callbacks and handlers,
   error-state branches, fallback logic and defaults-on-failure,
   log-and-continue sites, and optional chaining that can hide a failed
   operation.
2. **Scrutinize each site:**
   - *Logging*: right severity? Enough context (operation, IDs, state) to debug
     this six months from now?
   - *User feedback*: does the user learn what went wrong and what to do next?
   - *Catch specificity*: which unexpected error types could this catch
     accidentally suppress? List them.
   - *Fallback*: requested or documented? Does it mask the underlying problem?
     Is it a mock outside tests?
   - *Propagation*: should this bubble up instead? Does catching here prevent
     cleanup?
3. **Hunt the hiding patterns:** empty catches, log-and-continue, default values
   returned on error without logging, retry loops that exhaust silently, and
   fallback chains with no explanation of why.
4. **Check project standards** in the applicable host and repository
   instruction files: logging functions and severity conventions, error-ID
   systems for monitoring, and explicit rules on surfacing versus swallowing.
   Project standards override generic best practice.

### Reviewer output

For each finding, return the location (`file:line`), severity, what is wrong,
which unexpected errors it could hide, user impact, and the specific fix. Show
corrected code when it is short.

- **CRITICAL**: silent failure, broad or empty catch, mock in production.
- **HIGH**: poor user message, unjustified fallback, missing propagation.
- **MEDIUM**: missing context, could be more specific.

Rank findings by severity. When error handling is done well, say so briefly.
When a catch is fine, say what made it acceptable instead of padding the report.

## How to run the isolated review

Use this capability order:

1. **Plugin-provided hunter available**: delegate the target to the specialized silent-failure reviewer. It is a thin host adapter over the same canonical methodology.
2. **Fresh subagent available**: spawn one read-only, peer-strength reviewer in fresh context. Pass the target and the canonical methodology without adding your own verdicts or suspected findings.
3. **No independent worker available**: apply the methodology inline and label the result as self-review. Do not pretend that it had isolation.

Pass the diff or specific files under review; default to the unstaged and staged local changes. The reviewer returns severity-ranked findings.

## How to handle the findings

Findings are for you, not the user. Default handling by severity:

- **CRITICAL** (silent failure, broad/empty catch, mock-in-production): fix immediately if mid-implementation, or surface for the user to decide
- **HIGH** (poor user message, unjustified fallback, missing propagation): surface concisely with your recommendation
- **MEDIUM** (missing context, could be more specific): absorb silently unless several cluster around the same code

Don't paste the subagent's full report. Synthesize what's actionable.

## After the review

- If you fixed issues mid-implementation: briefly note what was fixed
- If nothing actionable: *"Audited error handling. No issues."*
- If user input is needed: present the issues concisely with recommendations, not as a wall

## Common pitfalls

- **Pasting the full subagent report**: defeats the isolation. Synthesize.
- **Treating every finding as user-facing**: most MEDIUM findings are nits; absorb silently.
- **Skipping because "the diff looks fine"**: the subagent's job is to catch what looks fine but isn't.
- **Findings without recommendation**: surfacing raw findings forces the user to do the synthesis. Always pair an issue with a concrete suggested fix.
