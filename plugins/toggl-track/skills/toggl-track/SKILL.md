---
name: toggl-track
description: Interact with Toggl Track time tracking via the official API — track work, fetch entries, build invoice line items, analyze billed hours, manage timers. Use when the user mentions Toggl, time tracking, tracked or billable hours, timesheets, invoicing from tracked time, or timers. Triggers on /toggl-track, "how many hours did I work on X", "track 2 hours for client Y", "reconstruct my day" — even when they don't say "Toggl" but clearly mean their time tracking.
---

# /toggl-track — time tracking via the official API

Read and write the user's Toggl Track data through `scripts/toggl.py` — a zero-dependency Python CLI (any Python 3, no packages to install). The script handles the deterministic parts: auth, pagination, ID-to-name joins, local-to-UTC time conversion, and a deduplicated summary view. You handle the judgment: parsing natural language, resolving fuzzy project references, analysis, and invoice mapping.

Run `python3 scripts/toggl.py --help` (or `<cmd> --help`) for the full interface. Structured output goes to stdout; diagnostics to stderr.

## Setup (first use)

The script needs an API token from https://track.toggl.com/profile, stored in `~/.config/toggl/api_token` (chmod 600) or `$TOGGL_API_TOKEN`. If it's missing, the script says so — walk the user through it once.

Conventions, overridable via environment:
- `TOGGL_BILLABLE_TAG` (default `billable`) — entries carrying this tag count as billable. The Toggl API's own `billable` field is a paid feature and typically `false` for everyone; the tag is what carries intent.

## Rate limit — design every interaction around it

The API allows **30 requests/hour**. The script caches clients/projects/tags for 7 days (`meta` / `--refresh`), so a typical task costs 1–4 requests. Fetch wide date ranges in **one** `entries` call rather than per-month calls, and reuse output you already have in context instead of refetching. Writes verify themselves — `track` echoes the stored entry back, so a separate readback spends quota for nothing. A day's reconstruction should cost about one call per entry, plus at most one `entries`/`summary` at the very end if the user wants a recap.

## Reading and analysis

- `summary --month 2026-05` — deduplicated items per client → project with subtotals, billable flags, decimal hours. Human table; `--json` for data.
- `entries --start 2026-03-01 --end 2026-04-30` — raw entries as JSON.

For analysis questions ("which client brought the most billed hours in March and April?"), fetch the range once with `entries`, then compute the answer yourself — do not push analysis features into the script.

## Invoice preparation

The line items of an invoice are the **deduplicated descriptions** per client and period — exactly what `summary` emits. Map `items[].item` to invoice line descriptions and `items[].hours` (decimal) to quantities. Only `billable` items go on an invoice; `internal` ones never do.

Do not round durations and do not "correct" numbers downstream. Toggl is the single source of truth: if a duration looks unrounded (e.g. `0:52` where everything else is clean quarter-hours), surface it and offer to fix the entry in Toggl via `edit` — never adjust the figure in the invoice instead.

## Writing — confirmation scales with inference, not with writing

Time entries are billing data, but they are also cheap to reverse (`edit` and `delete` verify themselves). The real irreversibility boundary is the invoice — so confirm in proportion to how much **you** inferred, not the mere fact of writing:

- **User dictated everything** (explicit project, times, billable): their instruction is the confirmation. Write it and echo the stored result — asking again is friction theater.
- **You inferred parts** (fuzzy project match, guessed billable flag, inferred times, a new client/project): confirm the inferred parts, batched into one question — not item-by-item ceremony.
- **Reconstruction plans** (wholesale inference): one consolidated plan confirmation; separate questions only for genuine ambiguities.
- **`edit`/`delete` of past entries**: always confirm — an old entry may already be on a sent invoice. `delete` additionally refuses without `--confirm` (prints a preview, exits 3), and even with the flag, delete only on an explicit user instruction naming what to remove.

Always resolve projects via `meta` (cached) before writing, and report what the API returned (IDs, stored times) after. Times you pass are **local** (`--date 2026-06-05 --start 10:00 --stop 12:00`); the script converts to UTC for the API. Sanity-check what comes back.

If work belongs to a project that doesn't exist yet, `new-project --name X --client Y` creates both in **one** call (the client is created by name if missing) and patches the local cache — `track --project X` resolves immediately afterwards, no `meta --refresh` needed.

Example — "track work for acme: 10-12 was API design, 13-18 implementation":

```bash
python3 scripts/toggl.py track --project "Atlas" --description "API design" \
  --date 2026-06-05 --start 10:00 --stop 12:00 --billable
python3 scripts/toggl.py track --project "Atlas" --description "API implementation" \
  --date 2026-06-05 --start 13:00 --stop 18:00 --billable
```

(Everything here was dictated except the billable flag — so the only thing worth asking, if history doesn't make it obvious, is whether the work bills.)

## End-of-day reconstruction (macOS desktop app)

If the user runs the Toggl Track macOS app with auto-tracking, `timeline` reads the locally recorded window activity — app names, window titles, durations — with zero API calls:

```bash
python3 scripts/toggl.py timeline --date 2026-06-05 --min-seconds 60
```

The output is a *runs* view: events are split into runs wherever recording stopped for a few minutes (the user was away — physical structure), and compressed per window title inside each run (meaning). The script only ever splits; **joining across runs is interpretation and is yours**: a meeting whose title appears in two adjacent runs (recording gaps happen mid-call) is one entry; a 28-minute gap before an unrelated run is a lunch break, not work.

Workflow for "help me track today" / "reconstruct my day":

1. Fetch the day's timeline and `meta` (cached). Recent `entries` are worth one call when they exist — they carry the user's description style and billable conventions — but check the result: an empty history means you must lean on `meta` names and judgment alone.
2. Cluster into **work streams**, not exclusive time slices: titles reveal projects, repos, documents, meetings, agent sessions. A stream's episode spans its first to last touchpoint, bridging dormancy up to ~30 minutes; treat `gap_after_minutes` as evidence of breaks. Window titles are evidence, not truth — when a stream is ambiguous, ask rather than guess.
3. Timing comes only from the timeline database. Other sources — git logs, file mtimes, tickets — may help *label* a stream, but never define or extend its boundaries (commits measure delivery, not work, and most work leaves no commits).
4. Streams may overlap in wall-clock time. Parallel agent sessions on different projects each bill their own span — a day may legitimately sum to more than its elapsed hours. Never shrink one entry to make room for another.
5. Round episode boundaries to quarter-hours, expanding outward: start floors (14:03 → 14:00), end ceils (14:53 → 15:00). Exception: two *sequential* entries sharing a boundary (one task flowed into the next) snap that single boundary to its nearest quarter-hour, used by both sides — real parallel overlap is fine, rounding-manufactured overlap is not.
6. Propose the tracking plan — per stream: project + description + start/stop — and get confirmation.
7. Only then write the entries via `track`, one command per entry.

This reads an *unofficial* local database of the desktop app (documented in the script). If it reports a schema mismatch, tell the user the app changed its storage format — the API-based commands are unaffected.

## Timers

`start --project X --description Y [--billable]`, `stop`, `current`. A running timer is excluded from `entries`/`summary` (noted on stderr) until stopped.

## Common pitfalls

- **Refetching what you already have.** A second `entries` call for a range already in context, or a readback after a write, spends quota for nothing.
- **Hand-rolling API calls.** Never curl the Toggl API directly; if the script can't do something, say so instead.
- **Joining runs silently.** Bridging a recording gap is your interpretation, not data — own it in the proposal, don't present it as what the timeline says.
- **Echoing window titles.** They can contain sensitive content (mail subjects, document names). Use them to infer what was worked on; don't repeat them wholesale to the user or into entry descriptions unless asked.
- **Adjusting figures outside Toggl.** An odd duration gets fixed in Toggl via `edit`, never massaged in the invoice.
