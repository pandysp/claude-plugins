# understudy

A Claude Code plugin for writing into a codebase you don't own so the contribution reads as if the maintainer wrote it. A foreign-looking patch is a cost to a maintainer even when it's correct — something to mentally translate, reformat, or turn down.

## Why

Your default is a generic, competent style that quietly announces "written by an outsider", the same tell that reads as AI. To a maintainer with a strong personal style, that's a cost, not a gift. This plugin is the discipline of effacing your own hand and writing as the host, so a contribution arrives already in their voice and costs nothing to accept. The bar: a reviewer can't find the seam between your code and theirs.

## What it does

Two moves, plus a boundary:

1. **Sample how they actually write** — code, comments, tests, and commit messages, more than the one thing you're touching.
2. **Iterate past your first pass** — the first reading is your priors with a thin coat of theirs; keep sampling until a pass comes up dry.

The boundary: match their **style**, not their **substance**. If something looks wrong on the merits, raise it as you would anywhere — the skill matches how the code reads, it doesn't silence your judgment.

## Usage

```
/understudy
```

Or naturally: "match the style", "make it look like theirs", "will this look out of place in their repo", or before opening a PR against someone else's project.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install understudy@pandysp
```

## License

MIT
