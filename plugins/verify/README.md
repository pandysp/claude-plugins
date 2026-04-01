# verify

A Claude Code plugin that forces black-box, end-to-end verification of implemented work.

## Why

AI agents claim things work because they wrote the code. "The tests pass" isn't verification — tests can be wrong. This skill makes the agent actually use the system from the outside and show concrete evidence: curl responses, screenshots, command output.

## What it does

1. Reads the git diff to understand what changed
2. Chooses verification strategy (curl, browser, CLI, etc.)
3. Starts services if needed (and tears them down after)
4. Executes verifications and shows evidence inline
5. Checks error cases and edge cases, not just the happy path
6. Reports what was verified, what failed, and what couldn't be verified

## Usage

```
/verify
```

Or just say: "Prove it works."

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install verify@pandysp
```

## License

MIT
