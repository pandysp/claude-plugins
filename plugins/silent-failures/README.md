# silent-failures

A Claude Code plugin that audits local code changes for silent failures, inadequate error handling, and inappropriate fallback behavior. The verbose review methodology runs in an isolated subagent, so the main agent's context stays clean.

## Why

Silent failures are among the most expensive defects: an error happens, the system continues, and the consequences surface days later when the trail is cold. By that point the original context is gone, and reproducing the issue is hard.

This plugin enforces a structured pass over error handling with one rule: **every error must be surfaced, logged, and actionable.** No empty catches. No silent swallows. No fallbacks that hide the underlying problem.

## How it works

The `silent-failures` skill is a thin orchestrator that delegates to the `silent-failure-hunter` subagent. The subagent has its own context and applies the full audit methodology — checking logging quality, user feedback, catch specificity, fallback behavior, error propagation — and returns severity-ranked findings.

The main agent uses those findings to fix issues directly or surface what needs user input. The subagent's verbose methodology never enters the main context.

## Usage

```
/silent-failures
```

Or just describe what you want reviewed: "check error handling in my last commit", "audit fallbacks in the auth module", etc.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install silent-failures@pandysp
```

## License

MIT
