---
name: verify-code
description: Prove that implemented work actually works by running it end-to-end and showing evidence. Use when the user says "verify code", "prove it works", "test this end-to-end", "show me it works", "does it actually work", "try it out", or /verify-code. Also trigger proactively after completing implementation (Phase 4 of the development workflow). This is about black-box verification from the outside — not reading code, not running unit tests, but actually using the system and showing what happens.
---

# Verify

Prove the work actually works. Not by reading the code. Not by running unit tests. By using the system from the outside, as a user would, and showing concrete evidence.

"I wrote the code correctly" is not verification. "The tests pass" is not verification. Verification is: here's what happens when I actually use this thing.

## Process

### 1. Understand what changed

Read the git diff. Understand what was built, modified, or fixed. Identify the user-facing behavior that should be different now.

### 2. Choose verification strategy

Pick the right approach based on what was built:

| Type | How to verify |
|------|--------------|
| Backend API | curl live endpoints, check response bodies |
| Frontend | Open browser, click through the flow, screenshot each step |
| CLI tool | Run it with real inputs, show output |
| Library/utility | Write a small usage script, execute it |
| Config/infra | Verify the effect (does the config actually get read?) |
| Data migration | Check data state before and after |
| Bug fix | Reproduce the original bug scenario, show it's fixed |
| Refactor | Run the same operations as before, show identical behavior |

If the work spans multiple types, verify each aspect.

### 3. Stand up the environment

If verification requires a running service:

1. **Check first** — is there already a running instance? (`lsof -i :PORT`, `docker ps`, `curl localhost:PORT` etc.) Reuse if available.
2. **Start if needed** — `npm run dev`, `docker compose up -d`, `python manage.py runserver`, whatever's appropriate. Run in background.
3. **Wait for readiness** — don't immediately curl a server that's still booting. Check health endpoints or watch logs for "ready" signals.
4. **Track what you started** — you'll need to tear it down later.

### 4. Execute verifications

Actually run them. For each verification:

- **State what you're checking** — one sentence: "Verifying that POST /api/users creates a user and returns 201"
- **Show the command or action** — the exact curl, the click sequence, the command
- **Show the result** — paste the output, attach the screenshot, show what happened
- **Assess** — does this match expectations? If not, why?

Don't just verify the happy path. Also check:

- **Error cases** — bad input, missing auth, invalid state
- **Edge cases** — empty lists, large payloads, special characters
- **The specific bug scenario** — if this was a bug fix, reproduce the original conditions

### 5. Tear down

After verification is complete, clean up anything you started:

- Kill background servers
- `docker compose down` if you spun up containers
- Remove test data you created (unless it's a real database — ask first)
- Clean up temp files

Don't leave processes running. Don't leave test artifacts behind.

### 6. Report

Report inline as you go — no need for a formal structured report. But at the end, summarize:

- **What was verified** — brief list
- **What passed** — with evidence already shown above
- **What failed** — with evidence. If verification reveals a bug, say so clearly.
- **What wasn't verified and why** — be honest about gaps. "I couldn't verify the email sending because there's no test email server configured" is fine. Silently skipping it is not.

## Rules

**No claiming without showing.** Every verification must produce visible evidence — command output, curl response, screenshot, log line. "I verified it works" with nothing to show = you didn't verify.

**Verify from the user's perspective.** Not from the code's perspective. The question isn't "does the function return the right value?" — it's "does the user see the right thing?"

**If you can't verify, say so.** Some things genuinely can't be verified in the current environment (no SMTP server, no production database, etc.). That's fine — name the gap explicitly so the user knows what still needs manual checking.

**If verification fails, stop and fix.** Don't report "verification complete" with known failures. Either fix the issue and re-verify, or escalate to the user if the fix is unclear.

**Don't trust your own code.** The whole point of verification is that you might be wrong. Approach it like you're checking someone else's work.
