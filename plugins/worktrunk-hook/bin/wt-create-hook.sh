#!/usr/bin/env bash
# Route Claude's worktree creation through worktrunk. Fail loud on any problem.
set -euo pipefail

INPUT=$(cat)
name=$(printf '%s' "$INPUT" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("name") or "claude-"+d["session_id"][:8])')
cd "$(printf '%s' "$INPUT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["cwd"])')"

# Ask worktrunk to create the worktree, then take whatever path it actually used —
# never predict it from convention. `if !` form is required so set -e doesn't
# swallow the failure before we can report it.
if ! output=$(wt switch -c "$name" -y 2>&1); then
  printf 'wt switch -c failed. Output:\n%s\n' "$output" >&2
  exit 1
fi
path=$(printf '%s' "$output" | sed -nE 's|.*worktree @ (.+)$|\1|p' | head -1)
path="${path/#\~/$HOME}"   # resolve ~ if wt printed it

if [[ -z "$path" || ! -d "$path" ]]; then
  printf 'wt switch -c produced no usable path. Output:\n%s\n' "$output" >&2
  exit 1
fi

echo "$path"
