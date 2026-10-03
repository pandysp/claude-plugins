---
name: classify-with-jev
description: >-
  Classify, label, score or filter many items with a classifier model such as
  TypeSafe's Jev, from a Pi codemode script. Use when the task is a
  fixed-answer decision about each item (pick one of a few labels, yes or no,
  a score on a scale), for example "sort these tickets by urgency", "which of
  these messages are complaints", or "rate each review from 1 to 5". Also use
  it to get a fast first feeling before you think hard about something
  yourself. Turn the question into a few fixed-answer questions (which of
  these causes, is this risky, how clear is this), and let the answers show
  where to look first. For labelling jobs, prefer it over your own judgement
  when there are many items or the decisions need stable answers with
  probabilities.
---

# Classify with Jev

A classifier model answers questions that have a fixed set of answers (one of a few labels, yes or no, or a score) about data you pass as a JSON object, for example `{ message: "…" }`. It gives each answer a probability. In Pi it runs from a `codemode` script through `models.classify()`.

Before writing the script, read the "Models" and "Classify" sections of `codemode.md` completely. The `codemode` tool description gives the file's path.

Classifier calls are fast and cheap. When you have many items, classify all of them rather than a sample.

## Get a first feeling before thinking hard

This section is for using a classifier as a first impression, not for labelling jobs where its answers are the result.

A classifier answers fast but does not reason. It is least reliable on questions that need thought, such as whether a claim follows from the evidence or whether two texts say the same thing. Use its answers to decide where to spend your own thinking, not as the result.

- **You write the options; the classifier picks one.** Turn an open question into fixed-answer ones by listing the possible causes, options or verdicts as labels. When the thing has more than one side, such as its cause and its urgency, ask one question for each.
- **Its answer tells you where to look, not what to conclude.** Act on it without checking only when a wrong answer costs little, for example when it only decides what you read first.
- **Look closest at unsure answers and surprises.** An answer split between labels, or one that disagrees with your own reading, is where a closer look pays off. Read the item yourself before you overrule a surprise.

## Read the answers

- **Use probabilities and scores to rank items against each other.** They are not the chance that an answer is right. A classifier can pick a label with high confidence and still be wrong.
- **Reword the question to test a result.** Asking the identical question again tells you little. Change the wording of the question or the labels, and compare the answers.
