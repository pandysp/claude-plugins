# draw-out-context

A workflow plugin that helps the agent understand the context you have not
articulated: your rationale, assumptions, causal model, stakes, priorities, and
the problem behind the stated problem.

## Why

A concrete request can still leave its rationale unstated. An agent can fill
that blank with a plausible story and produce polished work on the wrong
premise. This plugin treats missing user-owned context as something to ask
about, not permission to invent it.

## What it does

The agent reads what is already available, identifies only the missing context
that could change later work, and asks a small number of answer-dependent
questions. It then reflects a compact context brief for correction or
confirmation.

It draws out context you already hold. It does not polish a ramble, help you
discover a position, resolve open choices, inspect external material, or begin
the downstream task.

## Usage

- Claude Code: `/draw-out-context`
- Codex: `$draw-out-context`
- Pi: `/skill:draw-out-context`

Or ask naturally: “draw out the thinking behind this”, “understand where I'm
coming from”, “ask me what I haven't said”, or “get the why before you solve
this”.

## Installation

See the repository's [Claude Code, Codex, and Pi installation
instructions](../../README.md).

## License

MIT
