# transcribe

A Claude Code plugin that turns recordings into readable, speaker-labelled markdown notes with AssemblyAI. The spoken language is detected rather than assumed, and the notes are filed wherever you keep them.

## Why

The two obvious shortcuts in machine transcription both fail quietly. Hardcode a language and the wrong one returns fluent nonsense instead of an error. Leave the model unpinned and an older account silently gets a weaker one — the same recording that produced "Der EU AI Act" came back as "Dear aua". Both outputs read fine and are wrong, which is worse than a failure, because nothing downstream flags them.

So the script never sends a language, pins the model with no fallback, and records what actually ran. What it cannot know it leaves out rather than guessing.

## Usage

- Claude Code and Codex: `/transcribe`
- Pi: `/skill:transcribe`

Or just hand over audio or video and ask for the words out of it. The request can be in any language; what was recorded almost certainly is.

Four steps, of which one is a script:

1. **Collect the audio** into a working directory. Audio goes in as it is; video gets its track extracted first, which is far quicker than uploading gigabytes to send the same sound.
2. **Transcribe.** One finished note per recording — frontmatter with language, confidence, speaker labels, duration, word count, model, transcript id, then speaker turns with timestamps.
3. **File the notes.** No script. The agent asks where they should go and reads the naming convention off whatever is already there; no path is hardcoded.
4. **Write down what it got wrong.** Also no script. Domain vocabulary gets mangled, a bad connection inflates the speaker count, and not every recording is what it claims to be.

A second run is free. The script keeps a ledger of what it has already paid for, so re-running after the notes have been filed away skips them instead of buying the batch again.

## Requirements

- An AssemblyAI key in `~/.config/assemblyai/api_key` (`chmod 600`) or `$ASSEMBLYAI_API_KEY`. Get one at [assemblyai.com](https://www.assemblyai.com/app/account). Transcription is billed per hour of audio.
- `python3`, and `ffmpeg`/`ffprobe` to pull audio out of video.

## Privacy

Recordings carry names, employers, and offhand remarks nobody meant to publish. The notes go where the user said and nowhere else — the skill is explicit that they do not belong in a repository, an issue, or a commit message.

## Installation

See the repository's [Claude Code, Codex, and Pi instructions](../../README.md).

## License

MIT
