# Recipes: copy-paste scaffolds

Generalised from real working runs. Scripts are ESM (`.mjs`); put them under
`~/scratch/<date>-<slug>/` and `npm i playwright-core` (attach) or `playwright`
(launch) there first.

## 1. Open the debug port on the real browser (macOS / Helium)
```bash
# Fully quit first — relaunching before it's gone throws a launchd race.
osascript -e 'tell application "Helium" to quit'
while pgrep -x Helium >/dev/null; do sleep 1; done
# Launch via LaunchServices WITH the flag (NOT the raw binary).
open -a Helium --args --remote-debugging-port=9222
# Verify: should return the CDP version JSON.
curl -s http://127.0.0.1:9222/json/version | grep -o '"Browser":"[^"]*"'
```
Teardown when done (close the unauthenticated door):
```bash
osascript -e 'tell application "Helium" to quit'; sleep 2; open -a Helium   # normal, no flag
```
Chrome/Chromium proper works the same. Since **Chrome 136** the debug port is
ignored on the *default* profile. If `connectOverCDP` can't connect, relaunch with
`--user-data-dir=/tmp/cdp-profile`. Helium 149 didn't need this in practice, but the
flag self-heals if that ever changes.

## 2. Attach to the real session
```js
import { chromium } from "playwright-core";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];        // the live session (real cookies)
console.log("open tabs:", ctx.pages().map(p => p.url()));
const page = await ctx.newPage();
// ... drive it ...
await browser.close();                    // disconnects only; leaves Helium open
```

## 3. Locator mode: debug your own app (precise + timed + CSS-media)
Illustrative: log in, send something, act inside a transient window, read exact
DOM, emulate a CSS media feature. Prefer locators; assert state instead of waiting
on navigation. (Selectors/labels here are illustrative. Match the real app.)
```js
const page = ctx ? await ctx.newPage() : await browser.newPage();

await page.goto("http://localhost:3000/login");        // default 'load'; avoid 'networkidle' (discouraged; hangs on SSE/WS)
await page.getByLabel("Username").fill(user);          // locators auto-wait + ride the a11y tree
await page.getByLabel("Password").fill(pass);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/chat/**");                   // assert the post-login state; not waitForNavigation (racy/discouraged)

await page.goto("http://localhost:3000/chat/new");
await page.getByPlaceholder("Send a message…").fill("hello");
await page.getByRole("button", { name: "Send" }).click();

// Precise timing: act inside a transient window (e.g. click Stop mid-stream).
await page.waitForFunction(() =>                        // a REAL predicate — never `() => true` (resolves instantly)
  document.querySelector(".is-assistant")?.textContent.startsWith("Thinking"));
await page.waitForTimeout(1500);                        // sit in the gap; or keep polling
await page.getByRole("button", { name: "Stop" }).click();

// Exact DOM read — counts/states locators can't express:
const state = await page.evaluate(() => ({
  assistants: [...document.querySelectorAll(".is-assistant")].map(e => e.innerText.trim()),
}));

// CSS-media emulation:
await page.emulateMedia({ reducedMotion: "reduce" });
const pos = await page.evaluate(() =>
  getComputedStyle(document.querySelector("[data-shimmer]")).backgroundPosition);  // sample twice to see if it moves
```

## 4. Vision mode: genuinely opaque UI
Only when locators can't reach the controls. Iterative loop with YOU as the eyes:
screenshot → Read the PNG → compute coords → click → screenshot again.
```js
// screenshot pixels are scaled by devicePixelRatio; mouse.click wants CSS pixels.
const dpr = await page.evaluate(() => devicePixelRatio);     // 1 fresh-launch, 2 on a Retina real browser
const click = (imgX, imgY) => page.mouse.click(imgX / dpr, imgY / dpr);

await page.goto("https://example.com");
await page.waitForTimeout(2500);
await page.screenshot({ path: "step.png" });                 // <- Read this image, THEN decide the coords below

// From what you SEE in step.png (coords in IMAGE pixels; click() rescales by dpr):
await click(464, 512);                                       // focus a field
await page.keyboard.type("Berlin Hbf");                      // genuinely trusted keystrokes
await page.waitForTimeout(1500);                             // let autocomplete open
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");                          // select first suggestion
await page.screenshot({ path: "after-from.png" });           // re-screenshot — layout may shift before the next click
// ... repeat per field, then click the search button you can see ...

// Recover a selector when one exists but you couldn't guess it:
const fields = await page.evaluate(() =>
  [...document.querySelectorAll("input")].map(i => ({ name: i.name, ph: i.placeholder })));
```

## Gotchas
- `connectOverCDP` + `browser.contexts()[0]` = the real session. A *launched*
  browser starts with one fresh context instead.
- `browser.close()` after `connectOverCDP` only disconnects. It does not close the
  user's browser. The debug port stays open until you quit+reopen the browser.
- Vision coords are screenshot (image) pixels. Rescale by `devicePixelRatio`
  before `mouse.click`, and re-screenshot after anything that reflows.
- `fill`/`keyboard.type` make React inputs update; `el.value = …` does not (see
  SKILL.md "Input that React actually registers").
- Slow SPAs: prefer web-first assertions / `waitForFunction` / `waitForURL` over
  fixed sleeps; fixed sleeps are fine for quick throwaway runs.
- Headless vs headed: headless for deterministic scripted work; attach-to-real is
  inherently headed (it's the user's window).
