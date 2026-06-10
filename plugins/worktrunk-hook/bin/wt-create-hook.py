#!/usr/bin/env python3
"""WorktreeCreate hook: route Claude's worktree creation through worktrunk."""
import json
import os
import subprocess
import sys

data = json.load(sys.stdin)
try:
    cwd = data["cwd"]
    session_id = data["session_id"]
except KeyError as error:
    sys.exit(f"hook input missing expected key: {error}")
name = data.get("name") or "claude-" + session_id[:8]

try:
    result = subprocess.run(
        ["wt", "switch", "-c", name, "-y", "--format", "json"],
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
except OSError as e:
    sys.exit(f"wt switch -c failed. Output:\n{e}")

if result.returncode != 0:
    sys.exit(f"wt switch -c failed.\nstdout: {result.stdout}\nstderr: {result.stderr}")

try:
    payload = json.loads(result.stdout)
except json.JSONDecodeError:
    sys.exit(
        "wt --format json returned unparseable output. "
        "Requires worktrunk 0.52+.\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )

path = payload.get("path")
if not path or not os.path.isdir(path):
    sys.exit(f"wt produced no usable path. Payload: {payload}")

print(path)
