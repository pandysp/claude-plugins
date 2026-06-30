# clarify

A Claude Code plugin that enforces an "exhaust questions before designing" discipline. After understanding what's being asked and what terrain it's working in, the agent surfaces the remaining synthesis questions and gets your input before locking in a design.

## Why

The most expensive design failures aren't bad options. They're options committed to around a hidden assumption. By the time you see a draft, the silent commitment is baked in. Catching ambiguities up front (with specific questions and defaults you can wave through) is much cheaper than reverse-engineering them after.

## Usage

```
/clarify
```

Or just describe what you're about to design. The skill fires automatically before substantive design or planning steps. Works for any structured problem space: code, writing, strategy, planning.

## Installation

```bash
/plugin marketplace add pandysp/claude-plugins
/plugin install clarify@pandysp
```

## License

MIT
