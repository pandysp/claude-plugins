#!/usr/bin/env node
// Runs an Excalidraw drawing file inside Obsidian, opens the new drawing,
// fits it to the screen and saves a screenshot.
//
//   node draw.mjs <drawing.js> [screenshot.png]
//
// The drawing file is plain lines of JavaScript. `ea` (the Excalidraw plugin's
// drawing commands) is ready to use and `await` works. It must end with
// `return ea.create({ filename, foldername, silent: true });`

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
  const out = execFileSync("obsidian", args, { encoding: "utf8" }).trim();
  if (out.startsWith("Error")) throw new Error(`obsidian ${args[0]} failed: ${out}`);
  return out;
}
function evalInObsidian(code) {
  const out = obsidian("eval", `code=${code}`);
  if (!out.startsWith("=> ")) {
    throw new Error(`obsidian eval returned "${out}". Does the drawing file end with "return ea.create(...)"?`);
  }
  return out.slice(3);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const body = readFileSync(drawingFile, "utf8");
const drawingPath = evalInObsidian(
  `(async () => { const ea = window.ExcalidrawAutomate; ea.reset();\n${body}\n})()`,
);
if (!drawingPath.endsWith(".excalidraw.md")) {
  throw new Error(`the drawing file must end with "return ea.create(...)"; it returned: ${drawingPath}`);
}

obsidian("open", `path=${drawingPath}`, "newtab");
// Wait until the drawing is open, then fit it to the screen with room for the toolbar.
const fit = `(() => { const ea = window.ExcalidrawAutomate;
  ea.setView("active");
  if (ea.targetView?.file?.path !== ${JSON.stringify(drawingPath)}) return "wait";
  ea.viewZoomToElements(false, ea.getViewElements(), 0.15); return "ok"; })()`;
let state = "wait";
for (let i = 0; i < 20 && state === "wait"; i++) {
  await sleep(500);
  state = evalInObsidian(fit);
}
if (state !== "ok") throw new Error(`drawing did not open in Obsidian: ${drawingPath}`);
await sleep(1000);
obsidian("dev:screenshot", `path=${screenshot}`);

console.log(`drawing:    ${drawingPath}`);
console.log(`screenshot: ${screenshot}`);
if (/_\d+\.excalidraw\.md$/.test(drawingPath)) {
  console.log("warning: a drawing with this name already existed, so this one got a number added.");
  console.log("         Delete the old one (obsidian delete path=...) and the numbered copy, then run again.");
}
