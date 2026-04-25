---
name: silent-failures
description: Audit error handling in local code changes for silent failures, inadequate error feedback, and inappropriate fallback behavior. Use after writing or modifying error handling — try-catch blocks, callbacks, fallback logic, retries, or any code that could suppress errors. Triggers on /silent-failures, "check error handling", "find silent failures", "audit fallbacks", "review error handling". Also invoke proactively after touching error handling — the skill is cheap, debugging silent failures in production isn't.
---

# /silent-failures — audit error handling for hidden failures

Delegate the audit to the `silent-failure-hunter` subagent. The subagent runs the methodology in isolation and returns severity-ranked findings. The findings are for **your** grounding — synthesize before surfacing anything to the user.

## How to delegate

Use the Task tool with `subagent_type="silent-failure-hunter"`. Pass the diff or specific files under review (default: `git diff` of unstaged + staged changes). The subagent returns severity-ranked findings.

## How to handle the findings

Findings are for you, not the user. Default handling by severity:

- **CRITICAL** (silent failure, broad/empty catch, mock-in-production) — fix immediately if mid-implementation, or surface for the user to decide
- **HIGH** (poor user message, unjustified fallback, missing propagation) — surface concisely with your recommendation
- **MEDIUM** (missing context, could be more specific) — absorb silently unless several cluster around the same code

Don't paste the subagent's full report. Synthesize what's actionable.

## After the review

- If you fixed issues mid-implementation: briefly note what was fixed
- If nothing actionable: *"Audited error handling. No issues."*
- If user input is needed: present the issues concisely with recommendations, not as a wall

## Anti-patterns

- **Pasting the full subagent report** — defeats the isolation. Synthesize.
- **Treating every finding as user-facing** — most MEDIUM findings are nits; absorb silently.
- **Skipping because "the diff looks fine"** — the subagent's job is to catch what looks fine but isn't.
- **Findings without recommendation** — surfacing raw findings forces the user to do the synthesis. Always pair an issue with a concrete suggested fix.
