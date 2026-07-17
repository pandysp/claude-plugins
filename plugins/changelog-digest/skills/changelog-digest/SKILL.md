---
name: changelog-digest
description: Digest new Claude Code releases into what matters for this user. Use when the user asks what changed in Claude Code, wants to catch up on releases, asks about new Claude Code features or env vars, says "changelog digest", or /changelog-digest. Also the right skill for a scheduled catch-up routine. Runs a bucketing script over the official changelog and then personalizes the result against this machine's config.
---

# /changelog-digest: catch up on Claude Code releases

Claude Code ships near daily and a release can carry 50 bullets. Most are fixes that apply themselves whether anyone reads them or not. This skill separates the bullets worth attention from the rest and checks the remainder against the user's actual setup.

## Run the script

From this skill's base directory:

```
python3 scripts/digest.py
```

The script fetches the official changelog, digests every release newer than the last seen version and records the newest as seen. On the very first run it only records a baseline and digests nothing. Useful flags:

- `--releases N` digest the last N releases regardless of state
- `--since 2.1.200` digest everything newer than a version
- `--dry-run` do not touch the state file
- `--drop-scopes "Windows,[VSCode],VSCode,WSL,Bedrock,Vertex,Foundry"` drop bullets scoped to platforms the user does not run
- `--changelog-file PATH` read a local file instead of fetching

Pick the drop scopes from what you know about this machine. On a Mac without enterprise providers the list above is the usual choice. Keep VSCode bullets when the user works in VS Code or a fork of it such as Cursor. When in doubt keep the scope in.

## What the tiers mean

The script buckets on rules measured against the full changelog history:

- **Highlight** is the top bullets of feature releases (the same ones the boot banner shows) plus every bullet that flips a default, whatever its lead verb. Default flips change behavior with no action from the user and are the easiest thing to miss.
- **Checklist** is bullets whose lead verb carries action for someone. Added, New, Changed, Deprecated, Removed, Renamed, Reverted, Enabled, Disabled and everything unprefixed. Most touch nothing in a given setup. The point is the scan.
- **Suppressed** is Fixed, Improved, Reduced, Hardened and Updated. Self applying. The count is printed so nothing disappears silently.

## Personalize

The script output is the raw material, not the deliverable. Cross-reference every checklist bullet against what this user actually runs:

- `~/.claude/settings.json` for env vars, hooks, plugins and permission config
- CLAUDE.md files and, when present, the memory index for workflows and known constraints
- surfaces the user demonstrably uses (background sessions, MCP servers, SDK, tmux, slash commands seen in the session)

Then report in this order:

1. **Highlights** verbatim, one line of context each where it helps.
2. **Touches your setup**. Only checklist bullets that plausibly contact this user's config or habits, each with one line on where it lands. A renamed command they alias, an env var they set, a default flip on a feature they use.
3. **Stale knowledge**. Config, docs or memory notes that a release just invalidated. Name the file.
4. One line on what was suppressed, with the count.

A tier with nothing in it gets one line saying so. Do not pad, do not re-list the whole checklist, and do not soften a breaking item into an aside.

## State

State lives in `~/.claude/changelog-digest-state.json` and only advances on a run without `--dry-run`. A scheduled weekly run plus this skill on demand covers both cadences.
