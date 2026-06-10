# toggl-track

A Claude Code plugin for interacting with [Toggl Track](https://track.toggl.com) through the official API: track work from natural language, fetch and analyze time entries, prepare invoice line items, and manage running timers.

## How it works

A zero-dependency Python CLI (`scripts/toggl.py`, stdlib only) handles the deterministic parts — auth, pagination, ID→name joins, local→UTC conversion, deduplicated summaries. The agent handles judgment: parsing "10:00–12:00 was API design" into entries, resolving fuzzy project names, analysis, and mapping summaries to invoice line items.

```
toggl.py summary --month 2026-05      # deduplicated items per client, subtotals
toggl.py entries --start ... --end    # raw entries as JSON
toggl.py track / start / stop / edit  # writes — agent previews & confirms first
```

## Setup

1. Get your API token from https://track.toggl.com/profile (bottom of page).
2. `mkdir -p ~/.config/toggl && echo YOUR_TOKEN > ~/.config/toggl/api_token && chmod 600 ~/.config/toggl/api_token`

Optional: `TOGGL_BILLABLE_TAG` (default `billable`) — the tag that marks entries as billable, since Toggl's native billable field is a paid feature.

## Safety

- Writes (create/edit/delete) are always previewed by the agent before running.
- `delete` requires `--confirm` and verifies the entry is actually gone.
- Respects Toggl's 30 requests/hour API quota via a 7-day metadata cache.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install toggl-track@pandysp
```

## License

MIT
