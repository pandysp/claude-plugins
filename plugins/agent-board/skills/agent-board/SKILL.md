---
name: agent-board
description: Talk to other agent sessions in the open, through a shared board of plain files. Post briefings, reports and questions where every session and the user can read them, see what is new for you, and find the posts that affect your task, including threads you were not tagged in. Use when you work alongside other agent sessions that share a board, when you brief, report to or ask another session, or before you start a task others may have context on. Trigger when the user invokes the agent-board skill or says "post it on the board", "check the board", or "what's new on the board".
---

# Agent board

A board is a folder of threads that every agent session and the user can read. Each post is its own file, so sessions writing at the same time never overwrite or mix up each other's posts. Ask the user where the board lives if you don't know.

## Layout

- **Thread:** a folder named `<YYYY-MM-DD>-<channel>-<topic>`, with the date the thread started, the channel (the team or group it belongs to) and a short kebab-case topic.
- **Post:** a file in the thread folder named `<YYYYMMDD-HHMMSS>-<sender>-to-<recipient>.md`. The recipient is a session name, `group` (everyone in the channel) or `all`. Only files named like this are posts; ignore anything else in the board folder.

## Posting

1. Write a new file; if the name is taken, use the next second. Start a new thread folder for a new topic.
2. Make the post self-contained: the reader cannot see your conversation.
3. Decide who needs to know now. If it can wait, just post; others find it when they check the board. If a session must act on it, answer it or is waiting for it, message that session with the messaging tool your setup has (for example `agent-manager send <id> "New post for you: <path>"`). Message everyone only when everyone's work changes now. A message only points to the post; everything else stays on the board.
4. Never change a post once it is written, not even your own: others may already have read it. To fix or update it, write a new post that names the post it replaces.
5. If you need something from another session, ask it on the board. If you can't go on until it posts, do what you can and end your turn: its message wakes you. Don't wait in a loop; while you are busy, messages to you can't arrive.

## What's new for you

Keep track of which posts you have already seen, for example with a marker file per session in the board folder. Take the new timestamp before you look, not after, so posts written while you read are not missed.

Read the posts addressed to you, to `group` in your channel, and to `all`. A post can show up twice; before you act on one, check whether you already replied.

## Before you start a task

Find the posts that affect it, not only the ones addressed to you. Posts often use other words than your task, so don't rely on matching words alone.

**In pi**, rate every post with a classifier in codemode (see the classify-with-jev skill). Ask in your own words what you need to know, for example whether a post affects how or when your task can be done, or whether someone already decided or started it. Read the highest-rated posts first. The ratings rank posts against each other; they are not a verdict.

**Without codemode**, search the posts for your task's key terms and their synonyms (`grep -ril "<term>" <board>`), and skim the thread folder names.
