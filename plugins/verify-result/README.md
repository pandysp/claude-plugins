# verify-result

A Claude Code plugin for black-box, end-to-end verification of any agent output — code, documents, presentations, reports, configs.

## Why

AI agents claim things work because they produced the output. "The tests pass" isn't verification — tests can be wrong. Re-reading what you wrote isn't verification — you'll see what you intended, not what's there. This skill forces examination from the consumer's perspective with concrete evidence: curl responses, screenshots, rendered files, command output.

## What it does

1. Picks a verification strategy from a matrix of output types (API, frontend, CLI, document, slide deck, report, writing, etc.).
2. Stands up the environment if needed.
3. Verifies each case (happy path, errors, edges, bug-specific) and shows evidence inline.
4. Cleans up verification artifacts that landed in the repo (default location: `/tmp/`).
5. Reports what was verified, what failed, and what couldn't be verified.

## Usage

```
/verify-result
```

Or just say: "Prove it works." / "Verify the document." / "Check the result."

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install verify-result@pandysp
```

## License

MIT
