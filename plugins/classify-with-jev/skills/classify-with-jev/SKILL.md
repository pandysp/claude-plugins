---
name: classify-with-jev
description: >-
  Classify, label, score or filter many items with a classifier model such as
  TypeSafe's Jev, from a Pi codemode script. Use when the task is a
  fixed-format decision about each item (pick one of a few labels, yes or no,
  a score on a scale), for example "sort these tickets by urgency", "which of
  these messages are complaints", or "rate each review from 1 to 5". Also use
  it for a fast first feeling before thinking hard about something yourself:
  turn the question into a few fixed-answer questions (which of these causes,
  is this risky, how clear is this) and let the answers show where to look
  first. For labelling jobs, prefer it over your own judgement when there are
  many items or the decisions need stable answers with probabilities.
---

# Classify with Jev

Classifier models answer typed questions about JSON data and return each answer with probabilities. In Pi they run from `codemode` scripts through `models.classify()`.

Before writing the script, read the "Models" and "Classify" sections of `codemode.md` completely. The `codemode` tool description gives the file's path.

Classifier calls are fast and cheap, so classify every item rather than a sample.

## Get a first feeling before thinking hard

A classifier does not reason. Use it as a first impression that tells you where to spend your own thinking, not as the answer.

- **You write the options; the classifier picks.** Turn an open question into fixed-answer ones: list the possible causes, options or verdicts as labels. Ask several questions about the same thing when one is not enough.
- **Its answer decides where you look, not what you conclude.** Act on it unchecked only where being wrong is cheap, such as choosing what to read first.
- **Look closest at unsure answers and surprises.** An answer split between labels, or one that disagrees with your own reading, is where a closer look pays off. Check a surprise before you overrule it.
- **It is weakest where the question needs reasoning**, such as whether a claim follows from the evidence or whether two texts say the same thing.

## Read the answers

- **Read probabilities and scores as a ranking**, not as calibrated chances of being right. A picked label can come with high confidence and still be wrong.
- **Reword to test a result.** Repeating an identical call tells you little. Change the wording of the question or the labels and compare the answers.
