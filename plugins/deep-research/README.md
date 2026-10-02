# deep-research

Runs a deep research job on [Flue](https://flueframework.com/) workers. A ready-made program plans search angles, searches the web (and X, when a search command for it exists) in parallel, merges the findings, has a skeptical worker check each top candidate against its primary sources, and writes a ranked, cited report. The report states its coverage: failed angles, unverified candidates and whether X was searched.

The assistant stays in charge. It sharpens the question, picks the search commands that work on the machine, runs the program, and checks the claims its answer rests on before reporting.

## Usage

- Claude Code: `/deep-research:deep-research`
- Codex and Pi: `/skill:deep-research`

Or just ask: "Do deep research on what people are building with model X." / "Survey the open-source options for Y and verify the claims."

## Requirements

- The [flue-workflows](../flue-workflows) plugin, set up as its skill describes, and the user's approval for unrestricted local workers.
- At least one working web search command, such as `exa-search`, `pplx`, `firecrawl` or `gh`. The skill tests which ones work.
- Optional: an X search command (for example `x-search`) that prints one JSON object per post.

A default run (8 angles, 14 verified candidates) uses about 25 workers. With Sonnet 5.5 it took about 90 minutes.

## Installation

See the repository's [installation instructions](../../README.md).

## License

MIT
