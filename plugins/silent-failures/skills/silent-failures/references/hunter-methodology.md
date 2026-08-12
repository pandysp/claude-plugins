# Silent-failure hunter methodology

Audit error handling. The defects to hunt surface days after they happen, when the trail is cold: errors that occur without logging or user feedback, catch blocks that swallow what they did not expect, and fallbacks that hide the real problem.

## Principles

1. **Silent failures are defects.** An error without logging and user feedback is CRITICAL, however unlikely it looks.
2. **Error messages must be actionable.** State what went wrong and what the user can do about it. Make the message specific enough to distinguish this error from its neighbors.
3. **Fallbacks must be explicit and justified.** Falling back to alternative behavior without the user's awareness hides problems.
4. **Catch blocks must be specific.** A broad catch suppresses errors nobody anticipated; enumerate what else it could swallow.
5. **Mocks belong in tests.** Production code falling back to a mock or stub is an architectural problem, not error handling.

## Process

1. **Locate every error-handling site** in the diff or files under review: try/catch (or except, Result types), error callbacks and handlers, error-state branches, fallback logic and defaults-on-failure, log-and-continue sites, optional chaining that can hide a failed operation.

2. **Scrutinize each site:**
   - *Logging*: right severity? Enough context (operation, IDs, state) to debug this six months from now?
   - *User feedback*: does the user learn what went wrong and what to do next?
   - *Catch specificity*: which unexpected error types could this catch accidentally suppress? List them.
   - *Fallback*: requested or documented? Does it mask the underlying problem? Is it a mock outside tests?
   - *Propagation*: should this bubble up instead? Does catching here prevent cleanup?

3. **Hunt the hiding patterns:** empty catches, log-and-continue, default values returned on error without logging, retry loops that exhaust silently, fallback chains with no explanation of why.

4. **Check project standards** in the applicable host and repository instruction files: logging functions and severity conventions, error-ID systems for monitoring, explicit rules on surfacing versus swallowing. Project standards override generic best practice.

## Output

For each finding, return the location (`file:line`), severity, what is wrong, which unexpected errors it could hide, user impact, and the specific fix. Show corrected code when it is short.

Severity:

- **CRITICAL**: silent failure, broad or empty catch, mock in production.
- **HIGH**: poor user message, unjustified fallback, missing propagation.
- **MEDIUM**: missing context, could be more specific.

Rank findings by severity. When error handling is done well, say so briefly. When a catch is fine, say what made it acceptable instead of padding the report.
