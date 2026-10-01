---
name: drive-browser
description: Drive a browser with Playwright as a dual-mode superset. Resilient locators/selectors for debugging your own web app (exact DOM, sub-second timing, CSS-media emulation) and a vision/coordinate loop (screenshot → click x,y → type) for genuinely opaque UI on unknown or messy real sites. Use whenever you actually drive a browser. Reproducing a UI bug in a running web app, automating or scraping a site, filling forms, or walking a checkout. Trigger when the user invokes the drive-browser skill, says "drive my browser", "drive Helium", "drive my real session", or "automate the browser". This is the HOW (the mechanism); the surrounding task and verification workflows decide when to drive. When driving the user's REAL logged-in session, the Safety section is binding.
---

# Drive browser with Playwright

Use Playwright for precise browser actions and for a screenshot-and-click loop.
Pick how to interact by what the page exposes, not by habit.

## Decide: two independent choices

**How you find and act on elements:**
- **Locators** (default). `getByRole`/`getByLabel`/`getByText` first: they
  auto-wait and re-resolve as the page changes. Use CSS only when a locator
  can't express the target. This handles your own app and most real sites.
- **Vision**: only when the structure is genuinely opaque (custom canvas, a
  widget locators can't reach): screenshot → read it → click coordinates.

**Where the page runs:**
- **Clean state or another login**: create a new browser context, either in an
  attached browser or in a fresh launch. Never clear the user's context to get
  a clean one.
- **The user's existing login**: attach to the real browser and use its existing
  context. Read **Safety** first; open a task-owned tab rather than taking over
  an existing one unless asked.

These choices are independent: locators work with an existing login, and vision
works in a fresh context. See [setup and lifecycle recipes](references/recipes.md)
for connection, launch, and cleanup. For multi-step exploration, keep the browser
and page handles in the host's persistent Node REPL rather than reconnecting for
each action.

## Locator mode

Prefer `page.getByRole('button', { name: 'Save' })` and `getByLabel('Email')`.
Use `page.locator(css)` only when needed, and `page.evaluate(fn)` for DOM reads
that locators don't express. Wait for the state you need (`locator.waitFor()`,
`page.waitForURL()`, `page.waitForFunction()`), not a guessed delay. For CSS-media
features, use `page.emulateMedia({ reducedMotion: 'reduce' })`.

## Vision mode

Work one step at a time: screenshot → read the PNG → choose coordinates →
`page.mouse.click(x, y)` → screenshot again. Don't write a blind script with
guessed coordinates.

Take viewport screenshots with `page.screenshot({ path: 'step.png', scale: 'css' })`.
Each image pixel then matches a CSS pixel, so use the image coordinates directly
in `page.mouse.click`. Read the image at its original dimensions; a resized
preview changes the coordinates. Re-screenshot after anything that moves controls.

## Form input

Use `locator.fill(text)` for text fields. If a widget needs individual keystrokes,
use `locator.pressSequentially(text)` or focus it and use `page.keyboard.type(text)`.
Use `press()` for keys such as Enter or ArrowDown. Don't assign `el.value` directly
inside `evaluate`; it can leave the app's form state unchanged.

## Safety: binding when driving the user's REAL session

Attaching over CDP gives access to the user's live login without per-action
prompts. You hold the line:
- **Never wipe or reset the default profile.** Its cookies, storage, permissions,
  and open tabs belong to the user. No CDP `clear*`/`reset*` calls there, including
  `Network.clearBrowserCookies`. Use a new context for clean-state work.
- **No irreversible, outward, or financial action without explicit per-action
  confirmation.** Don't submit forms, post, send, delete, purchase, change
  settings, or complete a checkout/booking without it. Hard-stop before payment,
  booking, or entering the user's credentials.
- **Never type the user's passwords or payment details.** The user handles real
  logins; test-account credentials belong in an isolated context.
- **Default to read/navigate-only.** Do exactly what was asked; confirm other
  side effects before acting. Don't export cookies or login tokens without explicit
  permission, and never print their values in logs.
- **Close only what you created.** Close task-owned tabs and contexts even when
  an action fails. Disconnect from an attached browser; don't close its shared
  context, restart it, or stop a host-managed debug service. A browser you launched
  solely for the task is yours to close.
- **Keep debug access local.** Follow the host's endpoint and tunnel instructions;
  don't expose the port to the network. Close task-owned tunnels when done, not
  the user's existing service.

Use raw CDP only for capabilities Playwright lacks or a genuine zero-dependency
requirement.
