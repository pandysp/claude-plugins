# silent-failures

A Claude Code, Codex, and Pi plugin that audits local code changes for silent failures, inadequate error handling, and inappropriate fallback behavior.

## Why

Silent failures are among the most expensive defects: an error happens, the system continues, and the consequences surface days later when the trail is cold. This plugin enforces a structured pass over error handling with one rule: **every error must be surfaced, logged, and actionable.**

## How it works

The skill owns one canonical hunter methodology. Claude Code's named `silent-failure-hunter` is a thin adapter that loads it; Codex gives the same method to a fresh reviewer. When the host has no independent worker, the skill runs inline and labels the reduced isolation. The main agent fixes or surfaces what matters instead of pasting the full reviewer report.

## Usage

- Claude Code: `/silent-failures`
- Codex: `$silent-failures`
- Pi: `/skill:silent-failures`

Or just describe what you want reviewed: "check error handling in my last commit", "audit fallbacks in the auth module".

## Installation

See the repository's [Claude Code, Codex, and Pi instructions](../../README.md).

## License

MIT
