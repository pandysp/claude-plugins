# worktrunk-hook

Route Claude Code's auto-created git worktrees through [worktrunk](https://github.com/max-sixty/worktrunk). Background sessions, `--worktree` foreground sessions, and `/bg` dispatches inherit your project's worktrunk hooks (env symlinks, dependency installs, port allocation, …).

## What it does

Ships a `WorktreeCreate` hook that calls `wt switch -c <name> -y` in place of Claude's default `git worktree add`. Worktrunk's `pre-start` and `post-start` hooks fire for every Claude-created worktree.

Fails loud (non-zero exit, stderr surfaced) if worktrunk isn't available, errors out, or returns no parseable path.

**Outside a git repository** (e.g. a background session launched from `~`) the hook degrades gracefully instead of failing: it reports the session's own cwd as the "worktree", so the session proceeds in place without isolation — mirroring what Claude Code itself does when no `WorktreeCreate` hook is configured. Without this, a global hook deadlocks every background session on non-git cwds: Claude Code has no hook decline protocol, treats any hook failure as "isolation still required", and blocks all file writes. (The [hooks docs](https://code.claude.com/docs/en/hooks.md) claim the returned path must differ from `cwd` and be a registered git worktree; verified 2026-07 on Claude Code 2.x that neither check is enforced, and that worktree *removal* on a plain directory refuses/fails without deleting anything. If a future version enforces the documented validation, the fallback reverts to the old deadlock — no data risk.)

## Requirements

- [worktrunk](https://github.com/max-sixty/worktrunk) **0.52 or later** on `PATH` (the hook uses `wt switch -c --format json`)
- Claude Code v2.1.143 or later
- `python3` on `PATH`

## Project setup

Worktrunk 0.52 resolves a repo's `.config/wt.toml` via `git show <base-ref>:.config/wt.toml` (committed files only). **If your `.config/wt.toml` is gitignored, hooks silently won't fire** for new worktrees. Either commit it (recommended for shared project hooks) or move per-user hooks to `~/.config/worktrunk/config.toml` under a `[projects."github.com/owner/repo"]` block. See [worktrunk issue #2818](https://github.com/max-sixty/worktrunk/issues/2818).

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install worktrunk-hook@pandysp
```

## Trust note

The hook uses `wt switch -c -y`. The `-y` flag skips worktrunk's command-approval prompt, so any `pre-start` or `post-start` commands in a project's `.config/wt.toml` execute on the first Claude dispatch into that repo. Only enable this plugin in environments where you trust the projects you work in.

To opt into approvals instead, drop `-y` from `bin/wt-create-hook.py` and approve each new project's hooks manually via foreground `wt switch -c` before its first Claude dispatch.

## License

MIT

## License

MIT
