# worktrunk-hook

Route Claude Code's auto-created git worktrees through [worktrunk](https://github.com/max-sixty/worktrunk). Background sessions, `--worktree` foreground sessions, and `/bg` dispatches inherit your project's worktrunk hooks (env symlinks, dependency installs, port allocation, …).

## What it does

Ships a `WorktreeCreate` hook that calls `wt switch -c <name> -y` in place of Claude's default `git worktree add`. Worktrunk's `pre-start` and `post-start` hooks fire for every Claude-created worktree.

Fails loud (non-zero exit, stderr surfaced) if worktrunk isn't available, errors out, or returns no parseable path.

## Requirements

- [worktrunk](https://github.com/max-sixty/worktrunk) installed and on `PATH`
- Claude Code v2.1.143 or later
- `python3` on `PATH`

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install worktrunk-hook@pandysp
```

## Trust note

The hook uses `wt switch -c -y`. The `-y` flag skips worktrunk's command-approval prompt, so any `pre-start` or `post-start` commands in a project's `.config/wt.toml` execute on the first Claude dispatch into that repo. Only enable this plugin in environments where you trust the projects you work in.

To opt into approvals instead, drop `-y` from `bin/wt-create-hook.sh` and approve each new project's hooks manually via foreground `wt switch -c` before its first Claude dispatch.

## License

MIT
