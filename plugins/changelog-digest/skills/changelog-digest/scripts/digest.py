#!/usr/bin/env python3
"""Bucket new Claude Code changelog releases into highlight, checklist, and suppressed.

Tiers, derived from a full-corpus audit of the changelog (4000+ bullets):
- highlight: the top bullets of feature-led releases (the same ones the
  "What's new" boot banner shows) plus any bullet flipping a default,
  regardless of its verb. Default flips change behavior without any action.
- checklist: bullets whose lead verb historically carries action for someone
  (Added, New, Changed, Deprecated, Removed, Renamed, Reverted, Enabled,
  Disabled) plus all unprefixed bullets. Scan for contact with your setup.
- suppressed: self-applying bullets (Fixed, Improved, Reduced, Hardened,
  Updated). They ship with the update whether you read them or not.
"""

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CHANGELOG_URL = "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md"
STATE_PATH = Path.home() / ".claude" / "changelog-digest-state.json"

DROP_PREFIXES = (
    "Fixed", "Fix", "Fixes", "Bug", "Improved", "Improve", "Improvements",
    "Reduced", "Hardened", "Updated", "Update",
)
DEFAULT_FLIP_RE = re.compile(r"\bby default\b|\bnow defaults?\b", re.IGNORECASE)
HIGHLIGHT_TOP_N = 3
HIGHLIGHT_MIN_BULLETS = 5  # single-bullet hotfix releases have no curated top


def parse_version(v):
    try:
        return tuple(int(x) for x in v.split("."))
    except ValueError:
        return None


def fetch_changelog(args):
    if args.changelog_file:
        return Path(args.changelog_file).read_text(encoding="utf-8")
    req = urllib.request.Request(args.changelog_url, headers={"User-Agent": "changelog-digest"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def parse_sections(text):
    """Return [(version, [bullets])] in file order (newest first)."""
    sections = []
    version, bullets = None, []
    for line in text.splitlines():
        if line.startswith("## "):
            if version is not None:
                sections.append((version, bullets))
            version, bullets = line[3:].strip(), []
        elif line.startswith("- ") and version is not None:
            bullets.append(line[2:].strip())
    if version is not None:
        sections.append((version, bullets))
    return sections


def lead_word(bullet):
    m = re.match(r"([A-Za-z\[\]]+)", bullet)
    return m.group(1) if m else ""


def scoped_out(bullet, drop_scopes):
    return any(bullet.startswith(s) for s in drop_scopes)


def bucket_release(bullets, drop_scopes):
    kept = [b for b in bullets if not scoped_out(b, drop_scopes)]
    scope_dropped = len(bullets) - len(kept)
    highlight, checklist, suppressed = [], [], []
    for i, b in enumerate(kept):
        is_drop = lead_word(b) in DROP_PREFIXES
        is_flip = bool(DEFAULT_FLIP_RE.search(b))
        is_top = i < HIGHLIGHT_TOP_N and len(kept) >= HIGHLIGHT_MIN_BULLETS
        if is_flip or (is_top and not is_drop):
            highlight.append(b)
        elif is_drop:
            suppressed.append(b)
        else:
            checklist.append(b)
    return highlight, checklist, suppressed, scope_dropped


def load_state(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(path, newest):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "last_seen": newest,
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }, indent=2) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--since", help="digest releases newer than this version (overrides state)")
    ap.add_argument("--releases", type=int, help="digest the last N releases (overrides state)")
    ap.add_argument("--drop-scopes", default="", help="comma-separated bullet prefixes to drop, e.g. 'Windows,[VSCode],Bedrock'")
    ap.add_argument("--dry-run", action="store_true", help="do not update the state file")
    ap.add_argument("--state", default=str(STATE_PATH), help=f"state file (default {STATE_PATH})")
    ap.add_argument("--changelog-url", default=CHANGELOG_URL)
    ap.add_argument("--changelog-file", help="read a local changelog instead of fetching")
    args = ap.parse_args()

    drop_scopes = tuple(s.strip() for s in args.drop_scopes.split(",") if s.strip())
    sections = parse_sections(fetch_changelog(args))
    if not sections:
        sys.exit("no releases found in changelog")
    newest = sections[0][0]

    state = load_state(args.state)
    if args.releases is not None:
        todo = sections[: args.releases]
    elif args.since:
        floor = parse_version(args.since)
        if floor is None:
            sys.exit(f"cannot parse --since version: {args.since}")
        todo = [s for s in sections if (parse_version(s[0]) or floor) > floor]
    elif state.get("last_seen"):
        floor = parse_version(state["last_seen"])
        todo = [s for s in sections if (parse_version(s[0]) or floor) > floor]
    else:
        if not args.dry_run:
            save_state(args.state, newest)
        print(f"No baseline yet. Recorded {newest} as last seen. "
              f"Next run digests everything newer. Use --releases N or --since X.Y.Z to digest now.")
        return

    if not todo:
        print(f"Nothing new since {state.get('last_seen', args.since)}. Newest release is {newest}.")
        return

    totals = {"highlight": 0, "checklist": 0, "suppressed": 0, "scoped": 0}
    out = []
    for version, bullets in todo:
        hi, cl, sup, scoped = bucket_release(bullets, drop_scopes)
        totals["highlight"] += len(hi)
        totals["checklist"] += len(cl)
        totals["suppressed"] += len(sup)
        totals["scoped"] += scoped
        out.append(f"## {version}")
        if hi:
            out.append("### Highlight")
            out.extend(f"- {b}" for b in hi)
        if cl:
            out.append("### Checklist")
            out.extend(f"- {b}" for b in cl)
        if not hi and not cl:
            out.append("_nothing kept_")
        out.append(f"_suppressed {len(sup)} self-applying, {scoped} out of scope_")
        out.append("")

    span = f"{todo[-1][0]} to {todo[0][0]}" if len(todo) > 1 else todo[0][0]
    print(f"# Claude Code changelog digest ({span}, {len(todo)} releases)")
    print(f"{totals['highlight']} highlight, {totals['checklist']} checklist, "
          f"{totals['suppressed']} suppressed, {totals['scoped']} out of scope\n")
    print("\n".join(out))

    if not args.dry_run:
        save_state(args.state, newest)
        print(f"State updated to {newest} in {args.state}", file=sys.stderr)


if __name__ == "__main__":
    main()
