# classify-with-jev

Classifies, labels or scores many items with a classifier model such as TypeSafe's Jev. The agent writes a Pi `codemode` script that asks the classifier fixed-format questions (one label, yes or no, a score) about each item and reports the answers with their probabilities.

It also gives the agent a fast first feeling before it thinks hard about something. The agent turns the question into a few fixed-answer questions, and the answers show where to look first, not what to conclude.

Pi only: classifiers run through Pi's `codemode` tool, which Claude Code and Codex do not have.

## Usage

- Pi: `/skill:classify-with-jev`

Or just ask: "Sort these tickets by urgency." / "Which of these messages are complaints?" / "Which of these five causes is most likely?"

## Requirements

- Pi with `codemode` turned on: `"defaultTools": ["+codemode"]` in Pi's settings
- Credentials for a classifier provider, for example `TYPESAFE_API_KEY` or a TypeSafe key in Pi's `auth.json`. Pi's `docs/models.md` lists the providers.

## Installation

See the repository's [installation instructions](../../README.md).

## License

MIT
