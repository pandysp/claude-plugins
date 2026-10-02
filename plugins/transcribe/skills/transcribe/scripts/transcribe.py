#!/usr/bin/env python3
"""Transcribe recordings with AssemblyAI into speaker-labelled markdown notes.

Reads   <base-dir>/audio/*              audio files (extract video tracks first)
Writes  <out-dir>/<name>.md             one note per recording (default <base-dir>/transcripts)
Keeps   <base-dir>/.transcribe/         state.json and the raw result of every job

Paid work is the thing to protect. Before a job is submitted the recording is marked
as being submitted, and the transcript id is saved the moment AssemblyAI returns it,
so a re-run resumes the job instead of paying again. If the answer to a submission is
lost, the re-run stops and asks rather than guessing. A note is never overwritten:
hand corrections live only there. Remote copies are deleted only after the result is
on disk, and a deletion that fails is retried on every later run.

Usage:
  transcribe.py [--base-dir DIR] [--out-dir DIR] [--region eu|us] [--keep-remote]
                [--retranscribe] [--timeout MINUTES] [FILE ...]
"""

import argparse
import fcntl
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ENDPOINTS = {"eu": "https://api.eu.assemblyai.com/v2", "us": "https://api.assemblyai.com/v2"}
CONFIG_FILE = Path.home() / ".config" / "assemblyai" / "api_key"
AUDIO_SUFFIXES = {".m4a", ".mp3", ".wav", ".flac", ".ogg", ".opus", ".aac", ".aiff", ".wma"}
VIDEO_SUFFIXES = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mpg", ".mpeg", ".wmv"}
# Request settings, sent as they are. Language detection instead of a language code: a
# guessed wrong language returns fluent nonsense. The model is pinned with no fallback,
# so an unsupported language fails loudly instead of degrading to a weaker model.
# Speaker labels need punctuation; both are explicit. Docs:
# https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model
REQUEST = {
    "language_detection": True,
    "speaker_labels": True,
    "punctuate": True,
    "format_text": True,
    "speech_models": ["universal-3-5-pro"],
}


STATUSES = {"uploading", "submitting", "submitted", "saved", "done"}


class Failure(Exception):
    """This recording failed; the batch goes on."""


class Fatal(Exception):
    """The run stops (credentials, another run, bad input or state)."""


class HTTPFailure(Failure):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def api_key() -> str:
    key = os.environ.get("ASSEMBLYAI_API_KEY", "").strip()
    if key:
        return key
    if CONFIG_FILE.exists():
        key = CONFIG_FILE.read_text(encoding="utf-8").strip()
        if key:
            return key
    if sys.platform == "darwin":
        found = subprocess.run(["security", "find-generic-password", "-s", "assemblyai", "-w"],
                               capture_output=True, text=True)
        if found.returncode == 0 and found.stdout.strip():
            return found.stdout.strip()
        if found.returncode != 44:  # 44: no such item. Anything else is a keychain problem.
            raise Fatal(f"macOS keychain lookup failed: {found.stderr.strip()}")
    raise Fatal(
        "No AssemblyAI API key found. Provide one of:\n"
        "  export ASSEMBLYAI_API_KEY=<key>\n"
        "  ~/.config/assemblyai/api_key  (chmod 600)\n"
        '  macOS keychain: security add-generic-password -s assemblyai -a "$USER" -w <key>\n'
        "Get a key at https://www.assemblyai.com/app/account")


class Client:
    def __init__(self, region: str):
        self.region = region
        self.base = ENDPOINTS[region]
        self._key = None

    def call(self, method, path, *, data=None, headers=None, timeout=60):
        if self._key is None:
            self._key = api_key()  # only when there is network work to do
        req = urllib.request.Request(f"{self.base}{path}", data=data, method=method)
        req.add_header("authorization", self._key)
        for name, value in (headers or {}).items():
            req.add_header(name, value)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")[:300]
            if exc.code in (401, 403):
                raise Fatal(f"AssemblyAI rejected the API key (HTTP {exc.code}): {body}")
            raise HTTPFailure(exc.code, f"HTTP {exc.code} on {method} {path}: {body}")
        except (OSError, ValueError) as exc:
            raise HTTPFailure(None, f"network or response error on {method} {path}: {exc}")

    def upload(self, path: Path) -> str:
        with path.open("rb") as handle:
            result = self.call("POST", "/upload", data=handle, timeout=1800, headers={
                "content-type": "application/octet-stream",
                "content-length": str(path.stat().st_size)})
        if not result.get("upload_url"):
            raise Failure(f"upload returned no upload_url: {result}")
        return result["upload_url"]

    def submit(self, upload_url: str) -> str:
        result = self.call("POST", "/transcript", data=json.dumps({"audio_url": upload_url, **REQUEST}).encode(),
                           headers={"content-type": "application/json"})
        if not result.get("id"):
            raise Failure(f"submission returned no transcript id: {result}")
        return result["id"]

    def wait(self, transcript_id: str, deadline: float) -> dict:
        delay = 5
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise Failure(f"not finished by the deadline; re-run to keep waiting for {transcript_id}")
            try:
                result = self.call("GET", f"/transcript/{transcript_id}", timeout=min(30, remaining))
            except HTTPFailure as exc:
                # Reading is safe to repeat: retry network trouble, rate limits and server
                # errors until the deadline. Other client errors will not get better.
                if exc.status is not None and exc.status != 429 and exc.status < 500:
                    raise
                print(f"  retrying after: {exc}", flush=True)
                result = None
            if result is not None:
                status = result.get("status")
                if status == "completed":
                    if result.get("audio_url") == "http://deleted_by_user":
                        raise Failure(f"transcript {transcript_id} was deleted at AssemblyAI before it was saved")
                    return result
                if status == "error":
                    raise Failure(f"AssemblyAI failed: {result.get('error')} (pass --retranscribe to submit again)")
                print(f"  {status} ...", flush=True)
            time.sleep(max(0, min(delay, deadline - time.monotonic())))
            delay = min(delay * 2, 30)

    def delete(self, transcript_id: str) -> None:
        self.call("DELETE", f"/transcript/{transcript_id}")


def _durable_tmp(path: Path, text: str) -> str:
    """Write text to a fresh, uniquely named file beside path and flush it to disk."""
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    return tmp


def _sync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_atomic(path: Path, text: str) -> None:
    os.replace(_durable_tmp(path, text), path)
    _sync_dir(path.parent)


def write_new(path: Path, text: str) -> None:
    """Publish a file only if the name is free: os.link refuses to replace anything."""
    tmp = _durable_tmp(path, text)
    try:
        os.link(tmp, path)
    finally:
        os.unlink(tmp)
    _sync_dir(path.parent)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def timestamp(ms: int) -> str:
    seconds = ms // 1000
    return f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def speakers_in(result: dict) -> list:
    return sorted({u["speaker"] for u in result.get("utterances") or []})


def to_markdown(result: dict, name: str, region: str) -> str:
    # json.dumps gives valid, quoted YAML scalars: filenames with colons stay strings,
    # Norwegian `no` is not read as false, and 00:41:23 is not read as a number.
    duration = result.get("audio_duration")
    meta = {
        "recording": name,
        "duration": timestamp(int(duration * 1000)) if duration is not None else None,
        "language": result.get("language_code"),
        "language_confidence": result.get("language_confidence"),
        "speakers": speakers_in(result),
        "words": len(result.get("words") or []),
        "model": result.get("speech_model_used"),
        "region": region,
        "transcript_id": result.get("id"),
    }
    lines = ["---", *(f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in meta.items()), "---", "",
             f"# {name}", "",
             "> [!info] Machine transcription",
             "> Transcribed from the recording with AssemblyAI. Names and technical terms",
             "> are sometimes wrong. Where the two disagree, the recording wins, not this text.", ""]
    utterances = result.get("utterances") or []
    for u in utterances:
        lines.append(f"**Speaker {u['speaker']}** [{timestamp(u['start'])}]  \n{u['text']}\n")
    if not utterances:
        lines += ["_No speaker segments detected; the full text follows._", "", result.get("text") or ""]
    return "\n".join(lines)


class State:
    """<base>/.transcribe/state.json: one record per recording plus remote copies still to
    delete. Saved durably after every step; read only while holding the lock."""

    def __init__(self, folder: Path, base: Path):
        self.dir = folder
        self.path = folder / "state.json"
        try:
            data = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}
        except ValueError as exc:
            raise Fatal(f"{self.path} is damaged ({exc}); fix it or move it away")
        if data and "recordings" not in data:  # format of version 0.3.0
            data = {"recordings": data, "pending_delete": [
                {"id": r["transcript_id"], "region": r.get("region", "eu")} for r in data.values()
                if r.get("status") == "done" and r.get("transcript_id") and not r.get("remote_deleted")]}
        self.records = data.get("recordings", {})
        self.pending = data.get("pending_delete", [])
        legacy = base / ".transcribed"  # version 0.2 ledger: "<transcript id>\t<name>" per line
        if legacy.exists():
            for number, line in enumerate(legacy.read_text(encoding="utf-8").splitlines(), 1):
                transcript_id, _, stem = line.partition("\t")
                if not transcript_id or not stem:
                    raise Fatal(f"{legacy}:{number} is not '<transcript id><TAB><name>'; fix or remove that line")
                # Paid for by an earlier version on the US endpoint. Whether it was deleted
                # there is unknown, so nothing here claims it was.
                self.records.setdefault(stem, {"transcript_id": transcript_id, "status": "done", "legacy": True,
                                               "note": "(written by an earlier version)"})

    def _write(self):
        write_atomic(self.path, json.dumps({"recordings": self.records, "pending_delete": self.pending},
                                           indent=2, ensure_ascii=False) + "\n")

    def save(self, name: str, **fields) -> dict:
        self.records.setdefault(name, {}).update(fields)
        self._write()
        return self.records[name]

    def queue_delete(self, transcript_id: str, region: str):
        if not any(p["id"] == transcript_id for p in self.pending):
            self.pending.append({"id": transcript_id, "region": region})
            self._write()

    def deleted(self, transcript_id: str):
        self.pending = [p for p in self.pending if p["id"] != transcript_id]
        for record in self.records.values():
            if record.get("transcript_id") == transcript_id:
                record["remote_deleted"] = True
        self._write()

    def result_path(self, transcript_id: str) -> Path:
        return self.dir / f"{transcript_id}.json"


def lock(folder: Path):
    handle = (folder / "lock").open("w")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise Fatal(f"another transcribe run is using {folder.parent}; wait for it to finish")
    return handle  # held until the process exits


def free_note_path(out_dir: Path, name: str, transcript_id: str) -> Path:
    """The first name that is free or already holds this transcript's note."""
    for candidate in (out_dir / f"{name}.md", out_dir / f"{name}.{transcript_id}.md"):
        if not candidate.exists() or written_by(candidate, transcript_id):
            return candidate
    raise Failure(f"{name}.md and {name}.{transcript_id}.md both exist in {out_dir} and hold other notes")


def written_by(note: Path, transcript_id: str) -> bool:
    """Whether the note's header block (frontmatter) names this transcript."""
    text = note.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return False
    header = text[4:].split("\n---", 1)[0]
    return f'transcript_id: "{transcript_id}"' in header.splitlines()


def saved_result(state: State, transcript_id: str):
    """The raw result if an earlier run saved it completely, else None."""
    path = state.result_path(transcript_id)
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return result if result.get("id") == transcript_id and result.get("status") == "completed" else None


def transcribe(path: Path, digest: str, state: State, client: Client, args) -> None:
    name = path.stem
    record = state.records.get(name)
    if record and record.get("status") not in STATUSES:
        raise Failure(f"unknown state {record.get('status')!r} for {name} in {state.path}")
    if record and record.get("status") == "done" and not args.retranscribe:
        if record.get("legacy"):
            print(f"skip (transcribed by an earlier version, id {record['transcript_id']}): {name}")
            return
        if not record.get("transcript_id") or not record.get("sha256"):
            raise Failure(f"the state record for {name} is incomplete; check {state.path}")
        if record["sha256"] == digest:
            if not args.keep_remote and not record.get("remote_deleted"):  # kept earlier, delete now
                state.queue_delete(record["transcript_id"], record.get("region", args.region))
            print(f"skip (already transcribed): {name} -> {record.get('note')}")
            return
    print(f"\n== {name}")
    if record and not args.retranscribe:
        if record.get("sha256") not in (None, digest):
            raise Failure(f"{path.name} changed since it was transcribed; pass --retranscribe to pay for it again")
        if record.get("status") == "submitting":
            raise Failure(
                f"an earlier run submitted {name} but never got the answer, so it may already be paid for. "
                "Check the transcripts in your AssemblyAI dashboard; pass --retranscribe to submit it again.")
    if record and args.retranscribe:
        # The earlier note and raw result stay where they are. An earlier remote copy is
        # still deleted, by the queue, whatever state its job was in.
        if record.get("transcript_id") and not record.get("legacy") and not record.get("remote_deleted") \
                and not args.keep_remote:
            state.queue_delete(record["transcript_id"], record.get("region", args.region))
        state.records.pop(name)
        record = None

    if not record or record.get("status") in (None, "uploading"):
        state.save(name, sha256=digest, region=args.region, transcript_id=None, note=None, status="uploading")
        print(f"  uploading {path.stat().st_size / 1e6:.1f} MB to the {args.region.upper()} endpoint ...", flush=True)
        upload_url = client.upload(path)
        state.save(name, status="submitting")  # from here, a lost answer may still mean a paid job
        transcript_id = client.submit(upload_url)
        record = state.save(name, transcript_id=transcript_id, status="submitted")
        print(f"  transcript id: {transcript_id}", flush=True)
    transcript_id, region = record["transcript_id"], record.get("region", args.region)
    remote = client if region == client.region else Client(region)

    if record["status"] == "submitted":
        result = saved_result(state, transcript_id)
        if result is None:
            result = remote.wait(transcript_id, time.monotonic() + args.timeout * 60)
            write_atomic(state.result_path(transcript_id), json.dumps(result, ensure_ascii=False))
        record = state.save(name, status="saved")
    if record["status"] == "saved":
        result = saved_result(state, transcript_id)
        if result is None:
            raise Failure(f"the saved result {state.result_path(transcript_id)} is missing or damaged")
        if not record.get("note"):
            record = state.save(name, note=str(free_note_path(args.out_dir, name, transcript_id)))
        note = Path(record["note"])
        if note.exists() and not written_by(note, transcript_id):
            # Not the note an earlier run wrote before crashing: someone else took the name.
            note = free_note_path(args.out_dir, name, transcript_id)
            state.save(name, note=str(note))
        if not note.exists():
            write_new(note, to_markdown(result, name, region))  # refuses if the name was just taken
        elif not written_by(note, transcript_id):
            raise Failure(f"{note} was taken by another file just now; nothing was overwritten, re-run")
        if not args.keep_remote:
            state.queue_delete(transcript_id, region)
        state.save(name, status="done")
        print(f"  language={result.get('language_code')} speakers={','.join(speakers_in(result)) or 'none'}"
              f" words={len(result.get('words') or [])} -> {note}")


def delete_pending(state: State, clients: dict) -> list:
    """Delete every remote copy still queued. Returns the ids that failed."""
    failed = []
    for item in list(state.pending):
        client = clients.setdefault(item["region"], Client(item["region"]))
        try:
            client.delete(item["id"])
        except Failure as exc:
            failed.append(item["id"])
            print(f"  could not delete {item['id']} at AssemblyAI yet: {exc}", file=sys.stderr, flush=True)
            continue
        state.deleted(item["id"])
        print(f"  deleted {item['id']} at AssemblyAI (raw result kept in .transcribe/)")
    return failed


def targets(args) -> list:
    if args.files:
        missing = [str(p) for p in args.files if not p.is_file()]
        if missing:
            raise Fatal(f"not found: {', '.join(missing)}")
        files = args.files
    else:
        audio = args.base_dir / "audio"
        files = sorted(p for p in audio.glob("*") if p.is_file() and p.suffix.lower() in AUDIO_SUFFIXES)
        if not files:
            videos = sorted(p.name for p in audio.glob("*") if p.suffix.lower() in VIDEO_SUFFIXES)
            hint = (f"\nThere is video here ({', '.join(videos[:3])}); extract the audio first:\n"
                    f'  ffmpeg -n -i "{audio / videos[0]}" -vn -acodec copy "{audio / Path(videos[0]).stem}.m4a"'
                    if videos else "")
            raise Fatal(f"No audio found in {audio}{hint}")
    stems = {}
    for p in files:
        stems.setdefault(p.stem, []).append(p.name)
    clashes = [", ".join(names) for names in stems.values() if len(names) > 1]
    if clashes:
        raise Fatal(f"recordings share a name, so their notes would collide; rename one of: {'; '.join(clashes)}")
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe recordings with AssemblyAI.")
    parser.add_argument("files", nargs="*", type=Path, help="audio files (default: every recording in <base-dir>/audio)")
    parser.add_argument("--base-dir", type=Path, default=Path.cwd(), help="holds audio/ and .transcribe/; keep it")
    parser.add_argument("--out-dir", type=Path, help="where notes go (default: <base-dir>/transcripts)")
    parser.add_argument("--region", choices=ENDPOINTS, default="eu", help="AssemblyAI region (default: eu)")
    parser.add_argument("--keep-remote", action="store_true", help="keep transcripts at AssemblyAI instead of deleting them")
    parser.add_argument("--retranscribe", action="store_true", help="pay again; the new note never replaces the old one")
    parser.add_argument("--timeout", type=float, default=60, help="minutes to wait per recording (default: 60)")
    args = parser.parse_args()
    args.out_dir = args.out_dir or args.base_dir / "transcripts"

    failed, done, files, stopped = [], [], [], None
    try:
        folder = args.base_dir / ".transcribe"
        folder.mkdir(parents=True, exist_ok=True)
        held = lock(folder)  # noqa: F841 -- released when the process exits
        state = State(folder, args.base_dir)  # read under the lock
        clients = {args.region: Client(args.region)}
        try:
            files = targets(args)
        except Fatal as exc:  # nothing to transcribe; queued deletions still run below
            stopped = exc
        if files:
            args.out_dir.mkdir(parents=True, exist_ok=True)
        for path in files:
            try:
                transcribe(path, sha256(path), state, clients[args.region], args)
                done.append(path.stem)
            except (Failure, OSError) as exc:
                failed.append(path.stem)
                print(f"  FAILED: {exc}", file=sys.stderr, flush=True)
        undeleted = delete_pending(state, clients)
        if stopped:
            raise stopped
    except Fatal as exc:
        print(exc, file=sys.stderr)
        if done:
            print(f"Finished before it stopped: {', '.join(done)}", file=sys.stderr)
        return 2
    if failed or undeleted:
        if failed:
            print(f"\n{len(failed)} of {len(files)} failed: {', '.join(failed)}. Re-run to resume.", file=sys.stderr)
        if undeleted:
            print(f"{len(undeleted)} transcript(s) still stored at AssemblyAI; a re-run tries again.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
