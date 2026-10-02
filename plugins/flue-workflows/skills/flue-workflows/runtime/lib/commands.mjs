import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { readFile } from 'node:fs/promises';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const exec = promisify(execFile);
// A recorded leader whose start differs from its spawn record by more than this
// is a different process that reused the pid.
const SAME_PROCESS_MS = 10_000;

// Flue runs worker shell commands as detached process groups. A controller that
// dies abruptly cannot stop them, so their pids are journaled at spawn and a
// later attempt refuses to start while one of those groups is still alive.
// This relies on Flue's local sandbox spawning `[shell, '-c', command]` with
// `detached: true` (@flue/runtime 2.2.2 `execShell`); commands.test.mjs fails
// if that changes.
//
// Flue stops escalating to SIGKILL once a command's shell exits, so a child that
// ignores SIGTERM (after a timeout or abort) could keep editing files. Whatever is
// left in a group when its shell exits has outlived its command and is killed.
// A failed kill in that exit listener goes to `onKillFailure` instead of crashing the owner.
export function recordCommands(onSpawn, onKillFailure) {
  const live = new Set();
  const observer = ({ process: child }) => child.once('spawn', () => {
    if (child.spawnargs[1] !== '-c') return;
    live.add(child.pid);
    onSpawn(child.pid);
    child.once('exit', () => {
      live.delete(child.pid);
      try { killGroup(child.pid); } catch (error) { onKillFailure(error); }
    });
  });
  subscribe('child_process', observer);
  return {
    stop: () => unsubscribe('child_process', observer),
    // Synchronous, so an owner can kill its commands and exit before a worker starts another.
    killLive: () => { for (const pid of live) killGroup(pid); },
  };
}

export function killGroup(pid) {
  try { process.kill(-pid, 'SIGKILL'); }
  catch (error) {
    if (error.code === 'ESRCH') return;
    // macOS answers EPERM, not ESRCH, for a group whose members have all exited but
    // are not yet reaped. Such a group has nothing left to stop.
    if (error.code === 'EPERM' && !liveGroups(processes(execFileSync('ps', PS_ARGS, PS_OPTIONS))).has(pid)) return;
    throw error;
  }
}

const PS_ARGS = ['-axo', 'pid=,pgid=,etime=,stat='];
const PS_OPTIONS = { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 };

function processes(stdout) {
  return stdout.trim().split('\n').map(line => {
    const [pid, pgid, etime, stat] = line.trim().split(/\s+/);
    return { pid: Number(pid), pgid: Number(pgid), etime, zombie: stat.startsWith('Z') };
  });
}

// A group is live while it has a member that has not exited; zombies only await reaping.
const liveGroups = rows => new Set(rows.filter(row => !row.zombie).map(row => row.pgid));

// `ps` elapsed time, `[[dd-]hh:]mm:ss`, identical on macOS and Linux.
function elapsedMs(text) {
  const [days, clock] = text.includes('-') ? text.split('-') : ['0', text];
  const seconds = clock.split(':').map(Number).reduce((total, part) => total * 60 + part, 0);
  return (Number(days) * 86_400 + seconds) * 1000;
}

export async function liveCommandGroups(dir) {
  let text;
  try { text = await readFile(join(dir, 'events.jsonl'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const spawned = new Map(text.split('\n').filter(Boolean).map(line => JSON.parse(line))
    .filter(row => row.type === 'command').map(row => [row.pid, Date.parse(row.at)]));
  if (!spawned.size) return [];
  const now = Date.now();
  const rows = processes((await exec('ps', PS_ARGS, PS_OPTIONS)).stdout);
  const groups = liveGroups(rows);
  const started = new Map(rows.map(row => [row.pid, now - elapsedMs(row.etime)]));
  // A live group counts unless its leader is a newer process that reused the pid.
  // A group whose leader already exited has no start time to compare; it is reported,
  // erring towards refusing a resume over running beside a leftover command.
  return [...spawned].filter(([pid, at]) => groups.has(pid) && (!started.has(pid) || Math.abs(started.get(pid) - at) <= SAME_PROCESS_MS)).map(([pid]) => pid);
}
