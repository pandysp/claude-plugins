#!/usr/bin/env python3
"""WorktreeCreate hook: route Claude's worktree creation through worktrunk."""
import json
import os
import re
import subprocess
import sys

data = json.load(sys.stdin)
name = data.get("name") or "claude-" + data["session_id"][:8]

try:
    result = subprocess.run(
        ["wt", "switch", "-c", name, "-y"],
        cwd=data["cwd"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
except OSError as e:
    sys.exit(f"wt switch -c failed. Output:\n{e}")

if result.returncode != 0:
    sys.exit(f"wt switch -c failed. Output:\n{result.stdout}")

match = re.search(r"worktree @ (.+)", result.stdout)
if not match:
    sys.exit(f"wt switch -c produced no usable path. Output:\n{result.stdout}")

path = os.path.expanduser(match.group(1).strip())
if not os.path.isdir(path):
    sys.exit(f"wt switch -c reported a path that doesn't exist. Output:\n{result.stdout}")

print(path)
