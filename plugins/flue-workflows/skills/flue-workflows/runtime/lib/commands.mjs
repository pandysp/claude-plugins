import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { join } from 'node:path';
import { RunError } from './primitives.mjs';

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
export function recordCommands(onSpawn) {
  const observer = ({ process: child }) => child.once('spawn', () => {
    if (child.spawnargs[1] === '-c') onSpawn(child.pid);
  });
  subscribe('child_process', observer);
  return () => unsubscribe('child_process', observer);
}

// `ps` elapsed time, `[[dd-]hh:]mm:ss`, identical on macOS and Linux.
function elapsedMs(text) {
  const [days, clock] = text.includes('-') ? text.split('-') : ['0', text];
  const seconds = clock.split(':').map(Number).reduce((total, part) => total * 60 + part, 0);
  return (Number(days) * 86_400 + seconds) * 1000;
}

// Recorded command groups that are still alive; only those of one attempt when given.
export async function liveCommandGroups(dir, attempt) {
  let text;
  try { text = await readFile(join(dir, 'events.jsonl'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const spawned = new Map(text.split('\n').filter(Boolean).map(line => JSON.parse(line))
    .filter(row => row.type === 'command' && (attempt === undefined || row.attempt === attempt)).map(row => [row.pid, Date.parse(row.at)]));
  if (!spawned.size) return [];
  const now = Date.now();
  const { stdout } = await exec('ps', ['-axo', 'pid=,pgid=,etime='], { maxBuffer: 8 * 1024 * 1024 });
  const groups = new Set(), started = new Map();
  for (const line of stdout.trim().split('\n')) {
    const [pid, pgid, etime] = line.trim().split(/\s+/);
    groups.add(Number(pgid));
    started.set(Number(pid), now - elapsedMs(etime));
  }
  // A live group counts unless its leader is a newer process that reused the pid.
  // A group whose leader already exited has no start time to compare; it is reported,
  // erring towards refusing a resume over running beside a leftover command.
  return [...spawned].filter(([pid, at]) => groups.has(pid) && (!started.has(pid) || Math.abs(started.get(pid) - at) <= SAME_PROCESS_MS)).map(([pid]) => pid);
}

// Kill whatever an attempt's commands left running. Flue stops escalating to SIGKILL
// once a command's shell has exited, so a child that ignores SIGTERM can outlive it.
export async function stopCommandGroups(dir, attempt) {
  const groups = await liveCommandGroups(dir, attempt);
  for (const pid of groups) {
    try { process.kill(-pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  for (let i = 0; i < 50 && groups.length; i++) {
    if (!(await liveCommandGroups(dir, attempt)).length) return groups;
    await sleep(100);
  }
  const left = await liveCommandGroups(dir, attempt);
  if (left.length) throw new RunError(`Worker commands are still running after SIGKILL (process groups ${left.join(', ')}).`);
  return groups;
}
