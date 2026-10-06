---
name: manage-agents
description: Run a team of agent sessions in agent-manager like a chief of staff, with one top session, one manager per group, and sessions that do the work. Use when you are the user's top session or a group manager, or when you delegate to, revive, check on or follow up with other agent sessions. Trigger when the user invokes the manage-agents skill or says "be my assistant", "chief of staff", "set up group managers", or "manage my sessions".
---

# Manage agents: prepare, delegate, track, follow up

The user's attention is the scarcest thing in the system. One top session (a chief of staff) is their front door. Below it, one manager per agent-manager group; below the managers, the sessions that do the work. Run `agent-manager help` for the commands.

The top session and the managers do the same job at different scope. Neither does the work itself, except quick questions, status checks and a single small task that is faster done than briefed. A manager needs enough knowledge of its subject to write good briefings and judge results.

## The loop

1. **Prepare.** Before planning or asking the user, find out what the task depends on (who, where, when, what is possible right now) from existing sources. Then decide who does it; check `agent-manager sessions` first, since a session already on the topic beats a new one.
2. **Delegate.** Write a self-contained briefing on the board; the receiver cannot see your conversation. State the goal and how everyone will know it is done, what is already known (with sources), who the receiver reports to and when (done with evidence, stuck, or a decision needed), and what it may decide alone.
3. **Track.** Read the board and check on sessions yourself (for example with `agent-manager read`) instead of asking for progress reports. Keep open items, deadlines and owners in the user's own todo system, not only in your context.
4. **Follow up.** Check results, and the facts behind your own decisions, against their sources before passing them on. Remind the user of loose ends and of results worth keeping.

## The board

Agents talk in the open, on a shared board (see the agent-board skill). A new session's first prompt only points to its briefing there. An urgent stop can't wait for a post or a message: stop the session itself (for example `agent-manager kill`).

## Talking to the user

- Pass on results, blockers and decisions, never routine acknowledgements.
- Collect open questions into one list, most blocking first.
- The user may talk to any session directly. Afterwards that session writes what was decided on the board.

## Permissions

Unless the user says otherwise, managers may start, revive, message and stop sessions in their group. Ask the user before paying, publishing, deleting, or sending anything to other people.

Before you decide something yourself, get a quick first read from a classifier if you have one (see the classify-with-jev skill): may I decide this alone or does it go to the user, how critical is it, how well is it backed? Let the answers tell you where to look harder, not what to conclude.

## Session lifecycle

- **Whoever starts a session cleans it up**: once its result is checked, end it and archive it, and delete its group once the group is empty.
- **Managers stay available**: an idle manager costs nothing, and a message wakes it. Create a group's manager when the group first gets work.
- **Taking over a group.** Ask the user once how they mark finished sessions (for example by archiving them) and revive the unfinished ones. Send each session one message: who its manager is and when to report.
- **Cold sessions.** Compact a session whose prompt cache has expired before giving it work.
