# understudy

A Claude Code plugin for writing into a codebase you don't own so the contribution reads as if the maintainer wrote it.

## Why

Your default is a generic, competent style that quietly announces "written by an outsider". That's the same tell that reads as AI. To a maintainer with a strong personal style that's a cost even when the patch is correct: something to mentally translate, reformat, or turn down. This plugin is the discipline of effacing your own hand and writing as the host. The bar: a reviewer can't find the seam between your code and theirs.

Style only. The skill matches how the code reads. It doesn't silence your judgment on substance.

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
