---
name: transcribe
description: >
  Turns recordings into speaker-labelled markdown notes with AssemblyAI, with the
  spoken language detected rather than assumed. Use this skill when the user asks
  to "transcribe a recording", "transcribe this interview", "transcribe the
  meeting", "write up this call", "what was said in this recording", or hands over
  audio or video and wants the words out of it. The request may be in any
  language; so may the recording.
---

# Transcription

Machine transcripts look finished even when they are wrong, and each run costs
money. So the work has four steps: collect the audio, transcribe it with the
script, put the notes where the user keeps them, and mark what the transcript
probably got wrong. The script does step 2. Steps 3 and 4 need judgment, so
there is no script for them.

## 1. Collect the audio

Pick a working folder with room, separate from where the notes will end up.
Below it is called `<base>`. Put the audio in `<base>/audio/`. Audio files go in
as they are. For a video, extract its sound first; that is much quicker than
uploading the whole video:

```bash
mkdir -p "<base>/audio"
ffmpeg -n -i "<recording>.mp4" -vn -acodec copy "<base>/audio/<recording>.m4a"
```

- Keep the recording's filename, without its extension. It ties the note back
  to the recording.
- `-n` stops ffmpeg from overwriting a file that already exists. If it stops,
  pick another name.
- If ffmpeg says "could not find tag for codec", the sound is in a format the
  `.m4a` file can't hold as it is. Convert it instead: replace `-acodec copy`
  with `-c:a aac -b:a 128k`.

## 2. Transcribe

```bash
python3 "<skill-dir>/scripts/transcribe.py" --base-dir "<base>"
```

- `<skill-dir>` is the folder this file was loaded from. Write the script's
  path out in full and run it from the user's folder, because `--base-dir` is
  read relative to where you are.
- The script writes one note per recording to `<base>/transcripts/<name>.md`
  (`--out-dir` changes that). If that name is taken, it writes
  `<name>.<transcript id>.md` instead; it never overwrites a note. The header
  block at the top of the note (frontmatter) lists the language, the speakers,
  the length and the model.
- Keep `<base>` after the run. Its `.transcribe/` folder records what has been
  paid for, so running the script again is safe: finished recordings are
  skipped and an interrupted job continues instead of being paid for twice.
- One case needs the user: if the connection broke right after a recording was
  submitted, the script can't know whether AssemblyAI got it, so it stops for
  that recording. Ask the user to check the transcripts in their AssemblyAI
  dashboard. Only if it isn't there, run again with `--retranscribe`.
- Recordings are sent to AssemblyAI's servers in the EU and deleted there once
  the result is saved in `.transcribe/`. A deletion that fails is retried on
  every later run. Change that (`--region us`, `--keep-remote`) only if the
  user asks. A folder from an earlier version of this skill (with a
  `.transcribed` file) is skipped; those transcripts may still be stored on
  AssemblyAI's US servers.
- If the script exits with 1, some recordings failed or a deletion is still
  pending. Its output names them and says why; running it again picks up where
  it stopped. If it exits with 2, the run stopped (no API key, another run
  still busy, no audio found, a damaged state file); recordings finished before
  that are listed and kept. Pass the message on to the user.
- The settings the script sends to AssemblyAI are chosen on purpose. Read the
  comment above `REQUEST` in the script before changing any of them.

## 3. Put the notes where they belong

**Ask the user where the transcripts should go**, unless they already said. One
question for the whole batch. Never guess a location.

Look at that folder before writing into it, and do things the way it already
does them: how notes are named, how they are grouped into folders, what the
header blocks of neighbouring notes contain, whether notes link to each other.
If the folder is empty, keep the script's filename and say so.

For each note:

1. Work out what the recording is and where it belongs, from its filename and
   from what is already in the folder. Ask when it stays unclear.
2. Move and rename the note to fit. If the recording file's date and a date
   someone typed (in a folder or note name) disagree, keep both visible and ask
   which is right. A file's date can be when it was exported, not when the
   conversation happened.
3. Change the note's `#` heading to its new name, and add the header fields its
   neighbours have.
4. Link it the way the folder links things. If nothing there links, don't.

Rules:

- **Moving and renaming can be undone, so do it, then tell the user where each
  note went.** A wrong guess is cheap to fix.
- **Never overwrite an existing note.** People correct transcripts by hand, and
  the note is the only place those corrections exist. Check the new name is
  free before moving.
- **Add to notes someone wrote by hand; never rewrite them.** Adding a missing
  link is fine. Reformatting or reordering their text is not.
- **Stop and ask when you can't tell what a recording is.**
- **Treat the content as confidential.** Notes go where the user said and
  nowhere else: not into a repository, an issue or a commit message.

## 4. Mark what it probably got wrong

Transcripts are wrong in ways a reader won't notice: names and technical terms
come out as similar-sounding words, and a bad connection can make one person
look like several. Read each note. Where you find a likely error, add a warning
box under the `> [!info]` box the script wrote, written as `> [!warning]`
(Obsidian's syntax), in the language of the notes around it.

Only write what the transcript itself shows, quoted with its timestamp. For
example: "[00:12:40] 'EU AI Egg' is probably 'EU AI Act'." Don't guess beyond
the text. The speaker letters (A, B, ...) are labels the machine gave to
voices, not identified people. If there seem to be too many speakers, say which
letters look like the same voice and why, as a suspicion, not a fact. Also
worth a warning: a recording that is much shorter or emptier than its name
suggests.

Then tell the user, for each recording, the detected language, the speaker
letters and any warnings. That is where a wrong language or a broken speaker
split shows up.
