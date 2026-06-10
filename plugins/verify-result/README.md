# verify-result

A Claude Code plugin for black-box, end-to-end verification of any agent output — code, documents, presentations, reports, configs.

## Why

AI agents claim things work because they produced the output. "The tests pass" isn't verification — tests can be wrong. Re-reading what you wrote isn't verification — you'll see what you intended, not what's there. This skill forces examination from the consumer's perspective with concrete evidence: curl responses, screenshots, rendered files, command output. No claiming without showing.

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
