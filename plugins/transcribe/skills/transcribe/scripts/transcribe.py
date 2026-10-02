#!/usr/bin/env python3
"""Transcribe recordings with AssemblyAI into speaker-labelled markdown notes.

Reads   <base-dir>/audio/*              audio files (extract video tracks first)
Writes  <out-dir>/<name>.md             one note per recording (default <base-dir>/transcripts)
Keeps   <base-dir>/.transcribe/         state.json and the raw result per recording, so a
                                        re-run never pays twice and an interrupted run resumes

Paid work is the thing to protect. The transcript id is saved as soon as AssemblyAI
returns it, a re-run resumes that job instead of submitting again, and a note is never
overwritten: hand corrections live only there.

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


class Failure(Exception):
    """This recording failed; the batch goes on."""


class Fatal(Exception):
    """Nothing else in the batch can succeed (credentials, another run, bad input)."""


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
        except OSError as exc:
            raise HTTPFailure(None, f"network error on {method} {path}: {exc}")

    def upload(self, path: Path) -> str:
        with path.open("rb") as handle:
            result = self.call("POST", "/upload", data=handle, timeout=1800, headers={
                "content-type": "application/octet-stream",
                "content-length": str(path.stat().st_size)})
        return result["upload_url"]

    def submit(self, upload_url: str) -> str:
        return self.call("POST", "/transcript", data=json.dumps({"audio_url": upload_url, **REQUEST}).encode(),
                         headers={"content-type": "application/json"})["id"]

    def wait(self, transcript_id: str, deadline: float) -> dict:
        delay = 5
        while True:
            try:
                result = self.call("GET", f"/transcript/{transcript_id}", timeout=30)
            except HTTPFailure as exc:
                # Reading is safe to repeat: retry network trouble and server errors until
                # the deadline. Client errors (a wrong id, say) will not get better.
                if (exc.status is not None and exc.status < 500) or time.monotonic() > deadline:
                    raise
                print(f"  retrying after: {exc}", flush=True)
                time.sleep(delay)
                continue
            status = result["status"]
            if status == "completed":
                if result.get("audio_url") == "http://deleted_by_user":
                    raise Failure(f"transcript {transcript_id} was deleted at AssemblyAI before it was saved")
                return result
            if status == "error":
                raise Failure(f"AssemblyAI failed: {result.get('error')}")
            if time.monotonic() > deadline:
                raise Failure(f"still {status!r} at the deadline; re-run to keep waiting for {transcript_id}")
            print(f"  {status} ...", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 30)

    def delete(self, transcript_id: str) -> None:
        self.call("DELETE", f"/transcript/{transcript_id}")


def write_atomic(path: Path, text: str) -> None:
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def write_new(path: Path, text: str) -> None:
    """Publish a file only if the name is free: os.link refuses to replace anything."""
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    try:
        os.link(tmp, path)
    finally:
        tmp.unlink()


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
    """<base>/.transcribe/state.json: one record per recording, saved after every step."""

    def __init__(self, base: Path):
        self.dir = base / ".transcribe"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.path = self.dir / "state.json"
        self.records = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}
        # Base dirs from version 0.2 kept a tab-separated `.transcribed` ledger (id, stem).
        # Those recordings are paid for; count them as done rather than buying them again.
        legacy = base / ".transcribed"
        if legacy.exists():
            for line in legacy.read_text(encoding="utf-8").splitlines():
                transcript_id, _, stem = line.partition("\t")
                if transcript_id and stem and stem not in self.records:
                    self.records[stem] = {"transcript_id": transcript_id, "status": "done", "legacy": True,
                                          "remote_deleted": True, "note": "(filed by an earlier version)"}

    def save(self, name: str, **fields) -> dict:
        self.records.setdefault(name, {}).update(fields)
        write_atomic(self.path, json.dumps(self.records, indent=2, ensure_ascii=False) + "\n")
        return self.records[name]

    def result_path(self, transcript_id: str) -> Path:
        return self.dir / f"{transcript_id}.json"


def lock(base: Path):
    handle = (base / ".transcribe" / "lock").open("w")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise Fatal(f"another transcribe run is using {base}; wait for it to finish")
    return handle  # held until the process exits


def note_path(out_dir: Path, name: str, transcript_id: str) -> Path:
    path = out_dir / f"{name}.md"
    return path if not path.exists() else out_dir / f"{name}.{transcript_id[:8]}.md"


def transcribe(path: Path, digest: str, state: State, client: Client, args) -> str:
    name = path.stem
    record = state.records.get(name)
    if record and record.get("status") == "done" and not args.retranscribe \
            and (record.get("remote_deleted") or args.keep_remote) \
            and (record.get("legacy") or record.get("sha256") == digest):
        print(f"skip (already transcribed): {name} -> {record.get('note')}")
        return record["note"]
    print(f"\n== {name}")
    if record and record.get("sha256") != digest and not args.retranscribe:
        raise Failure(f"{path.name} changed since it was transcribed; pass --retranscribe to pay for it again")
    if args.retranscribe and record and record.get("status") == "done":
        # The earlier note and raw result stay where they are; only the record moves on.
        record = state.save(name, status=None, transcript_id=None, note=None, remote_deleted=False, legacy=False)

    if not record or not record.get("transcript_id"):
        print(f"  uploading {path.stat().st_size / 1e6:.1f} MB to the {args.region.upper()} endpoint ...", flush=True)
        transcript_id = client.submit(client.upload(path))
        # Saved before anything else can fail: from here the job is paid for.
        record = state.save(name, sha256=digest, region=args.region, transcript_id=transcript_id, status="submitted")
        print(f"  transcript id: {transcript_id}", flush=True)
    transcript_id = record["transcript_id"]
    client = client if record.get("region", args.region) == args.region else Client(record["region"])

    result_file = state.result_path(transcript_id)
    if record["status"] == "submitted":
        result = client.wait(transcript_id, time.monotonic() + args.timeout * 60)
        write_atomic(result_file, json.dumps(result, ensure_ascii=False))
        record = state.save(name, status="saved")
    if record["status"] == "saved":
        result = json.loads(result_file.read_text(encoding="utf-8"))
        note = note_path(args.out_dir, name, transcript_id)
        write_new(note, to_markdown(result, name, record.get("region", args.region)))
        record = state.save(name, status="done", note=str(note))
        print(f"  language={result.get('language_code')} speakers={','.join(speakers_in(result)) or 'none'}"
              f" words={len(result.get('words') or [])} -> {note}")
    if not args.keep_remote and not record.get("remote_deleted"):
        client.delete(transcript_id)
        state.save(name, remote_deleted=True)
        print("  deleted at AssemblyAI (raw result kept in .transcribe/)")
    return record["note"]


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
    parser.add_argument("--keep-remote", action="store_true", help="keep the transcript at AssemblyAI instead of deleting it")
    parser.add_argument("--retranscribe", action="store_true", help="pay again; the new note never replaces the old one")
    parser.add_argument("--timeout", type=float, default=60, help="minutes to wait per recording (default: 60)")
    args = parser.parse_args()
    args.out_dir = args.out_dir or args.base_dir / "transcripts"

    try:
        files = targets(args)
        state = State(args.base_dir)
        held = lock(args.base_dir)  # noqa: F841 -- released when the process exits
        args.out_dir.mkdir(parents=True, exist_ok=True)
        client = Client(args.region)
        failed = []
        for path in files:
            try:
                transcribe(path, sha256(path), state, client, args)
            except Failure as exc:
                failed.append(path.stem)
                print(f"  FAILED: {exc}", file=sys.stderr, flush=True)
    except Fatal as exc:
        print(exc, file=sys.stderr)
        return 2
    if failed:
        print(f"\n{len(failed)} of {len(files)} failed: {', '.join(failed)}. Re-run to resume.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
