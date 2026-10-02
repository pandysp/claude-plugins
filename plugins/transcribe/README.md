# transcribe

Turns recordings into speaker-labelled markdown notes with AssemblyAI. The spoken language is detected rather than assumed, and the notes are filed wherever you keep them.

## Why

Machine transcription fails quietly. If the language is guessed wrong, the result is fluent nonsense rather than an error. A weaker model returns text that reads fine and is wrong: one recording's "Der EU AI Act" came back as "Dear aua". So the script lets AssemblyAI detect the language, always uses the same strong model and never falls back to a weaker one, and writes down which model actually ran. The agent then reads the notes and marks what looks wrong.

Transcription is paid per hour of audio, so the script protects work that has been paid for. It saves each job the moment AssemblyAI accepts it, continues an interrupted job instead of paying again, and skips recordings that are done. If the connection breaks while a recording is being submitted, it can't know whether the job was accepted, so it stops and asks you to check rather than paying again. It never overwrites a note, because hand corrections exist only there.

## Usage

- Claude Code: `/transcribe`
- Codex: `$transcribe`
- Pi: `/skill:transcribe`

Or hand over audio or video and ask for the words out of it. The agent collects the audio (pulling it out of a video if needed), runs the script, puts the notes where you say, and marks where the transcript is probably wrong.

## Requirements

- An AssemblyAI API key, from [assemblyai.com](https://www.assemblyai.com/app/account), in one of: `$ASSEMBLYAI_API_KEY`, `~/.config/assemblyai/api_key` (`chmod 600`), or the macOS keychain (`security add-generic-password -s assemblyai -a "$USER" -w <key>`).
- `python3` (standard library only), and `ffmpeg` to extract audio from video.

## Privacy

Recordings carry names, employers and remarks nobody meant to publish.

- Audio goes to AssemblyAI's servers **in the EU** by default (`--region us` to change it). AssemblyAI's [data retention documentation](https://www.assemblyai.com/docs/data-retention-and-model-training) says it doesn't use EU recordings to train its models.
- Once the result is saved on your machine, the transcript is **deleted at AssemblyAI** (`--keep-remote` to keep it). A deletion that fails is retried on every later run. The full result, including the timing of every word, stays in the `.transcribe/` folder inside the working folder.
- Notes go where you say and nowhere else, never into a repository, issue or commit message.

## Development

```bash
python3 -m unittest discover -s plugins/transcribe/test
```

The tests run offline against a fake AssemblyAI client.

## Installation

See the repository's [installation instructions](../../README.md).

## License

MIT
