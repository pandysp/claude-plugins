# changelog-digest

A Claude Code plugin that turns the changelog firehose into a short personalized brief.

## Why

Claude Code releases near daily and a single release can carry 50 bullets. Nobody reads all of that. Skipping it all means missing renamed commands, deprecated parameters that silently become no-ops, and defaults that flip under you.

The filter rules come from an audit of the full changelog history (4000+ bullets). Fixed alone is over half the volume and applies itself whether you read it or not. The bullets that actually need eyes are the curated top of each feature release, everything that flips a default, and the small verb families that carry action (Added, Changed, Deprecated, Removed, Renamed, Reverted).

## Usage

```
/changelog-digest
```

Or ask naturally: "what changed in Claude Code lately?"

The script keeps a last-seen version in `~/.claude/changelog-digest-state.json`, so each run digests only what is new. The first run records a baseline and stops. For a regular cadence, pair it with a weekly scheduled routine that invokes the skill.

The agent then checks every kept bullet against your actual config (settings.json, CLAUDE.md, memory) and reports highlights, the items that touch your setup, and knowledge a release just made stale.

## Script

`skills/changelog-digest/scripts/digest.py`, stdlib Python. Notable flags: `--releases N`, `--since X.Y.Z`, `--dry-run`, `--drop-scopes "Windows,[VSCode],..."`, `--changelog-file PATH`.
