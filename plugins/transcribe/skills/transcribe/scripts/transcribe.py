#!/usr/bin/env python3
"""Transcribe recordings with AssemblyAI (speaker-labelled, auto language).

Reads  <base-dir>/audio/*            any common audio file
Writes <base-dir>/transcripts/<name>.md -- a finished markdown note
Keeps  <base-dir>/.transcribed -- id and stem per recording, so a re-run knows
       what has already been paid for even after the notes are filed elsewhere.

The note is markdown on purpose, not JSON: a human reads it, edits its header and
files it somewhere, and markdown is the format that is both readable and
editable. Everything the machine knows goes in the frontmatter; what only a
person can say -- who is speaking, what the transcript gets wrong -- is left for
whoever files it. There is deliberately no second script to combine the two.

Key lookup order:
  1. $ASSEMBLYAI_API_KEY
  2. ~/.config/assemblyai/api_key   (chmod 600)
  3. macOS login keychain: security find-generic-password -s assemblyai -w

Usage:
  ./transcribe.py --base-dir DIR                 # every recording without a note yet
  ./transcribe.py --base-dir DIR FILE [FILE...]  # only these
  ./transcribe.py --base-dir DIR --out-dir DIR   # write the notes somewhere else
  ./transcribe.py --base-dir DIR --force ...     # re-transcribe even if a note exists
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://api.assemblyai.com/v2"
# The async API on purpose, not the Sync API (sync.assemblyai.com/transcribe).
# Sync caps at 120 seconds of WAV or raw PCM, has no speaker diarization, takes
# no language detection at all (`language_code` simply defaults to `en`), and
# costs $0.45/hr against async's $0.21. Each of those alone rules it out here:
# recordings run past an hour, speaker labels are half the point, and a silently
# English transcript of German audio is the exact failure this script exists to
# prevent. Re-checked against the docs on 2026-08-15; revisit only if the
# duration cap and diarization change, not because it is faster.

CONFIG_FILE = Path.home() / ".config" / "assemblyai" / "api_key"
# Shown in the error message rather than the expanded path: it stays readable and
# stable no matter whose home directory the script runs under.
CONFIG_DISPLAY = "~/.config/assemblyai/api_key"

# What counts as a recording when scanning audio/. Deliberately audio only:
# AssemblyAI accepts video containers too, but uploading a multi-gigabyte screen
# recording to send the same audio takes far longer than extracting it first.
AUDIO_SUFFIXES = {".m4a", ".mp3", ".wav", ".flac", ".ogg", ".opus", ".aac", ".aiff", ".wma"}
# Not transcribed, only recognised: dropping the video straight in is the
# obvious thing to try, and "no recordings found" is a bad answer to it.
VIDEO_SUFFIXES = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mpg", ".mpeg", ".wmv"}


def api_key() -> str:
    key = os.environ.get("ASSEMBLYAI_API_KEY")
    if key and key.strip():
        return key.strip()

    if CONFIG_FILE.exists():
        key = CONFIG_FILE.read_text(encoding="utf-8").strip()
        if key:
            return key

    try:
        key = subprocess.run(
            ["security", "find-generic-password", "-s", "assemblyai", "-w"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        if key:
            return key
    except FileNotFoundError:
        # Not macOS -- no keychain to consult. Fall through to the error below.
        pass
    except subprocess.CalledProcessError:
        pass

    sys.exit(
        "No AssemblyAI API key found. Provide one of:\n"
        "  1. export ASSEMBLYAI_API_KEY=<key>\n"
        f"  2. write the key to {CONFIG_DISPLAY} (then: chmod 600 {CONFIG_DISPLAY})\n"
        '  3. macOS keychain: security add-generic-password -s assemblyai -a "$USER" -w <key>\n'
        "Get a key at https://www.assemblyai.com/app/account"
    )


def request(url: str, key: str, *, data=None, headers=None, method="GET", timeout=60):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("authorization", key)
    for header, value in (headers or {}).items():
        req.add_header(header, value)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        sys.exit(f"HTTP {exc.code} from {url}: {exc.read().decode(errors='replace')[:500]}")
    except OSError as exc:
        # Never hang silently: a stalled socket must surface as a failure.
        sys.exit(f"Network error on {method} {url}: {exc}")


def upload(path: Path, key: str) -> str:
    size = path.stat().st_size
    print(f"  uploading {size / 1e6:.1f} MB ...", flush=True)
    with path.open("rb") as handle:
        result = request(
            f"{BASE}/upload",
            key,
            data=handle,
            headers={"content-type": "application/octet-stream", "content-length": str(size)},
            method="POST",
            timeout=1800,
        )
    url = result.get("upload_url")
    if not url:
        sys.exit(f"  upload returned no upload_url: {result}")
    return url


def submit(upload_url: str, key: str) -> str:
    payload = {
        "audio_url": upload_url,
        # Never hardcode a language. Which one is spoken is a property of the
        # recording, not of this script, and a wrong language_code returns fluent
        # nonsense rather than an error. language_code and language_detection are
        # mutually exclusive: setting one turns the other off.
        "language_detection": True,
        "speaker_labels": True,
        # Not redundant despite defaulting to True: speaker_labels REQUIRES
        # punctuate, so dropping this as a "redundant default" silently kills
        # diarization. Stated in the API reference, not in the diarization guide.
        "punctuate": True,
        "format_text": True,
        # Pinned on purpose. Left unset, older accounts silently fall back to
        # universal-2, which mangles exactly the vocabulary that matters: "Der
        # EU AI Act" came back as "Dear aua", and elsewhere as "EU Act" --
        # fluent, plausible, wrong. universal-3-5-pro gets that right, along with
        # German compounds ("Hochrisiko-KI-Systeme").
        # No universal-2 fallback on purpose. A fallback here would be a silent
        # downgrade to the model that produced "Dear aua", which is the exact
        # failure class this skill exists to prevent -- better a loud error than
        # a plausible-looking bad transcript. Its documented reason (languages
        # 3-5-pro cannot handle) did not survive testing: 3-5-pro transcribed
        # Polish and Dutch correctly on its own.
        # Valid values are exactly universal-3-pro, universal-2 and
        # universal-3-5-pro -- hyphens, not dots. Ask the API if in doubt: it
        # lists them in the 400 it returns for a bad one. The singular
        # "speech_model" is deprecated in favour of this plural parameter.
        "speech_models": ["universal-3-5-pro"],
    }
    result = request(
        f"{BASE}/transcript",
        key,
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    return result["id"]


def poll(transcript_id: str, key: str, budget: int) -> dict:
    delay, waited = 5, 0
    while True:
        result = request(f"{BASE}/transcript/{transcript_id}", key, timeout=30)
        status = result.get("status")
        if status == "completed":
            return result
        if status == "error":
            sys.exit(f"  AssemblyAI failed: {result.get('error')}")
        if status not in ("queued", "processing"):
            sys.exit(f"  unexpected status {status!r}: {json.dumps(result)[:500]}")
        if waited >= budget:
            sys.exit(
                f"  gave up after {waited}s still {status!r};"
                f" inspect transcript id {transcript_id}"
            )
        print(f"  {status} ({waited}s) ...", flush=True)
        time.sleep(delay)
        waited += delay


def duration_seconds(path: Path) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return float(out)
    except (subprocess.CalledProcessError, ValueError, FileNotFoundError) as exc:
        # Only the poll budget depends on this, so it is not worth aborting over
        # -- but say it out loud rather than quietly pretending an hour.
        print(f"  ffprobe unavailable or failed ({type(exc).__name__}); assuming 60 min",
              file=sys.stderr, flush=True)
        return 3600.0


def timestamp(ms: int) -> str:
    seconds = ms // 1000
    return f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def yaml_value(value: object) -> str:
    # JSON syntax is also valid YAML, and it escapes the quotes, colons and
    # brackets that turn up in recording filenames, while rendering None as
    # `null` rather than `None`. Cheaper than depending on PyYAML, which is not
    # in the standard library.
    return json.dumps(value, ensure_ascii=False)


def speakers_in(result: dict) -> list:
    return sorted({u["speaker"] for u in result.get("utterances") or []})


def to_markdown(result: dict, name: str) -> str:
    utterances = result.get("utterances") or []
    lines = [
        "---",
        # The stem, without an extension. The extension names the container the
        # audio happened to arrive in, which says nothing about the recording;
        # the stem is what ties the note back to its source.
        f"recording: {yaml_value(name)}",
        # `or 0` rather than a get() default: the key comes back present and null
        # on some results, and a default only covers it being absent. Raising here
        # would throw away a transcript that has already been paid for.
        # Quoted: unquoted 00:41:23 is sexagesimal in YAML 1.1 and some readers
        # turn it into a number.
        f"duration: {yaml_value(timestamp(int((result.get('audio_duration') or 0) * 1000)))}",
        # Quoted for the same reason: Norwegian's code is `no`, which YAML 1.1
        # reads as boolean false.
        f"language: {yaml_value(result.get('language_code'))}",
        # Via yaml_value too: a missing confidence formats as Python's `None`,
        # which YAML reads as the string "None" rather than as empty.
        f"language_confidence: {yaml_value(result.get('language_confidence'))}",
        # Via yaml_value like every other field, for consistency rather than for
        # a known bug: the YAML 1.1 spec resolves bare `Y` and `N` as booleans,
        # but none of the parsers on the path here do (Obsidian's js-yaml, and
        # Ruby's psych, all read them as strings -- checked). Quoting costs
        # nothing and removes the question.
        f"speakers: {yaml_value(speakers_in(result))}",
        f"words: {len(result.get('words') or [])}",
        # speech_models is the request echoed back -- a priority list, not a
        # result. speech_model_used is the one that actually ran. Record the
        # fact; the ask is already in this script.
        f"model: {result.get('speech_model_used') or ', '.join(result.get('speech_models') or ['—'])}",
        f"transcript_id: {result.get('id')}",
        "---",
        "",
        f"# {name}",
        "",
        "> [!info] Machine transcription",
        "> Transcribed from the recording with AssemblyAI. Names and technical terms",
        "> are sometimes wrong. Where the two disagree, the recording wins, not this text.",
        "",
    ]
    if utterances:
        for utterance in utterances:
            lines.append(
                f"**Speaker {utterance['speaker']}** [{timestamp(utterance['start'])}]  \n"
                f"{utterance['text']}\n"
            )
    else:
        # No diarization came back -- say so rather than silently emitting a wall of text.
        # `or ""` rather than a get() default, for the same reason as audio_duration
        # above: an aborted or silent recording comes back with `text` present and
        # null, and joining a None would throw away a transcript already paid for.
        lines += ["_No speaker segments detected; the full text follows._",
                  "", result.get("text") or ""]
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Transcribe recordings with AssemblyAI.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"Key lookup: $ASSEMBLYAI_API_KEY, then {CONFIG_DISPLAY}, then the macOS keychain.",
    )
    parser.add_argument(
        "files", nargs="*", type=Path,
        help="specific audio files; default is every recording in <base-dir>/audio",
    )
    parser.add_argument(
        "--base-dir", type=Path, default=Path.cwd(),
        help="directory holding audio/ and the .transcribed ledger; keep it and"
             " re-runs are free (default: current directory)",
    )
    parser.add_argument(
        "--out-dir", type=Path, default=None,
        help="where to write the notes (default: <base-dir>/transcripts)",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="re-transcribe even when a note already exists",
    )
    return parser.parse_args()


def read_ledger(path: Path) -> dict:
    # Maps stem -> transcript id for everything already paid for in this base
    # dir. Tab-separated and one line per recording so it stays greppable; a
    # malformed line is skipped rather than taken down the whole run.
    if not path.exists():
        return {}
    entries = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        transcript_id, _, stem = line.partition("\t")
        if stem:
            entries[stem] = transcript_id
    return entries


def find_recordings(audio_dir: Path) -> list:
    return sorted(p for p in audio_dir.glob("*")
                  if p.is_file() and p.suffix.lower() in AUDIO_SUFFIXES)


def nothing_to_do(audio_dir: Path) -> str:
    # Distinguish "you put nothing here" from "you put the video here", because
    # the second is the likely mistake and the fix for it is a different one.
    videos = sorted(p.name for p in audio_dir.glob("*")
                    if p.is_file() and p.suffix.lower() in VIDEO_SUFFIXES)
    message = (f"No audio found in {audio_dir}"
               f" (looked for {', '.join(sorted(AUDIO_SUFFIXES))})")
    if videos:
        source = audio_dir / videos[0]
        target = audio_dir / (Path(videos[0]).stem + ".m4a")
        message += (f"\nThere is video here though: {', '.join(videos[:5])}"
                    f"{' ...' if len(videos) > 5 else ''}\n"
                    "Extract the audio track first, which is far quicker than uploading"
                    " the video:\n"
                    f'  ffmpeg -y -i "{source}" -vn -acodec copy "{target}"\n'
                    # Copying the track is seconds and lossless, but .m4a only takes
                    # some codecs -- PCM out of a .mov is the usual refusal, and screen
                    # recorders produce plenty of it. Name the re-encode here rather
                    # than leaving someone with "could not find tag for codec".
                    "If that reports \"could not find tag for codec\", the track needs"
                    " re-encoding instead:\n"
                    f'  ffmpeg -y -i "{source}" -vn -c:a aac -b:a 128k "{target}"')
    return message


def check_unique_stems(targets: list) -> None:
    # Everything downstream keys off the stem: the note's filename, the ledger,
    # the skip check. Two recordings sharing one -- interview.wav next to
    # interview.mp3 -- would silently transcribe the first and report the second
    # as already done. Refuse the batch instead; renaming one file is a smaller
    # problem than a note that belongs to the wrong recording.
    seen = {}
    for path in targets:
        seen.setdefault(path.stem, []).append(path.name)
    clashes = {stem: names for stem, names in seen.items() if len(names) > 1}
    if clashes:
        detail = "; ".join(f"{stem}: {', '.join(names)}" for stem, names in sorted(clashes.items()))
        sys.exit(f"Recordings share a name, so their notes would collide -- rename one of each: {detail}")


def main() -> None:
    args = parse_args()
    audio_dir = args.base_dir / "audio"
    out_dir = args.out_dir or args.base_dir / "transcripts"
    # The note is the obvious "already done" marker, but it does not stay put:
    # whoever runs this files it somewhere afterwards, which empties the output
    # directory and would make the next run pay for the whole batch again. This
    # ledger stays behind, so "already transcribed" survives the note leaving.
    ledger_path = args.base_dir / ".transcribed"
    ledger = read_ledger(ledger_path)

    targets = args.files or find_recordings(audio_dir)
    if not targets:
        sys.exit(nothing_to_do(audio_dir))
    check_unique_stems(targets)

    key = api_key()
    out_dir.mkdir(parents=True, exist_ok=True)

    for path in targets:
        name = path.stem
        md_path = out_dir / f"{name}.md"
        if not args.force:
            if md_path.exists():
                print(f"skip (note exists): {name}")
                continue
            if name in ledger:
                # Paid for already, and the note has been filed somewhere else.
                # Print the id: it is the only way back to the result now.
                print(f"skip (already transcribed): {name} -> {ledger[name]}")
                continue
        print(f"\n== {name}")
        budget = int(1800 + duration_seconds(path))
        transcript_id = submit(upload(path, key), key)
        # Print the id here, before anything else can go wrong. Submitting is
        # what costs money, and from here the result lives only in the account;
        # a dropped connection while polling would otherwise take the id with it
        # and the next run would pay for the same recording again.
        print(f"  transcript id: {transcript_id}", flush=True)
        result = poll(transcript_id, key, budget)
        # Write to a scratch file and rename it into place. Transcribing costs
        # money, and the check above treats any existing note as done -- so a run
        # killed mid-write must not leave a truncated one behind to be skipped
        # forever. os.replace is atomic within a directory.
        partial = md_path.with_name(f".{md_path.name}.partial")
        # Explicit rather than locale-dependent. Python coerces the C locale to
        # UTF-8 on its own, so this is not a failure anyone has hit -- but the
        # transcript is in whatever language was spoken, and the default it falls
        # back on is not the file's to choose.
        partial.write_text(to_markdown(result, name), encoding="utf-8")
        os.replace(partial, md_path)
        # Append after the note is safely in place, so the ledger never claims
        # a recording the run did not finish. Appending rather than rewriting
        # keeps a killed run from truncating the entries before it.
        with ledger_path.open("a", encoding="utf-8") as ledger_file:
            ledger_file.write(f"{transcript_id}\t{name}\n")
        ledger[name] = transcript_id
        print(
            f"  done: lang={result.get('language_code')} "
            f"speakers={','.join(speakers_in(result)) or 'none'} "
            f"words={len(result.get('words') or [])} -> {md_path.name}"
        )


if __name__ == "__main__":
    main()
