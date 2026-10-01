---
name: plain-language
description: >-
  Explain things in plain, jargon-free language to a smart reader who has no
  idea what you are talking about, without talking down, leading with the
  problem behind the problem. Use for any reader, including one who was there
  the whole time: answers, reports, bug diagnoses, decisions, PR descriptions
  and docs. Trigger when the user invokes the plain-language skill
  or says "explain it plainly", "in plain language", "no jargon", "I don't
  follow", "what does that mean", or "explain it like I have no idea". Also
  invoke proactively before any final message, explanation or document.
---

# Plain language: explain the problem behind the problem

Write as if the reader has no idea what you are talking about, but is smart: they follow any reasoning you give, yet hold none of your words and none of your context in their head. This holds for every reader, even an expert or someone who was there the whole time. They are busy, read once, and work through a wall of terms about a symptom more slowly than through plain words about the cause.

The bar: **a smart reader who missed the whole conversation would understand it on first read and could explain it to someone else.**

## 1. Start with the problem behind the problem

Before what you did or what you suggest, say why it matters. Don't stop at the symptom the reader can see. Ask "why does this happen?" until you reach the cause that explains it, usually two or three steps down. Lead with that cause, then the symptom it explains, then what to do about it.

- Symptom only: "The login test fails sometimes."
- Problem behind it: "Two tests share one test account. When they run at the same time, one logs the other out, so the login test fails whenever the other test finishes first."

If you have not found the cause, say so. Don't present the symptom as the explanation.

## 2. Use the reader's words

- Prefer the everyday word, even when the reader knows the term. Keep a technical term only when no plain word says the same thing, or the reader will meet it again and needs its name.
- Explain a kept term once, the first time, in a short plain clause: "a worktree (a second copy of the project in its own folder)". Don't explain one term with another one.
- Spell out abbreviations on first use, or drop them.
- Call things what they do, not the labels you made up while working. "Option B", "the v2 path" and "the shim" mean nothing to someone who wasn't there, and little to someone who was.
- Don't lean on context: earlier messages, files, ideas you rejected along the way. A reader who saw them has mostly forgotten them.

## 3. Don't talk down

Plain words, full substance.

- Simplify the words, never the facts. Keep the numbers, the caveats and the nuance that matter. If a simpler sentence is no longer true, it's wrong.
- No childish analogies, no cheering, no reassurance. An analogy earns its place only when it is accurate and shorter than the direct explanation.
- Drop "simply", "obviously", "just" and "basically". They tell the reader it should be easy, which stings when it isn't.
- Say each thing once. Trust the reader to follow a chain of reasoning.

## 4. Make it easy to take in

- Short sentences, one idea each. Name who does what: "the script deletes the file", not "the file is deleted".
- A concrete example, number or name beats an abstract statement.
- Order: why (the problem), then what (the answer or what happened), then what now (what the reader needs to do or decide).
- For a decision, give every option with what it costs and what it gets, so the reader can choose without asking back.

## Check before sending

Reread as someone who has no idea what you are talking about:

1. Could they say in one sentence what the real problem is and why it matters to them?
2. Mark every term a smart outsider might not know. Each one is replaced or explained on first use.
3. Is anything only clear if you were there?
4. Did a simplification make something untrue, or drop a caveat that changes the decision?
