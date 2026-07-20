#!/usr/bin/env python3
"""WorktreeRemove hook: route Claude's worktree removal through worktrunk."""
import json
import os
import subprocess
import sys

data = json.load(sys.stdin)
try:
    path = data["worktree_path"]
except KeyError as error:
    sys.exit(f"hook input missing expected key: {error}")


def done(reason):
    # Removal is cleanup, not isolation. A non-zero exit here blocks session
    # deletion (verified 2026-07 on Claude Code 2.x; the hooks docs call the
    # event non-blocking, but for hook-created worktrees a failing remove hook
    # leaves the session undeletable) and offers no way to recover. Keeping a
    # directory is always safe, so every refusal reports to stderr and exits 0.
    print(f"worktrunk-hook: {reason}", file=sys.stderr)
    sys.exit(0)


def rev_parse(*flags):
    return subprocess.run(
        ["git", "-C", path, "rev-parse", *flags],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )


if not os.path.isdir(path):
    done(f"{path} does not exist; nothing to remove")

probe = rev_parse("--is-inside-work-tree")
if probe.returncode != 0 or probe.stdout.strip() != "true":
    # The create hook degrades to in-place on non-git cwds and reports the
    # session's own directory as the "worktree". Never touch it.
    done(f"{path} is not inside a git repository; keeping it (in-place session)")

git_dir = rev_parse("--path-format=absolute", "--git-dir").stdout.strip()
common_dir = rev_parse("--path-format=absolute", "--git-common-dir").stdout.strip()
if not git_dir or not common_dir:
    done(f"could not resolve git dirs for {path}; keeping it")
if os.path.realpath(git_dir) == os.path.realpath(common_dir):
    # A main checkout, not a linked worktree. wt refuses this too; check
    # ourselves rather than rely on it.
    done(f"{path} is a main checkout, not a linked worktree; keeping it")

# wt resolves the repo from its cwd; a path argument alone fails outside a
# repo, so run inside the worktree. --foreground because default removal is
# backgrounded and must finish before the hook exits. -y because wt cannot
# prompt for hook approval without a TTY and declines the removal instead
# (see the Trust note in the README); dirty-tree protection is a separate
# flag (-f) and stays on.
try:
    result = subprocess.run(
        ["wt", "remove", "--foreground", "--format", "json", "-y"],
        cwd=path,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
except OSError as error:
    done(f"could not run wt ({error}); keeping {path}")

if result.returncode != 0:
    # Typically uncommitted changes: wt refuses without --force. Keep the
    # worktree so no work is lost, matching Claude Code's own keep-if-changed
    # behavior for native worktrees.
    done(f"wt declined to remove {path}; keeping it\n{result.stderr or result.stdout}")

print(f"worktrunk-hook: removed {path}", file=sys.stderr)
