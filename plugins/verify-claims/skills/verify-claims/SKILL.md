---
name: verify-claims
description: Identify and verify unverified claims in your own responses. Self-invoke this skill proactively after producing any analysis, diagnosis, root cause explanation, or causal reasoning ("X caused Y", "this broke because...", "they changed..."). Also trigger when you catch yourself using hedging language ("likely", "probably", "presumably", "appears to", "seems like") — that hedging is a signal you're uncertain but might present the claim anyway. Trigger manually on "verify claims", "prove it", "back that up", "check your claims", or /verify-claims.
---

# Verify Claims

## Why This Exists

You construct narratives — plausible stories assembled from pattern-matching — and present them as conclusions. Sometimes confidently, sometimes hedged with "likely" or "probably." Either way, the user can't distinguish your verified knowledge from your confabulations without doing the verification work themselves. This skill forces that work onto you, where it belongs.

## 1. Identify Claims

Scan your most recent substantive response for factual assertions. These are the patterns to look for:

- **Causal claims** — "X caused Y", "this broke because...", "they changed..."
- **State claims** — "the system does X", "this field contains Y", "the config is set to Z"
- **Historical claims** — "this worked before", "it changed between version A and B"
- **Attribution claims** — "someone edited this", "the platform updated their policy"
- **Hedged claims** — anything with "likely", "probably", "presumably", "appears to", "seems like", "suggests that." Hedging is a marker that you know you're uncertain but are stating the claim anyway.

## 2. Extract Unverified Claims

For each claim identified, ask:

> "What is my proof for this specific claim?"

If the answer is any of:
- "My training data"
- "It's the most plausible explanation"
- "It's how these things usually work"
- "I inferred it from context"
- Nothing

...then it's an **unverified claim**.

List each unverified claim with:
- The exact text
- Why it's unverified (what proof is missing)
- Whether it was stated confidently or hedged

## 3. Plan Verification

For each claim, identify the right verification approach based on claim type:

| Claim type | Verification method |
|---|---|
| Platform/API behavior | Changelogs, docs, community posts |
| Current code/system state | Read the code, grep the codebase |
| Historical state | git log, git blame, execution logs |
| Causal ("X caused Y") | Need proof for both: X happened AND Y follows from X |
| Quantitative | Run the measurement |
| External fact | Authoritative sources, expert communities |

## 4. Execute

Run each verification. Classify the result:

- **VERIFIED** — Definitive proof found. Cite it.
- **PARTIAL** — Some parts of the claim are proven, others aren't. State exactly which parts are proven and which aren't.
- **INCONCLUSIVE** — Searched, found nothing either way. State what you searched.
- **DISPROVEN** — Found proof contradicting the claim. State what's actually true.
- **UNVERIFIABLE** — No feasible way to check. Explain why.

## 5. Report

Present results to the user. For each claim:
- VERIFIED: state the proof
- PARTIAL: state what's proven, what isn't, and what would close the gap
- INCONCLUSIVE: do NOT restate the claim as a conclusion — tell the user what you couldn't establish
- DISPROVEN: correct the record
- UNVERIFIABLE: flag the uncertainty explicitly

## The Hard Part

The hardest claims to catch are the ones that feel obvious. "Make.com tightened their enforcement" felt like analysis, not a claim needing verification. But it was a narrative — a plausible story that fit the observations. Multiple narratives can fit the same data. Your job is to find proof that distinguishes between them, or honestly say you can't.

A narrative that fits the data is not proof.
