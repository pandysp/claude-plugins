---
name: silent-failures
description: Audit error handling in local code changes for silent failures, inadequate error feedback, and inappropriate fallback behavior. Trigger when the user invokes the silent-failures skill, says "check error handling", "find silent failures", "audit fallbacks", or "review error handling". Also invoke proactively right after writing or modifying error handling. Try-catch blocks, callbacks, fallback logic, retries, or any code that could swallow an error.
---

# Silent failures: audit error handling for hidden failures

First, resolve [the canonical hunter methodology](references/hunter-methodology.md)
relative to the directory that contains this `SKILL.md`—not relative to the
plugin root or its parent `skills/` directory—and read that file completely.
Do not continue from memory or from an adapter's summary if that read fails.
Then run the methodology through the strongest isolated review channel the host
provides. The findings are for **your** grounding. Synthesize before surfacing
anything to the user.

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
