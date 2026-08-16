---
name: transcribe
description: >
  Turns recordings into readable, speaker-labelled markdown notes using
  AssemblyAI, with the spoken language detected rather than assumed. Use this
  skill when the user asks to "transcribe a recording", "transcribe this
  interview", "transcribe the meeting", "write up this call", "what was said in
  this recording", or hands over audio or video and wants the words out of it.
  The request itself may be in any language; what was recorded almost certainly
  is.
---

# Transcription

Four steps: get the audio, transcribe it, file the notes where they belong,
write down what the transcript gets wrong.

The script does the one deterministic part and writes a finished note per
recording. Everything after that is yours: what each recording is, where it
belongs, and what a reader needs warning about. Do not look for a script for
those — there deliberately isn't one.

## Before you start

- `ffmpeg` and `ffprobe` on `PATH` — only needed to pull audio out of video.
- An AssemblyAI key, looked up in this order:
  1. `$ASSEMBLYAI_API_KEY`
  2. `~/.config/assemblyai/api_key` — preferred, `chmod 600`
  3. macOS keychain — legacy, skipped silently on Linux

Do not check for the key yourself. The script resolves it before it uploads
anything, and exits naming all three sources — so there is no window where a
missing key costs money, and nothing to pre-empt. If you check anyway, read the
exit status and never the value: a partial key still narrows the search, and a
transcript outlives the session that wrote it.

Get a key at <https://www.assemblyai.com/app/account>.

## 1. Collect the audio

Pick a working directory — anywhere with room, and separate from wherever the
notes will end up. Everything below calls it `<base>`. Put the audio in
`<base>/audio/`.

Audio files can go there as they are; the script reads `.m4a`, `.mp3`, `.wav`,
`.flac`, `.ogg`, `.opus`, `.aac`, `.aiff` and `.wma`. Video needs its audio
pulled out first:

```bash
mkdir -p "<base>/audio"
ffmpeg -y -i "<recording>.mp4" -vn -acodec copy "<base>/audio/<recording>.m4a"
```

- Keep the original filename as the stem. Everything downstream keys off it, and
  it is what ties a transcript back to its source. Two recordings that differ
  only by extension would collide, so the script refuses that batch rather than
  writing one note for both.
- `mkdir -p` first: nothing else creates `audio/`, and ffmpeg will not create it
  for you — it just fails.
- `-acodec copy` re-encodes nothing: seconds instead of minutes, no loss. If the
  audio track is not AAC, ffmpeg refuses the `.m4a` container ("could not find
  tag for codec"); re-encode that one with `-c:a aac -b:a 128k`, or copy into a
  container that fits it.
- `-y` overwrites. Extracted audio is derived from the recording, so redoing it
  changes nothing — and without the flag ffmpeg stops at an interactive prompt
  no one is there to answer. The never-overwrite rule below is about transcripts,
  which are not reproducible.
- Uploading the video directly would also work, but it sends gigabytes to
  transfer the same audio. Extract first.

## 2. Transcribe

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/transcribe/scripts/transcribe.py" --base-dir <base>
```

- The full path matters: you are running from wherever the user's files are, not
  from the skill's own directory, so a relative `scripts/...` finds nothing.
  `${CLAUDE_PLUGIN_ROOT}` is set for you when this runs as an installed plugin.
  If it is empty the command collapses to `/skills/...` and python reports a
  missing file — that means you are reading this skill from a checkout rather
  than an install, so use the `scripts/` directory beside this file instead.
- Reads `<base>/audio/`, writes one finished note per recording to
  `<base>/transcripts/<name>.md`. `--out-dir` puts them somewhere else; the
  staging step is only there to keep step 3 a separate decision.
- Re-running is safe and free, including after step 3 has moved the notes away.
  The script keeps a `<base>/.transcribed` ledger of what it has already paid
  for, so a second run prints `skip (already transcribed)` and the transcript id
  rather than buying the batch twice. Keep the base dir; that ledger is what
  makes a re-run cheap.
- The note is written to a scratch file and renamed into place, so a run that
  dies midway leaves nothing half-written for the next run to skip over.
- Everything the machine can know is already in the frontmatter — language,
  confidence, speaker labels, duration, word count, model, transcript id. What
  it cannot know it leaves out rather than guessing.
- No JSON is kept. The per-turn timestamps in the note are enough to find a
  quote in the recording, and `transcript_id` fetches the raw result back from
  AssemblyAI if word-level timings are ever needed.

### Do not "improve" these

- **Never set `language_code`.** Which language is spoken is a property of the
  recording, not something to decide in advance, so the script sends
  `language_detection: true`. A hardcoded wrong language returns *fluent nonsense
  rather than an error*. The two options are mutually exclusive: setting a
  language turns detection off.
- **`speaker_labels` requires `punctuate: true`.** Both default to `true`, so the
  explicit settings look redundant — delete them and diarization quietly
  disappears. This is in the API reference, *not* the diarization guide.
- **The model is pinned to `universal-3-5-pro`, with no fallback.** Unpinned does
  not mean newest: older accounts silently get `universal-2`, which turned "Der
  EU AI Act" into "Dear aua". Do not add `universal-2` back as a fallback — that
  is a silent downgrade to the bad model, and `universal-3-5-pro` handles even
  Polish and Dutch alone. Valid values are exactly `universal-3-pro`,
  `universal-2`, `universal-3-5-pro` — hyphens, not dots.
- **Not the Sync API.** `sync.assemblyai.com/transcribe` returns a transcript in
  one request instead of polling, which sounds like a straight upgrade. It caps
  at 120 seconds of WAV or raw PCM, has no speaker diarization, and takes no
  language detection — `language_code` just defaults to `en`, so German audio
  comes back as confident English gibberish. It also costs roughly twice the
  async rate. Checked 2026-08-15.

## 3. File the notes where they belong

There is no script for this. Where a transcript belongs, and what it should be
called once it gets there, is judgment — and it changes with every batch.

**Ask where the transcripts should go**, unless the request already said. One
question for the whole batch; a path is enough. Never assume a location and
never hardcode one.

Then look at that directory before you write into it. What is already there
tells you the convention in use: how notes are named, whether they are grouped
into folders and by what — person, project, date — what frontmatter the
neighbours carry, and whether notes link to one another. Follow that convention
rather than inventing one. If the destination is empty there is nothing to
follow: keep the staged filename, and say that you did.

For each recording:

1. Work out what it is and where it goes — from the filename, from what is
   already in the destination, and by asking when it stays unclear.
2. Move the note there and rename it to fit the convention. Dates disagree more
   often than you would expect: a hand-typed folder or note name against a
   machine-stamped recording filename. Prefer the machine's, and say which you
   used.
3. Make the note match its new home — change the `#` heading to the new
   filename, and add whatever frontmatter the neighbouring notes carry that only
   a person can fill in.
4. Link it the way the destination links things. If notes there reference each
   other, add the reference; if nothing links, do not start.

Rules. The line is reversibility, not caution:

- **Filing is reversible, so file it.** Moving and renaming a note you just
  created undoes in one command. Do it, then report where each one went — a
  wrong guess is then cheap to correct, and asking first costs a round trip on
  every batch.
- **Never overwrite an existing transcript.** Check the target name is free
  before you move anything. Transcripts get corrected by hand, nothing else
  holds those corrections, and a transcript is cheap to remake while a
  correction is not. This one is worth stopping for.
- **Append to hand-written notes, never rewrite them.** Adding a link is safe;
  reformatting, reordering or tidying what someone wrote is not. Check whether
  *that link* is already present, not whether the section is — a recording that
  already has three transcripts listed still needs the fourth added.
- **Stop and ask when you cannot tell what a recording is.** A misfiled note is
  fixable. A guessed name gets written into the note and stays there.
- **Treat the content as confidential.** Recordings carry names, employers and
  offhand remarks nobody meant to publish. Notes go where the user said, and
  nowhere else — not into a repository, an issue, or a commit message.

## 4. Write down what it gets wrong

No script can do this. Machine transcription is wrong in ways that matter, and a
reader who does not know that will trust it too much.

For each transcript, check the frontmatter's `language` and `speakers` against
reality, then record what you find as a `> [!warning]` callout directly under the
`> [!info]` block the script wrote. Write it in the language of the note's
surroundings.

What has actually gone wrong before, as examples of the classes to look for:

- **Domain vocabulary gets mangled.** "EU AI Act" has come back as "EU AI Egg"
  and "EU Act". Anything the transcript could not have known — product names,
  jargon, people's names — is where to look first.
- **A bad connection inflates the speaker count.** Dropouts made AssemblyAI split
  two or three people across five labels. If the count looks too high, say so and
  name which labels are probably the same person.
- **Not every recording is what it claims to be.** One was a 35-second aborted
  session. Label it rather than leaving a reader to work out why it is empty.

Report the detected language and speaker count back to the user for each
recording. That is where a wrong language or broken diarization becomes visible.
