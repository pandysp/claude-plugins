---
name: plain-language
description: >-
  Explain things in plain, jargon-free language to a smart reader who has no
  idea what you are talking about, without talking down, leading with what
  the reader needs first and why it matters to them. Use for any reader,
  including one who was there the whole time: answers, reports, bug
  diagnoses, decisions, PR descriptions and docs. Trigger when the user invokes the plain-language skill
  or says "explain it plainly", "in plain language", "no jargon", "I don't
  follow", "what does that mean", or "explain it like I have no idea". Also
  invoke proactively before any final message, explanation or document.
---

# Plain language: explain the problem behind the problem

Write as if the reader has no idea what you are talking about, but is smart. They follow any reasoning you give, but they share none of your context: the names you made up, what you found, what you tried. This holds for every reader, even an expert or someone who was there the whole time. An expert still knows their field. They don't know your task.

The bar: **a smart reader who missed the whole conversation would understand it on first read and could explain it to someone else.**

## 1. Find the problem behind the problem

When you write about a problem or a decision, the symptom you can see is rarely what the reader needs. Before you write, dig in two directions:

- **Up: so what?** Keep asking until you reach something the reader notices, loses or pays for. This is why it matters, and the reader needs it more than how things work.
- **Down: why does it happen?** Keep asking until you reach the cause. The cause tells the reader where to act.

How it works step by step is the part you know best and the reader needs least. Explain it only as far as the reader needs to believe the consequence or act on it.

Stop digging when the next answer would not change what the reader understands or does. If you have not found the consequence or the cause, say so instead of presenting the symptom as the explanation.

- Symptom only: "The login test fails sometimes."
- So what: "The team now reruns failing tests until they pass, so a real login bug would get through unnoticed."
- Why: "Two tests share one test account. When they run at the same time, one logs the other out."

## 2. Write for what this reader cares about

- Work out what the reader is responsible for and what they care about, and use that to decide what to say. Your own situation is evidence, not the argument: a maintainer cares what breaks in their project, not what breaks in yours.
- Open with what the reader needs first: what this is about and, if you want something, the request and what it is for. Then what it means for the reader, then the cause. Then the details. If what you ask for can be done in several ways, leave how to the reader and offer yours as an example, unless they asked you to choose.
- For a decision, give every option worth considering, with what it costs and what it gets, so the reader can choose without asking back.

## 3. Use the reader's words

- Prefer the everyday word, even when the reader knows the term. Keep a technical term only when no plain word says the same thing, or the reader will meet it again and needs its name.
- Explain a kept term the reader may not know once, the first time, in a short plain clause: "a worktree (a second copy of the project in its own folder)". Don't explain one term with another one.
- Spell out abbreviations on first use, or drop them.
- Before you write, list the words you have used while working: names you made up ("option B", "the shim") and terms that came with the task. Treat each as jargon until you know the reader uses it too.

## 4. Don't talk down

Plain words, full substance.

- Simplify the words, never the facts. Keep the numbers, the caveats and the nuance that matter. The reader cannot see what you left out, so they act on what you wrote. The small words that limit a claim look like filler and go first when you shorten or simplify: "the upload failed in 2 of 50 test runs" becomes "the upload fails", and the reader cancels a release that almost always works. After every edit, check that each claim is still as strong as your evidence, and no stronger.
- No childish analogies, no cheering, no empty reassurance. An analogy earns its place only when it is accurate and shorter than the direct explanation.
- Drop "simply", "obviously", "just" and "basically". They tell the reader it should be easy, which stings when it isn't.
- Say each thing once. Trust the reader to follow a chain of reasoning.

## 5. Make it easy to take in

- Short sentences, one idea each. Name who does what: "the script deletes the file", not "the file is deleted".
- Watch for several thoughts squeezed into one sentence, often held together by parentheses, semicolons or a chain of "because" and "and". Split them into separate sentences, or cut them.
- A concrete example, number or name beats an abstract statement.

## 6. Check with a reader who doesn't know what you know

You cannot forget what you know, so your own text reads clearer to you than it is. For text that matters outside this conversation, such as documents, issues, pull requests and messages to other people, have it read by someone with none of your context, for example a fresh subagent, if you can start one. Give them only the text and a description of the reader. Ask them:

1. What does the writer want from me?
2. Why should I care?
3. Where did I stop, reread or guess?

Fix what they stumbled on. Ask a fresh reviewer again after any change to the main point or the request.

For routine replies, answer the three questions yourself as that reader. If the text needed a fresh reviewer and you could not start one, do the same and say so.
