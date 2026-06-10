# silent-failures

A Claude Code plugin that audits local code changes for silent failures, inadequate error handling, and inappropriate fallback behavior.

## Why

Silent failures are among the most expensive defects: an error happens, the system continues, and the consequences surface days later when the trail is cold. This plugin enforces a structured pass over error handling with one rule: **every error must be surfaced, logged, and actionable.**

## How it works

The `silent-failures` skill is a thin orchestrator that delegates to the `silent-failure-hunter` subagent. The subagent applies the full audit methodology in its own context and returns severity-ranked findings; the main agent fixes or surfaces what matters. The verbose methodology never enters the main context.

## Usage

```
/silent-failures
```

Or just describe what you want reviewed: "check error handling in my last commit", "audit fallbacks in the auth module".

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install silent-failures@pandysp
```

## License

MIT
