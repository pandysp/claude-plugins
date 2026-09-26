---
name: excalidraw
description: Draw diagrams and sketches with Excalidraw in the user's Obsidian vault, then check them with a screenshot. Use when the user asks to draw, sketch or diagram something in Excalidraw or Obsidian, for example "draw a process diagram" or "sketch a tetrahedron".
---

# Excalidraw

You write a short JavaScript file that uses the Excalidraw plugin's drawing commands (`ea`). The helper `draw.mjs` (in this skill's folder) runs it inside Obsidian, opens the drawing and takes a screenshot. You look at the screenshot and fix what is wrong.

## Before you start

- Obsidian must be running with the vault open and the Excalidraw plugin installed. The Obsidian command line tool (`obsidian`) must be turned on: Settings → General → Command line interface.
- Quick check: `obsidian eval code="typeof ExcalidrawAutomate"` must print `=> object`.
- If the user did not say what to draw, ask. If they did not say where to save it, leave out `foldername`: the plugin then uses the user's own drawing folder.

## Steps

1. Write the drawing file (for example `drawing.js`) in a scratch folder, not in the vault.
2. Run `node <this skill's folder>/draw.mjs drawing.js`. It prints the path of the new drawing and of the screenshot.
3. Look at the screenshot. Check for overlaps you did not intend, text sitting on lines, anything cut off, and text that is hard to read.
4. To fix something, edit `drawing.js`. Before running again, delete the drawing your last run made (only that one, never a drawing you did not create): `obsidian delete path="<drawing path>"`.
5. Tell the user where the drawing is and show the screenshot path.

## The drawing file

Write plain lines of JavaScript, with no function around them. `ea` is ready to use, and `await` works. The last line creates the drawing and returns its path.

```js
ea.style.fontFamily = 5;            // hand-drawn font
ea.style.fillStyle = "solid";
ea.style.roundness = { type: 3 };   // rounded corners

ea.style.backgroundColor = "#a5d8ff";
const a = ea.addText(0, 0, "Idea", { box: "box", textAlign: "center", textVerticalAlign: "middle" });
ea.style.backgroundColor = "#b2f2bb";
const b = ea.addText(250, 0, "Done", { box: "box", textAlign: "center", textVerticalAlign: "middle" });

ea.style.backgroundColor = "transparent";
ea.connectObjects(a, "right", b, "left", { endArrowHead: "arrow" });

return ea.create({ filename: "my-drawing", silent: true });   // add foldername: "..." to pick a folder
```

## Useful calls

| Call | What it does |
|---|---|
| `ea.style.strokeColor`, `.backgroundColor`, `.fontSize`, `.strokeStyle` (`"dashed"`), `.strokeWidth` | Style for the next shapes you add |
| `ea.addRect(x, y, w, h)`, `ea.addEllipse(...)`, `ea.addDiamond(...)` | Shapes. Return the shape's id |
| `ea.addText(x, y, text, { box: "box", width, textAlign })` | Text, optionally inside a box. With a box it returns the box's id |
| `ea.connectObjects(idA, "right", idB, "left", { endArrowHead: "arrow" })` | Arrow that stays attached to both shapes |
| `ea.addArrow([[x1, y1], [x2, y2], ...], { endArrowHead: "arrow", startObjectId, endObjectId })` | Arrow with bends, e.g. a loop back |
| `ea.addLine([[x1, y1], ...])` | Line or outline |
| `ea.measureText(text)` | Width and height of text at the current font size |
| `ea.addToGroup([ids])` | Group shapes so they move together |

## Things that trip you up

- With `box`, `width` is the width of the text. The box grows by the padding on each side, so leave room between boxes.
- A filled shape made from a line: close it (last point equals first) and set `ea.getElement(id).polygon = true`.
- `ea.create` never replaces a file. If the name is taken, it adds a number (`my-drawing_0`). Check the path the helper prints: if it has a number you did not choose, the name belongs to another drawing. Pick a new name; do not delete that drawing.
- Good starting points: text at font size 16 or bigger, and about 40 pixels between shapes.
- Full list of commands, by the plugin's author: https://github.com/zsviczian/obsidian-excalidraw-plugin/tree/master/docs/AITrainingData/excalidraw-automate
