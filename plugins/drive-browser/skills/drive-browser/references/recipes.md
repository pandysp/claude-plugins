# Recipes: setup, lifecycle, and actions

Use a persistent Node REPL for multi-step exploration; see the REPL section below.
Sections 2–4 are standalone `.mjs` lifecycle examples that close after their actions.
Keep throwaway scripts and screenshots in the host's scratch directory, not in
the application repo. Read the skill's Safety section before attaching to a real
session.

## 1. Setup

Reuse an existing Node workspace if it can import `playwright-core`. Otherwise,
in a scratch directory, choose one setup:

**Attach to an existing browser** (no browser download):

```bash
npm install playwright-core
```

**Or launch a separate browser:**

```bash
npm install playwright
npx playwright install chromium
```

For attachment, get the CDP endpoint from the host's instructions or the user.
Set `CDP_URL` to that confirmed endpoint; do not assume a port belongs to Helium
just because it responds. Verify the browser and profile before using its login.

```bash
: "${CDP_URL:?Set CDP_URL to the confirmed browser endpoint}"
curl --fail --show-error "$CDP_URL/json/version"
```

If it is unavailable, follow the host's documented service/tunnel setup. Do not
quit or relaunch the user's browser, replace its profile, or stop its debug
service as a workaround. A fresh profile does not recover the user's login.
If no managed endpoint exists, use a fresh launch for clean-state work; ask the
user to enable local debug access when their existing login is required.

## 2. Attach using the user's existing login

Only use this path when the task needs that login. `contexts()[0]` is the shared
context: never close or clear it. Create and close your own page. Put actions
inside the inner `try`; the `finally` blocks also run when an action fails.

```js
import { chromium } from "playwright-core";
const endpoint = process.env.CDP_URL;
if (!endpoint) throw new Error("Set CDP_URL to the confirmed browser endpoint");
const browser = await chromium.connectOverCDP(endpoint);
try {
  const context = browser.contexts()[0];
  const page = await context.newPage();
  try {
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(30_000);
    // ... drive it ...
  } finally {
    await page.close();
  }
} finally {
  await browser.close(); // disconnect; the user's browser stays open
}
```

## 3. Attach with clean state or another login

A new context has its own cookies and storage. Closing it removes only that
context and its pages, not the user's session.

```js
import { chromium } from "playwright-core";
const endpoint = process.env.CDP_URL;
if (!endpoint) throw new Error("Set CDP_URL to the confirmed browser endpoint");
const browser = await chromium.connectOverCDP(endpoint);
try {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(30_000);
    // ... drive it ...
  } finally {
    await context.close();
  }
} finally {
  await browser.close(); // disconnect; the user's browser stays open
}
```

## 4. Launch a separate browser

This browser belongs to the task. Close it on success or failure.

```js
import { chromium } from "playwright";
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(30_000);
  // ... drive it ...
} finally {
  await browser.close(); // closes this task-owned browser and its contexts
}
```

## 5. Locator mode: forms and page state

Put actions like these inside the chosen lifecycle recipe. This example assumes
an isolated test context and a test account, not the user's real credentials.
Selectors and URLs are illustrative: use the actual app's values.

```js
await page.goto("http://localhost:3000/settings");
await page.getByLabel("Display name").fill("Demo account");
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.getByRole("status").getByText("Saved", { exact: true }).waitFor();
```

For a widget that needs keystrokes, use `locator.pressSequentially(text)` rather
than `fill`. Wait for the resulting suggestions or other visible state before
selecting an option. Don't assign `el.value` inside `evaluate`.

## 6. Vision mode: controls locators cannot reach

Use a page from the chosen lifecycle recipe. Take a viewport screenshot and read
it before choosing coordinates. These are separate steps, not a script to run
blindly end to end.

```js
await page.screenshot({ path: "step.png", scale: "css" });
```

Read `step.png` at its original dimensions. Once you have identified the control,
click its image coordinates directly; the numbers below are illustrative.

```js
await page.mouse.click(464, 512);
await page.keyboard.type("Berlin Hbf");
await page.screenshot({ path: "after-input.png", scale: "css" });
```

Read the new screenshot before choosing the next action. Controls may have moved,
and an autocomplete menu may not yet be ready. If the page exposes usable labels
or roles, return to locators rather than continuing with coordinates.

## 7. Persistent Node REPL

In the host's persistent Node REPL, use `await import()` instead of static
`import`, and keep handles at the top level. Start with clean state:

```js
var { chromium } = await import("playwright-core");
if (!process.env.CDP_URL) throw new Error("Set CDP_URL to the confirmed browser endpoint");
var browser = await chromium.connectOverCDP(process.env.CDP_URL);
var context = await browser.newContext();
var page = await context.newPage();
page.setDefaultTimeout(10_000);
page.setDefaultNavigationTimeout(30_000);
```

Run actions one at a time; the connection stays open between them. When finished,
or if you abandon the task after an error, clean up:

```js
await context.close();
await browser.close();
```

For the **user's existing login**, replace the `newContext()` line with
`var context = browser.contexts()[0];` and replace `context.close()` with
`page.close()` in cleanup. Never close the shared context or all of its pages.
After a fresh launch, close the task-owned browser instead.
