#!/usr/bin/env python3
"""Toggl Track CLI for agentic use. Stdlib only — no dependencies.

Auth: reads API token from $TOGGL_API_TOKEN or ~/.config/toggl/api_token.
Get your token at https://track.toggl.com/profile (bottom of page).

Subcommands (run `toggl.py <cmd> --help` for details):
  me        Account + default workspace info
  meta      Clients, projects, tags (cached; --refresh to refetch)
  entries   Raw time entries for a date range, as JSON
  summary   Deduplicated items per client/project with subtotals
  track     Create a completed time entry
  start     Start a running timer
  stop      Stop the running timer
  current   Show the running timer
  edit         Update an existing entry
  delete       Delete an entry (requires --confirm)
  new-project  Create a project (and, via --client, its client) in one call
  timeline     Auto-tracked window activity from the local desktop app (macOS)

Exit codes: 0 ok · 1 API/HTTP error · 2 usage error · 3 confirmation required
"""
import argparse
import base64
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

API = "https://api.track.toggl.com/api/v9"
REPORTS = "https://api.track.toggl.com/reports/api/v3"
CONFIG_DIR = Path(os.environ.get("TOGGL_CONFIG_DIR", "~/.config/toggl")).expanduser()
BILLABLE_TAG = os.environ.get("TOGGL_BILLABLE_TAG", "billable")
META_TTL_SECONDS = 7 * 24 * 3600
PAGE_SIZE = 50  # reports API rows per page


def fail(message, code=1):
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(code)


def token():
    tok = os.environ.get("TOGGL_API_TOKEN")
    if not tok:
        token_file = CONFIG_DIR / "api_token"
        if token_file.exists():
            tok = token_file.read_text().strip()
    if not tok:
        fail(
            "no API token. Set $TOGGL_API_TOKEN or write the token to "
            f"{CONFIG_DIR / 'api_token'} (from https://track.toggl.com/profile)."
        )
    return tok


def api(path, method="GET", body=None, base=API):
    request = urllib.request.Request(
        base + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": "Basic "
            + base64.b64encode(f"{token()}:api_token".encode()).decode(),
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            quota = response.headers.get("x-toggl-quota-remaining")
            if quota is not None and int(quota) < 5:
                print(f"Warning: only {quota} API requests left this hour "
                      "(limit is 30/h).", file=sys.stderr)
            raw = response.read()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:300]
        if error.code == 402:
            fail(f"{method} {path}: 402 — this needs a paid Toggl feature. {detail}")
        if error.code == 429:
            fail(f"{method} {path}: 429 rate-limited (30 requests/hour). "
                 "Wait before retrying; use cached meta where possible.")
        if error.code == 404 and method == "GET":
            raise  # callers use 404 to mean "gone" (e.g. delete verification)
        fail(f"{method} {path}: HTTP {error.code}. {detail}")
    except urllib.error.URLError as error:
        fail(f"{method} {path}: network error — {error.reason}")


# ---------------------------------------------------------------- metadata


def fetch_meta():
    me = api("/me")
    workspace_id = me["default_workspace_id"]
    clients = {str(c["id"]): c["name"] for c in api("/me/clients") or []}
    projects = {
        str(p["id"]): {
            "name": p["name"],
            "client": clients.get(str(p.get("client_id"))),
            "active": p.get("active", True),
        }
        for p in api("/me/projects") or []
    }
    tags = {str(t["id"]): t["name"] for t in api("/me/tags") or []}
    return {
        "fetched_at": time.time(),
        "workspace_id": workspace_id,
        "fullname": me.get("fullname"),
        "clients": clients,
        "projects": projects,
        "tags": tags,
    }


def meta(refresh=False):
    cache_file = CONFIG_DIR / "meta-cache.json"
    if not refresh and cache_file.exists():
        cached = json.loads(cache_file.read_text())
        if time.time() - cached.get("fetched_at", 0) < META_TTL_SECONDS:
            return cached
    fresh = fetch_meta()
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(fresh, indent=2))
    return fresh


def resolve_project(meta_data, query):
    """Resolve a project by ID, exact name, or unique substring (case-insensitive).

    Only active projects match by name; archived ones stay reachable by ID."""
    if query.isdigit() and query in meta_data["projects"]:
        return int(query)
    lowered = query.lower()
    active = {pid: p for pid, p in meta_data["projects"].items() if p["active"]}
    exact = [pid for pid, p in active.items() if p["name"].lower() == lowered]
    if len(exact) == 1:
        return int(exact[0])
    partial = [pid for pid, p in active.items()
               if lowered in p["name"].lower()
               or lowered in (p["client"] or "").lower()]
    if len(partial) == 1:
        return int(partial[0])
    candidates = ", ".join(
        f'{pid}: {active[pid]["name"]} ({active[pid]["client"] or "no client"})'
        for pid in (partial or active)
    )
    archived = [p["name"] for p in meta_data["projects"].values()
                if not p["active"] and lowered in p["name"].lower()]
    note = (f' Archived matches ignored (use the ID): {", ".join(archived)}'
            if archived else "")
    fail(f'project "{query}" is '
         f'{"ambiguous" if partial else "unknown"}. Candidates: {candidates}.{note}')


# ---------------------------------------------------------------- time helpers


def to_utc(date_string, time_string):
    """Local 'YYYY-MM-DD' + 'HH:MM' -> RFC3339 UTC string (API requires UTC)."""
    try:
        local = datetime.fromisoformat(f"{date_string}T{time_string}")
    except ValueError:
        fail(f"bad date/time: {date_string} {time_string} "
             "(expected YYYY-MM-DD and HH:MM)", 2)
    return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def hours_minutes(seconds):
    return f"{seconds // 3600}:{seconds % 3600 // 60:02d}"


def month_range(month_string):
    try:
        first = datetime.strptime(month_string, "%Y-%m")
    except ValueError:
        fail(f"bad month: {month_string} (expected YYYY-MM)", 2)
    next_first = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    return first.strftime("%Y-%m-%d"), (next_first - timedelta(days=1)).strftime("%Y-%m-%d")


# ---------------------------------------------------------------- read commands


def fetch_entries(start, end):
    meta_data = meta()
    workspace_id = meta_data["workspace_id"]
    rows, first_row = [], 1
    while True:
        page = api(
            f"/workspace/{workspace_id}/search/time_entries",
            "POST",
            {"start_date": start, "end_date": end, "order_by": "date",
             "order_dir": "asc", "grouped": False, "page_size": PAGE_SIZE,
             "first_row_number": first_row},
            base=REPORTS,
        )
        if not page:
            break
        for item in page:
            project = meta_data["projects"].get(str(item.get("project_id"))) or {}
            tag_names = [meta_data["tags"].get(str(t), str(t))
                         for t in item.get("tag_ids", [])]
            for entry in item["time_entries"]:
                if entry["seconds"] < 0:
                    print(f"Note: skipping running entry "
                          f'"{item["description"]}" (still on the clock).',
                          file=sys.stderr)
                    continue
                rows.append({
                    "id": entry["id"],
                    "description": item["description"],
                    "project": project.get("name"),
                    "client": project.get("client"),
                    "billable": BILLABLE_TAG in tag_names,
                    "tags": tag_names,
                    "seconds": entry["seconds"],
                    "start": entry["start"],
                    "stop": entry["stop"],
                })
        if len(page) < PAGE_SIZE:  # short page = last page; skip the empty-page request
            break
        first_row += PAGE_SIZE
    return rows


def cmd_entries(args):
    print(json.dumps(fetch_entries(args.start, args.end), indent=2))


def cmd_summary(args):
    start, end = month_range(args.month) if args.month else (args.start, args.end)
    if not (start and end):
        fail("provide --month YYYY-MM or both --start and --end", 2)
    rows = fetch_entries(start, end)
    sums = defaultdict(int)
    for row in rows:
        key = (row["client"] or "(no client)", row["project"] or "(no project)",
               row["description"], row["billable"])
        sums[key] += row["seconds"]

    grouped = defaultdict(lambda: defaultdict(list))
    for (client, project, description, billable), seconds in sums.items():
        grouped[client][project].append(
            {"item": description, "billable": billable, "seconds": seconds,
             "hours": round(seconds / 3600, 2), "duration": hours_minutes(seconds)})
    result = {
        "start": start, "end": end,
        "total_seconds": sum(sums.values()),
        "clients": [
            {
                "client": client,
                "total_seconds": (client_total := sum(
                    i["seconds"] for items in projects.values() for i in items)),
                "total_hours": round(client_total / 3600, 2),
                "billable_seconds": (billable_total := sum(
                    i["seconds"] for items in projects.values()
                    for i in items if i["billable"])),
                "billable_hours": round(billable_total / 3600, 2),
                "projects": [
                    {
                        "project": project,
                        "total_seconds": sum(i["seconds"] for i in items),
                        "items": sorted(items, key=lambda i: -i["seconds"]),
                    }
                    for project, items in projects.items()
                ],
            }
            for client, projects in sorted(grouped.items())
        ],
    }
    if args.json:
        print(json.dumps(result, indent=2))
        return
    print(f"{start} .. {end}   total {hours_minutes(result['total_seconds'])}")
    for client in result["clients"]:
        print(f"\n{client['client']}  "
              f"[{hours_minutes(client['total_seconds'])} = {client['total_hours']}h]")
        for project in client["projects"]:
            print(f"  {project['project']}  "
                  f"[{hours_minutes(project['total_seconds'])}]")
            for item in project["items"]:
                flag = "billable" if item["billable"] else "internal"
                print(f"    {item['duration']:>7}  {item['hours']:>6.2f}h  "
                      f"{flag:8}  {item['item']}")


def cmd_me(args):
    meta_data = meta(refresh=args.refresh)
    print(json.dumps({"fullname": meta_data["fullname"],
                      "workspace_id": meta_data["workspace_id"]}, indent=2))


def cmd_meta(args):
    meta_data = meta(refresh=args.refresh)
    print(json.dumps(meta_data, indent=2))


def cmd_current(args):
    entry = api("/me/time_entries/current")
    if entry is None:
        print(json.dumps({"running": False}))
        return
    started = datetime.fromisoformat(entry["start"].replace("Z", "+00:00"))
    elapsed = int((datetime.now(timezone.utc) - started).total_seconds())
    print(json.dumps({"running": True, "id": entry["id"],
                      "description": entry["description"],
                      "project_id": entry.get("project_id"),
                      "start": entry["start"], "elapsed": hours_minutes(elapsed),
                      "tags": entry.get("tags", [])}, indent=2))


# ---------------------------------------------------------------- write commands


def get_entry(entry_id):
    try:
        return api(f"/me/time_entries/{entry_id}")
    except urllib.error.HTTPError:  # api() only re-raises GET 404s
        fail(f"entry {entry_id} not found")


def entry_payload(args, meta_data, running=False):
    payload = {
        "workspace_id": meta_data["workspace_id"],
        "created_with": "toggl-track claude plugin",
        "description": args.description,
        "project_id": resolve_project(meta_data, args.project),
    }
    tags = [t.strip() for t in (args.tags or "").split(",") if t.strip()]
    if args.billable and BILLABLE_TAG not in tags:
        tags.append(BILLABLE_TAG)
    if tags:
        payload["tags"] = tags
    if running:
        payload["start"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        payload["duration"] = -1
    else:
        date = args.date or datetime.now().strftime("%Y-%m-%d")
        payload["start"] = to_utc(date, args.start)
        payload["stop"] = to_utc(date, args.stop)
        if payload["stop"] <= payload["start"]:
            fail(f"stop {args.stop} is not after start {args.start} on {date} — "
                 "overnight work needs two entries, split at midnight", 2)
    return payload


def cmd_track(args):
    meta_data = meta()
    payload = entry_payload(args, meta_data)
    created = api(f"/workspaces/{meta_data['workspace_id']}/time_entries",
                  "POST", payload)
    print(json.dumps({"created": created["id"],
                      "description": created["description"],
                      "start": created["start"], "stop": created["stop"],
                      "tags": created.get("tags", [])}, indent=2))


def cmd_start(args):
    meta_data = meta()
    payload = entry_payload(args, meta_data, running=True)
    created = api(f"/workspaces/{meta_data['workspace_id']}/time_entries",
                  "POST", payload)
    print(json.dumps({"started": created["id"],
                      "description": created["description"],
                      "start": created["start"]}, indent=2))


def cmd_stop(args):
    entry = api("/me/time_entries/current")
    if entry is None:
        fail("no running timer to stop")
    stopped = api(f"/workspaces/{entry['workspace_id']}"
                  f"/time_entries/{entry['id']}/stop", "PATCH")
    print(json.dumps({"stopped": stopped["id"],
                      "description": stopped["description"],
                      "duration": hours_minutes(stopped["duration"])}, indent=2))


def cmd_edit(args):
    meta_data = meta()
    current = get_entry(args.id)
    payload = {"workspace_id": current["workspace_id"],
               "created_with": "toggl-track claude plugin"}
    if args.description is not None:
        payload["description"] = args.description
    if args.project is not None:
        payload["project_id"] = resolve_project(meta_data, args.project)
    # Default to the entry's LOCAL date — its UTC date can be the prior day.
    date = args.date or datetime.fromisoformat(
        current["start"].replace("Z", "+00:00")).astimezone().strftime("%Y-%m-%d")
    if args.start is not None:
        payload["start"] = to_utc(date, args.start)
    if args.stop is not None:
        payload["stop"] = to_utc(date, args.stop)
    if args.billable is not None:
        payload["tag_action"] = "add" if args.billable else "delete"
        payload["tags"] = [BILLABLE_TAG]
    if len(payload) == 2:
        fail("nothing to change — pass at least one of --description/--project/"
             "--start/--stop/--billable/--no-billable", 2)
    updated = api(f"/workspaces/{current['workspace_id']}"
                  f"/time_entries/{args.id}", "PUT", payload)
    print(json.dumps({"updated": updated["id"],
                      "description": updated["description"],
                      "start": updated["start"], "stop": updated.get("stop"),
                      "tags": updated.get("tags", [])}, indent=2))


def cmd_new_project(args):
    meta_data = meta()
    lowered = args.name.lower()
    clash = [p for p in meta_data["projects"].values()
             if p["name"].lower() == lowered]
    if clash and not args.force:
        fail(f'a project named "{args.name}" already exists '
             f'(client: {clash[0]["client"]}). Pass --force to create anyway.')
    payload = {"name": args.name, "active": True}
    if args.client:
        payload["client_name"] = args.client  # creates the client if missing
    created = api(f"/workspaces/{meta_data['workspace_id']}/projects",
                  "POST", payload)
    # Patch the local cache so the new project resolves immediately —
    # no quota spent on a full meta --refresh.
    meta_data["projects"][str(created["id"])] = {
        "name": created["name"], "client": args.client,
        "active": created.get("active", True)}
    if args.client and created.get("client_id"):
        meta_data["clients"][str(created["client_id"])] = args.client
    (CONFIG_DIR / "meta-cache.json").write_text(json.dumps(meta_data, indent=2))
    print(json.dumps({"created_project": created["id"],
                      "name": created["name"],
                      "client_id": created.get("client_id"),
                      "client": args.client}, indent=2))


def cmd_delete(args):
    entry = get_entry(args.id)
    summary_line = (f'#{entry["id"]} "{entry["description"]}" '
                    f'{entry["start"]} .. {entry.get("stop", "(running)")}')
    if not args.confirm:
        print(f"Would delete: {summary_line}\nRe-run with --confirm to delete.",
              file=sys.stderr)
        sys.exit(3)
    api(f"/workspaces/{entry['workspace_id']}/time_entries/{args.id}", "DELETE")
    try:  # verify it is actually gone — a billing system deserves proof
        api(f"/me/time_entries/{args.id}")
        fail(f"delete reported success but entry {args.id} still exists")
    except urllib.error.HTTPError as error:
        if error.code != 404:
            fail(f"could not verify deletion of {args.id}: HTTP {error.code}")
    print(json.dumps({"deleted": args.id, "was": summary_line}))


# ---------------------------------------------------------------- timeline (local)

# The macOS desktop app (Mac App Store build) keeps its auto-tracker window
# log in a CoreData SQLite inside Toggl's group container. B227VTMZ94 is
# Toggl's Apple developer team ID, so this path is the same on every Mac.
# UNOFFICIAL: the schema may change with app updates — fail loudly, never guess.
TIMELINE_DB = Path(
    "~/Library/Group Containers/B227VTMZ94.group.com.toggl.daneel.extensions"
    "/production/DatabaseModel.sqlite"
).expanduser()
COREDATA_EPOCH_OFFSET = 978307200  # CoreData timestamps count from 2001-01-01 UTC


def cmd_timeline(args):
    if not TIMELINE_DB.exists():
        fail(f"no local Toggl timeline database at {TIMELINE_DB} — "
             "is the Toggl Track macOS app installed with auto-tracking on?")
    args.date = args.date or datetime.now().strftime("%Y-%m-%d")
    day_start = datetime.fromisoformat(f"{args.date}T00:00").astimezone(timezone.utc)
    start = day_start.timestamp() - COREDATA_EPOCH_OFFSET
    end = start + 24 * 3600
    # Copy db + sidecars and read the copy: never touch the app's live WAL.
    with tempfile.TemporaryDirectory() as scratch:
        for sidecar in ("", "-wal", "-shm"):
            source = Path(str(TIMELINE_DB) + sidecar)
            if source.exists():
                shutil.copy2(source, Path(scratch) / source.name)
        connection = sqlite3.connect(Path(scratch) / TIMELINE_DB.name)
        try:
            rows = connection.execute(
                "SELECT ZFILENAME, ZTITLE, ZSTART, ZEND, ZISIDLE "
                "FROM ZMANAGEDACTIVITY WHERE ZSTART >= ? AND ZSTART < ? "
                "ORDER BY ZSTART", (start, end)).fetchall()
        except sqlite3.OperationalError as error:
            fail(f"timeline schema mismatch ({error}) — the desktop app "
                 "likely changed its database layout; this command needs updating")
        finally:
            connection.close()
    def local_clock(coredata_ts):
        return datetime.fromtimestamp(
            coredata_ts + COREDATA_EPOCH_OFFSET, timezone.utc).astimezone()

    if args.raw:
        # Note: the ZISIDLE flag is dead in practice (always 0). Gaps in the
        # recording ARE the no-input signal — that's what the runs view uses.
        events = []
        for app, title, event_start, event_end, _idle in rows:
            if args.min_seconds and event_end - event_start < args.min_seconds:
                continue
            events.append({"app": app, "title": title,
                           "start": local_clock(event_start).strftime("%H:%M:%S"),
                           "seconds": int(event_end - event_start)})
        print(json.dumps({"date": args.date, "events": events,
                          "dropped_below_min_seconds": len(rows) - len(events)},
                         indent=2))
        return

    # Runs view (default): split where recording stops for >= --gap seconds
    # (physical structure of the day), then aggregate per window title inside
    # each run (compression). Splitting is lossless; joining across runs is
    # interpretation and stays with the agent — this code never merges runs.
    # ALL events take part in run-building (a 5s event is still presence);
    # min-seconds only filters the per-title display aggregates.
    runs, current = [], None
    for app, title, event_start, event_end, _idle in rows:
        if current is None or event_start - current["end"] >= args.gap:
            current = {"start": event_start, "end": event_end, "events": []}
            runs.append(current)
        current["end"] = max(current["end"], event_end)
        current["events"].append((app, title, event_start, event_end))

    out_runs = []
    for i, run in enumerate(runs):
        per_title = {}
        for app, title, event_start, event_end in run["events"]:
            slot = per_title.setdefault((app, title), {"seconds": 0,
                                                       "first": event_start,
                                                       "last": event_end})
            slot["seconds"] += event_end - event_start
            slot["last"] = max(slot["last"], event_end)
        activity = [
            {"app": app, "title": title, "minutes": round(s["seconds"] / 60, 1),
             "span": f'{local_clock(s["first"]):%H:%M}–{local_clock(s["last"]):%H:%M}'}
            for (app, title), s in per_title.items()
            if s["seconds"] >= args.min_seconds]
        activity.sort(key=lambda a: -a["minutes"])
        shown = sum(a["minutes"] for a in activity)
        recorded = sum(e - s for _, _, s, e in run["events"]) / 60
        gap_after = (runs[i + 1]["start"] - run["end"]) / 60 if i + 1 < len(runs) else None
        out_runs.append({
            "run": f'{local_clock(run["start"]):%H:%M}–{local_clock(run["end"]):%H:%M}',
            "span_minutes": round((run["end"] - run["start"]) / 60),
            "recorded_minutes": round(recorded),
            "below_min_seconds_minutes": round(recorded - shown, 1),
            "gap_after_minutes": round(gap_after) if gap_after is not None else None,
            "activity": activity,
        })
    print(json.dumps({"date": args.date, "gap_threshold_seconds": args.gap,
                      "runs": out_runs}, indent=2))


# ---------------------------------------------------------------- argparse


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    refresh_help = "refetch clients/projects/tags instead of using the 7-day cache"
    sub = commands.add_parser("me", help="account + workspace info")
    sub.add_argument("--refresh", action="store_true", help=refresh_help)
    sub.set_defaults(func=cmd_me)

    sub = commands.add_parser("meta", help="clients, projects, tags (cached)")
    sub.add_argument("--refresh", action="store_true", help=refresh_help)
    sub.set_defaults(func=cmd_meta)

    sub = commands.add_parser(
        "entries", help="raw entries for a date range as JSON",
        epilog="Example: toggl.py entries --start 2026-03-01 --end 2026-04-30")
    sub.add_argument("--start", required=True, metavar="YYYY-MM-DD")
    sub.add_argument("--end", required=True, metavar="YYYY-MM-DD")
    sub.set_defaults(func=cmd_entries)

    sub = commands.add_parser(
        "summary", help="deduplicated items per client/project, with subtotals",
        epilog="Examples: toggl.py summary --month 2026-05\n"
               "          toggl.py summary --start 2026-03-01 --end 2026-04-30 --json")
    sub.add_argument("--month", metavar="YYYY-MM")
    sub.add_argument("--start", metavar="YYYY-MM-DD")
    sub.add_argument("--end", metavar="YYYY-MM-DD")
    sub.add_argument("--json", action="store_true", help="structured JSON output")
    sub.set_defaults(func=cmd_summary)

    time_entry_args = {
        "--project": dict(required=True,
                          help="project name, unique substring, or ID"),
        "--description": dict(required=True),
        "--billable": dict(action="store_true",
                           help=f'add the "{BILLABLE_TAG}" tag'),
        "--tags": dict(default="", help="comma-separated extra tags"),
    }

    sub = commands.add_parser(
        "track", help="create a completed entry (times are LOCAL, stored as UTC)",
        epilog='Example: toggl.py track --project "Atlas" --description '
               '"API design" --date 2026-06-05 --start 10:00 --stop 12:00 --billable')
    for flag, options in time_entry_args.items():
        sub.add_argument(flag, **options)
    sub.add_argument("--date", metavar="YYYY-MM-DD", help="default: today")
    sub.add_argument("--start", required=True, metavar="HH:MM", help="local time")
    sub.add_argument("--stop", required=True, metavar="HH:MM", help="local time")
    sub.set_defaults(func=cmd_track)

    sub = commands.add_parser("start", help="start a running timer now")
    for flag, options in time_entry_args.items():
        sub.add_argument(flag, **options)
    sub.set_defaults(func=cmd_start)

    sub = commands.add_parser("stop", help="stop the running timer")
    sub.set_defaults(func=cmd_stop)

    sub = commands.add_parser("current", help="show the running timer")
    sub.set_defaults(func=cmd_current)

    sub = commands.add_parser(
        "edit", help="update an entry (only the flags you pass change)")
    sub.add_argument("--id", required=True, type=int)
    sub.add_argument("--description")
    sub.add_argument("--project", help="project name, substring, or ID")
    sub.add_argument("--date", metavar="YYYY-MM-DD",
                     help="date for --start/--stop (default: entry's date)")
    sub.add_argument("--start", metavar="HH:MM", help="local time")
    sub.add_argument("--stop", metavar="HH:MM", help="local time")
    billable_group = sub.add_mutually_exclusive_group()
    billable_group.add_argument("--billable", dest="billable",
                                action="store_const", const=True, default=None)
    billable_group.add_argument("--no-billable", dest="billable",
                                action="store_const", const=False)
    sub.set_defaults(func=cmd_edit)

    sub = commands.add_parser(
        "delete", help="delete an entry — prints a preview unless --confirm")
    sub.add_argument("--id", required=True, type=int)
    sub.add_argument("--confirm", action="store_true")
    sub.set_defaults(func=cmd_delete)

    sub = commands.add_parser(
        "new-project",
        help="create a project; --client creates/attaches the client by name",
        epilog='Example: toggl.py new-project --name "Skylark" --client "Borealis"')
    sub.add_argument("--name", required=True)
    sub.add_argument("--client", help="client name (created if it doesn't exist)")
    sub.add_argument("--force", action="store_true",
                     help="create even if a same-named project exists")
    sub.set_defaults(func=cmd_new_project)

    sub = commands.add_parser(
        "timeline",
        help="auto-tracked window activity from the local desktop app "
             "(macOS, no API calls)",
        epilog="Example: toggl.py timeline --date 2026-06-05 --gap 180")
    sub.add_argument("--date", metavar="YYYY-MM-DD", help="default: today")
    sub.add_argument("--gap", type=int, default=180,
                     help="seconds of no recording that split runs (default 180)")
    sub.add_argument("--min-seconds", type=int, default=30,
                     help="hide per-title aggregates below this (default 30; 0 = all)")
    sub.add_argument("--raw", action="store_true",
                     help="raw event list instead of the runs view")
    sub.set_defaults(func=cmd_timeline)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
