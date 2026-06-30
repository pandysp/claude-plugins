# drive-browser

Drive a browser with Playwright as a dual-mode superset — resilient locators for debugging your own web app, and a vision/coordinate loop for genuinely opaque UI on unknown or messy real sites. Runs on a fresh isolated browser, or the user's real logged-in session attached over CDP.

## Why

Two browser jobs that look alike pull in opposite directions. Debugging your own app wants precision — exact DOM reads, sub-second timing, `prefers-reduced-motion` emulation — which locators and `page.evaluate` give you. Surfing an unknown site wants a human-like loop — look, click where you see the control, type — for when no selector reaches the widget. Most tools make you pick one. Playwright does both, so one skill covers both, and the trap it heads off is following the API's grain: reaching for brittle CSS, or jumping straight to vision, when the right tool sits in between.

## Usage

```
/drive-browser
```

Or just describe the task — reproduce a UI bug in a running app, walk a checkout, scrape a page. Fires automatically when the work means driving a browser.

Two independent choices, picked by the target rather than by habit:

- **How you find elements** — resilient locators by default (`getByRole`/`getByLabel`), vision (screenshot → click x,y → type) only when the structure is genuinely opaque.
- **Where the page runs** — a fresh launch (isolated, deterministic) or the user's real browser attached over CDP (their cookies and login).

Copy-paste scaffolds for both modes live in [`references/recipes.md`](./skills/drive-browser/references/recipes.md).

## Requirements

- Node, with `playwright-core` to attach to a real browser (no download) or `playwright` for a fresh launch (`npx playwright install chromium`).
- To attach, the browser must have been launched with a remote debug port. The skill carries the macOS/Helium recipe.

## Safety

Attaching over CDP hands you the user's live logged-in session with no consent prompt and no per-action gating. The skill's Safety section is binding when you do: no irreversible, outward, or financial action without explicit confirmation, a hard stop before payment or credential entry, and the debug port treated as an unauthenticated door to close when done.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install drive-browser@pandysp
```

## License

MIT
