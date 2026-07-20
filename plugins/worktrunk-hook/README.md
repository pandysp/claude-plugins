# worktrunk-hook

Route Claude Code's auto-created git worktrees through [worktrunk](https://github.com/max-sixty/worktrunk). Background sessions, `--worktree` foreground sessions, and `/bg` dispatches inherit your project's worktrunk hooks (env symlinks, dependency installs, port allocation, …).

## What it does

Ships a `WorktreeCreate` hook that calls `wt switch -c <name> -y` in place of Claude's default `git worktree add`. Worktrunk's `pre-start` and `post-start` hooks fire for every Claude-created worktree.

Fails loud (non-zero exit, stderr surfaced) if worktrunk isn't available, errors out, or returns no parseable path.

Also ships a `WorktreeRemove` hook that calls `wt remove --foreground` when Claude tears a worktree down (session delete or exit, subagent cleanup). A clean linked worktree is removed and its branch deleted if merged. Everything else is kept: dirty worktrees, main checkouts, paths that no longer exist, and the plain directories reported by the in-place fallback below. Every kept case exits 0. The hooks docs call the event non-blocking, but for hook-created worktrees a missing or failing remove hook blocks session deletion (verified 2026-07 on Claude Code 2.x), so this hook reports refusals to stderr instead of failing.

**Outside a git repository** (e.g. a background session launched from `~`) the hook degrades gracefully instead of failing: it reports the session's own cwd as the "worktree", so the session proceeds in place without isolation — mirroring what Claude Code itself does when no `WorktreeCreate` hook is configured. Without this, a global hook deadlocks every background session on non-git cwds: Claude Code has no hook decline protocol, treats any hook failure as "isolation still required", and blocks all file writes. (The [hooks docs](https://code.claude.com/docs/en/hooks.md) claim the returned path must differ from `cwd` and be a registered git worktree; verified 2026-07 on Claude Code 2.x that neither check is enforced. The `WorktreeRemove` hook recognizes these in-place directories and keeps them, so the session stays deletable. If a future version enforces the documented validation, the fallback reverts to the old deadlock — no data risk.)

## Requirements

- [worktrunk](https://github.com/max-sixty/worktrunk) **0.52 or later** on `PATH` (the create hook uses `wt switch -c --format json`; the remove hook uses `wt remove --foreground --format json -y`, tested on 0.58)
- git **2.31 or later** (the remove hook uses `rev-parse --path-format=absolute`)
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

Both hooks pass `-y`. The flag skips worktrunk's command-approval prompt, so any `pre-start`, `post-start`, `pre-remove`, or `post-remove` commands in a project's `.config/wt.toml` execute on Claude dispatches into that repo. Only enable this plugin in environments where you trust the projects you work in.

The remove hook needs `-y` for a second reason: without a TTY, wt cannot prompt for approval and declines the removal (verified on 0.58), so in any project with remove-time hooks the worktree would silently never be removed.

To opt into approvals instead, drop `-y` from both scripts and approve each project's hooks manually (`wt config approvals add`, or a foreground `wt switch -c`) before its first Claude dispatch. Unapproved projects then keep their worktrees on removal instead of cleaning them up.

## License

MIT
