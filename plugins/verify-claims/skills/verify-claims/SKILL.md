---
name: verify-claims
description: >-
  Identify and verify unverified claims in your own responses. Especially LOAD-BEARING ones: claims about to drive a design decision, commit, diagnosis, or user-visible recommendation. Self-invoke proactively when a claim is about to become the foundation for action. Also trigger when you catch yourself using hedging language ("likely", "probably", "presumably", "appears to", "seems like"). That hedging is a signal you're uncertain but might present the claim anyway. Trigger manually on "verify claims", "prove it", "back that up", "check your claims", or /verify-claims.
---

# /verify-claims: find the proof or say you can't

You construct narratives (plausible stories assembled from pattern-matching) and present them as conclusions. Sometimes confidently, sometimes hedged with "likely" or "probably." Either way, the user can't distinguish your verified knowledge from your confabulations without doing the verification work themselves. This skill forces that work onto you, where it belongs.

## 1. Identify claims

Scan your most recent substantive response for factual assertions:

- **Causal**: "X caused Y", "this broke because…"
- **State**: "the system does X", "the field contains Y", "the config is set to Z"
- **Historical**: "this worked before", "it changed between A and B"
- **Attribution**: "someone edited this", "the platform updated their policy"
- **Hedged**: anything with "likely", "probably", "presumably", "appears to", "seems like", "suggests that." Hedging is the marker that you know you're uncertain but are stating the claim anyway.

## 2. Extract unverified claims

For each claim, ask: *what is my proof for this specific claim?* If the answer is any of these, the claim is **unverified**:

- "My training data"
- "It's the most plausible explanation"
- "It's how these things usually work"
- "I inferred it from context"
- Nothing

List each unverified claim with: the exact text, what proof is missing, and whether it was stated confidently or hedged.

## 3. Plan verification

Pick the right method per claim type:

| Claim type | Verification method |
|---|---|
| Platform/API behavior | Changelogs, docs, community posts |
| Current code/system state | Read the code, grep the codebase |
| Historical state | git log, git blame, execution logs |
| Causal ("X caused Y") | Need proof for both: X happened AND Y follows from X |
| Quantitative | Run the measurement |
| External fact | Authoritative sources, expert communities |

## 4. Execute and classify

Run each verification. Classify the result:

- **VERIFIED**: definitive proof found. Cite it.
- **PARTIAL**: some parts proven, others aren't. State exactly which.
- **INCONCLUSIVE**: searched, found nothing either way. State what you searched. Do **not** restate the claim as a conclusion.
- **DISPROVEN**: found contradicting proof. Correct the record.
- **UNVERIFIABLE**: no feasible way to check. Explain why.

## The hard part

The hardest claims to catch are the ones that feel obvious. *"Make.com tightened their enforcement"* felt like analysis, not a claim needing verification. But it was a narrative: a plausible story that fit the observations. Multiple narratives can fit the same data. Your job is to find proof that distinguishes between them, or honestly say you can't.

**A narrative that fits the data is not proof.**
