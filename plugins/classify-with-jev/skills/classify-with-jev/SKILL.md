---
name: classify-with-jev
description: Classify, label, score or filter many items with a classifier model such as TypeSafe's Jev, from a Pi codemode script. Use when the task is a fixed-format decision about each item (pick one of a few labels, yes or no, a score on a scale), for example "sort these tickets by urgency", "which of these messages are complaints", or "rate each review from 1 to 5". Prefer it over your own judgement for many items or for decisions that need stable answers with probabilities. Not for open-ended questions or reasoning.
---

# Classify with Jev

Classifier models answer typed questions about JSON data and return each answer with probabilities. In Pi they run from `codemode` scripts through `models.classify()`.

Before writing the script, read the "Models" and "Classify" sections of `codemode.md` completely. The `codemode` tool description gives the file's path.
