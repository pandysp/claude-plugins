# drive-browser

A Claude Code and Codex plugin for driving a browser with Playwright. It uses resilient locators for debugging your own web app and a vision/coordinate loop for genuinely opaque UI on unknown or messy real sites, in a fresh isolated browser or the user's real logged-in session attached over CDP.

## Usage

- Claude Code: `/drive-browser`
- Codex: `$drive-browser`

Or just describe the task. Reproduce a UI bug in a running app, walk a checkout, scrape a page. Fires automatically when the work means driving a browser.

Two independent choices, picked by the target rather than by habit:

- **How you find elements**: resilient locators by default (`getByRole`/`getByLabel`), vision (screenshot → click x,y → type) only when the structure is genuinely opaque.
- **Where the page runs**: a new context for clean-state tests or another login; the existing context only when the task needs the user's login. Either mode supports locators and vision.

Copy-paste scaffolds for both modes live in [`references/recipes.md`](./skills/drive-browser/references/recipes.md).

## Requirements

- Node, with `playwright-core` for attachment (no browser download) or `playwright` and its browser for a fresh launch.
- For attachment, a confirmed local CDP endpoint supplied by the host's instructions or the user. Setup and cleanup are in the [recipes](./skills/drive-browser/references/recipes.md).

## Safety

Attaching over CDP gives access to the user's live login without per-action prompts. Never wipe or reset that profile: use a new context for clean-state work. Close only task-owned pages, contexts, browsers, and tunnels; leave the user's browser and managed debug service running. The skill's Safety section also requires explicit confirmation for irreversible, outward, or financial actions, and a hard stop before payment or entering the user's credentials.

## Installation

See the repository's [Claude Code and Codex marketplace instructions](../../README.md).

## License

MIT
