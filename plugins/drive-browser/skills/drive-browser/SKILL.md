---
name: drive-browser
description: Drive a browser with Playwright as a dual-mode superset. Resilient locators/selectors for debugging your own web app (exact DOM, sub-second timing, CSS-media emulation) and a vision/coordinate loop (screenshot → click x,y → type) for genuinely opaque UI on unknown or messy real sites. Use whenever you actually drive a browser. Reproducing a UI bug in a running web app, automating or scraping a site, filling forms, or walking a checkout. Triggers on /drive-browser, "drive my browser", "drive Helium", "drive my real session", "automate the browser". This is the HOW (the mechanism). /run and /verify decide when to drive. When driving the user's REAL logged-in session, the Safety section is binding.
---

# /drive-browser: drive a browser with Playwright

Playwright is a superset of every scriptable browser-automation path: precise
scripting AND a human-like vision loop, on a fresh browser OR the user's real
logged-in one. The trap is following the API's grain. Reflexively reaching for
brittle CSS, or jumping straight to vision, when the right tool sits in between.
**Pick by the target, not by habit.**

## Decide: two independent choices

**How you find and act on elements:**
- **Locators** (default). `getByRole`/`getByLabel`/`getByText` first: they ride
  the accessibility tree, auto-wait, and re-resolve as the DOM churns. CSS
  (`page.locator('input[name="x"]')`) only when a locator can't express the
  target. This handles your own app *and* most real sites.
- **Vision**: last resort, only when the structure is genuinely opaque (custom
  canvas, a widget the a11y tree doesn't expose, selectors that won't resolve):
  screenshot → read it → click coordinates.

**Where the page runs:**
- **Fresh launch**: isolated, deterministic, can't touch the user's session.
  Tests, experiments, scraping.
- **Attach to the real browser**: the user's cookies/session, when the task needs
  their login (read **Safety**).

The axes are orthogonal: you can locator-debug the *real* attached session, or run
vision on a *fresh* launch.

## Locator/selector mode (precise)
Prefer resilient locators over raw CSS. `page.getByRole('button', { name: 'Save' })`,
`getByLabel('Email')`: they auto-wait and survive DOM churn (the right default for
slow SPAs). Drop to `page.locator(css)` / `page.fill(css, v)` only when a locator
can't express the target. Then `page.evaluate(fn)` for exact DOM reads, web-first
waits (`expect(locator).toBeVisible()`, `waitForSelector`, `waitForURL`), and
`page.emulateMedia({ reducedMotion: 'reduce' })` for CSS-media features. Fast,
exact, reproducible. Use it to reproduce a bug, check a streaming caret, test
`prefers-reduced-motion`.

## Vision mode (last resort, for genuinely opaque UI)
Drive by sight only when locators can't reach the controls. It's an **iterative
loop with you as the eyes**: `page.screenshot()` → *read the PNG* → decide
coordinates → `page.mouse.click(x, y)` → `page.keyboard.type(text)` →
re-screenshot to confirm. Don't write it as one blind script with guessed
coordinates.

**Coordinate trap:** `screenshot()` rasterizes at the page's `devicePixelRatio`,
but `mouse.click` takes **CSS pixels**. On the user's real browser on a Retina Mac
(DPR 2) the PNG is 2×. A coordinate read off it is twice too large and misclicks.
Convert: `cssX = imgX / dpr`, where `dpr = await page.evaluate(() => devicePixelRatio)`.
A fresh `chromium.launch()` is DPR 1 (1:1), so this bites exactly the
attach-to-real case vision is for. Re-screenshot after anything that reflows.

## Input that React actually registers
`page.fill` and `page.keyboard.type` make React update; a bare `el.value = …` does
not. Reach for the right one, and know why:
- `keyboard.type` / `mouse.click` → **genuinely trusted** events (`isTrusted`
  true), via CDP's Input domain.
- `fill` → not trusted, but it sets the value through the input's **native setter**
  and fires `input`, which React's value-tracker accepts. (It fires `input` but not
  `change`: `change` is on blur, which can matter for non-React validation.)
- `el.value = x` → fails because no `input` fires *and* React's tracker only sees
  changes made via the native setter. If you must set it inside `evaluate`:
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, x)`
  then dispatch `input`.

## Getting a page
- **Fresh (isolated, can't touch the user's session):**
  `import { chromium } from 'playwright'; const b = await chromium.launch();`
  (or `launchPersistentContext(dir)` to reuse a profile). For tests, experiments,
  scraping that must not touch real logins.
- **Attach to the user's REAL browser (their cookies/session):**
  `import { chromium } from 'playwright-core'; const b = await chromium.connectOverCDP('http://127.0.0.1:9222'); const ctx = b.contexts()[0]; const page = await ctx.newPage();`
  `b.close()` only disconnects. It leaves their browser open.

  The real browser must have been launched with a debug port. On this Mac's
  Helium: fully quit it, then `open -a Helium --args --remote-debugging-port=9222`.
  Use `open -a … --args`, **not** the raw binary (`…/MacOS/Helium &`). The raw
  binary launches an unregistered process (no menu bar; every Dock click spawns a
  new window). Since Chrome 136 the debug port is ignored on the *default* profile;
  Helium 149 didn't need a workaround, but if `connectOverCDP` ever fails to
  connect, relaunch with `--user-data-dir=/tmp/cdp-profile`. Copy-paste setup +
  connect code is in `references/recipes.md`.

## Safety: binding when driving the user's REAL session
`connectOverCDP` gives you their live logged-in session with **no consent prompt
and no per-action gating**. Nothing stands between a tool call and a real,
logged-in action. You hold the line yourself:
- **No irreversible / outward / financial action without explicit per-action
  confirmation**. Don't submit forms, post, send, delete, purchase, change
  settings, or complete a checkout/booking. **Hard-stop before payment, booking,
  or any credential entry.**
- **Never type the user's passwords or payment details** into any field. If a
  login is required, the user does it, or use a throwaway account.
- **The debug port is an unauthenticated door** to every logged-in session while
  it's open. Close it when done (quit + reopen the browser normally). Treat it as
  a security exposure, not a convenience.
- **Default to read/navigate-only.** Do exactly what was asked; surface and
  confirm anything side-effectful before doing it.

## Why Playwright over the alternatives
- **vs raw CDP**: the same protocol with all the plumbing (WebSocket, JSON-RPC
  ids, manual waits, escaped `evaluate` strings). Only for a zero-dependency
  constraint or an exotic CDP capability no wrapper exposes.
- **vs puppeteer-core**: near-identical API but no web-first assertions / locator
  auto-retry, and it flaked attaching to real sites. No advantage over Playwright.
- **vs vision-only / coordinate-only drivers**: they can't emulate CSS media
  (`prefers-reduced-motion`) or do precise DOM/timing, and setting a value without
  real events leaves React forms submitting empty. Playwright covers the vision
  loop *and* the precise work in one tool.

## Setup
- Attaching → `npm i playwright-core` (no browser download).
- Launching fresh → `npm i playwright` then `npx playwright install chromium`.
- Throwaway driver scripts belong in `~/scratch/<date>-<slug>/`, never in a repo.
