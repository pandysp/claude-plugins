#!/usr/bin/env node
// Runs an Excalidraw drawing file inside Obsidian, opens the new drawing,
// fits it to the screen and saves a screenshot.
//
//   node draw.mjs <drawing.js> [screenshot.png]
//
// What a drawing file looks like: see "The drawing file" in SKILL.md.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const [drawingFile, shotArg] = process.argv.slice(2);
if (!drawingFile) {
  console.error("usage: node draw.mjs <drawing.js> [screenshot.png]");
  process.exit(2);
}
const screenshot = path.resolve(shotArg ?? drawingFile.replace(/\.m?js$/, "") + ".png");

// `obsidian eval` prints "=> value" on success and "Error: ..." on failure,
// but exits with 0 either way. Turn failures into real errors.
function obsidian(...args) {
  let out;
  try {
    out = execFileSync("obsidian", args, { encoding: "utf8" }).trim();
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error("the obsidian command was not found. Turn it on in Obsidian: Settings → General → Command line interface.");
    }
    throw err;
  }
  if (out.startsWith("Error")) throw new Error(`obsidian ${args[0]} failed: ${out}`);
  return out;
}
const evalInObsidian = (code) => obsidian("eval", `code=${code}`).replace(/^=> /, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const body = readFileSync(drawingFile, "utf8");
  const drawingPath = evalInObsidian(
    `(async () => { const ea = window.ExcalidrawAutomate; ea.reset();\n${body}\n})()`,
  );
  if (!/\.(md|excalidraw)$/.test(drawingPath)) {
    throw new Error(`the drawing file must end with "return ea.create(...)". It returned: ${drawingPath}`);
  }

  obsidian("open", `path=${drawingPath}`, "newtab");
  // Wait until the drawing is open, then fit it to the screen with room for the toolbar.
  const fit = `(() => { const ea = window.ExcalidrawAutomate;
    ea.setView("active");
    if (ea.targetView?.file?.path !== ${JSON.stringify(drawingPath)}) return "wait";
    if (ea.getViewElements().length === 0) return "wait";  // scene not loaded yet
    ea.viewZoomToElements(false, ea.getViewElements(), 0.15); return "ok"; })()`;
  let state = "wait";
  for (let i = 0; i < 20 && state === "wait"; i++) {
    await sleep(500);
    state = evalInObsidian(fit);
  }
  if (state !== "ok") throw new Error(`the drawing did not open in Obsidian: ${drawingPath}`);
  await sleep(1000);
  // Remove last run's screenshot first, so an old image can never pass as new.
  rmSync(screenshot, { force: true });
  obsidian("dev:screenshot", `path=${screenshot}`);
  if (!existsSync(screenshot)) throw new Error(`no screenshot was saved to ${screenshot}`);

  console.log(`drawing:    ${drawingPath}`);
  console.log(`screenshot: ${screenshot}`);
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
