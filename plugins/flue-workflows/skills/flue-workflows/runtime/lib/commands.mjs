import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const exec = promisify(execFile);

// Flue runs worker shell commands as detached process groups. A controller that
// dies abruptly cannot stop them, so their pids are journaled at spawn and a
// later attempt refuses to start while one of those groups is still alive.
export function recordCommands(onSpawn) {
  const observer = ({ process: child }) => child.once('spawn', () => {
    if (child.spawnargs[1] === '-c') onSpawn(child.pid);
  });
  subscribe('child_process', observer);
  return () => unsubscribe('child_process', observer);
}

export async function liveCommandGroups(dir) {
  let text;
  try { text = await readFile(join(dir, 'events.jsonl'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const pids = new Set(text.split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.type === 'command').map(row => row.pid));
  if (!pids.size) return [];
  const { stdout } = await exec('ps', ['-axo', 'pgid='], { maxBuffer: 8 * 1024 * 1024 });
  const groups = new Set(stdout.trim().split(/\s+/).map(Number));
  return [...pids].filter(pid => groups.has(pid));
}
