import { AsyncLocalStorage } from 'node:async_hooks';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { json, load, hash } from './files.mjs';
import { RunError } from './primitives.mjs';

const exec = promisify(execFile);

// Observe Node's public ChildProcess lifecycle inside native local().exec().
// No command rewriting, replacement shell, or private Flue process APIs.
export function commandTracker(root, onFatal = () => {}, onRecord = () => {}) {
  if (process.platform === 'win32') throw new RunError('Tracked local recovery currently requires POSIX process groups (macOS/Linux).');
  mkdirSync(root, { recursive: true });
  const scope = new AsyncLocalStorage();
  const persist = record => {
    const path = join(root, `${record.id}.json`);
    const temp = `${path}.${randomUUID()}.tmp`;
    const fd = openSync(temp, 'wx', 0o600);
    try { writeFileSync(fd, json(record) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, path);
    const directory = openSync(root, 'r');
    try { fsyncSync(directory); } finally { closeSync(directory); }
  };
  const observer = ({ process: child }) => {
    const context = scope.getStore();
    if (!context) return;
    context.created++;
    if (context.created > 1) {
      context.error = new RunError('Native command spawned more than one direct process; this runtime no longer matches the tracked-exec contract.');
      onFatal(context.error);
      return;
    }
    const record = context.record;
    const recordEvent = () => {
      try { persist(record); }
      catch (cause) { context.error = new RunError('Cannot persist native process identity; stopping rather than losing command ownership.', { cause }); onFatal(context.error); }
    };
    child.once('spawn', () => { record.pid = child.pid; record.status = 'spawned'; recordEvent(); });
    child.once('error', () => {
      if (child.pid === undefined) { record.status = 'spawn-failed'; recordEvent(); }
    });
  };
  subscribe('child_process', observer);
  return {
    wrap(sandbox, worker) {
      return { ...sandbox, async exec(command, options) {
        options?.signal?.throwIfAborted();
        const record = { id: randomUUID(), worker, commandHash: hash(command), pid: null, status: 'starting' };
        const context = { record, created: 0, error: null };
        persist(record);
        onRecord(record);
        try {
          const result = await scope.run(context, () => sandbox.exec(command, options));
          if (context.error) throw context.error;
          if (!record.pid && record.status !== 'spawn-failed') throw new RunError('Native process identity was not observed. Run the capability check on a supported Node version; no untracked recovery is permitted.');
          record.status = record.pid ? 'returned' : 'spawn-failed';
          persist(record);
          return result;
        } catch (error) {
          if (!context.created && options?.signal?.aborted) { record.status = 'not-spawned'; persist(record); }
          if (error instanceof RunError) onFatal(error);
          throw error;
        }
      } };
    },
    close() { unsubscribe('child_process', observer); scope.disable(); },
  };
}

export async function commandStatus(root, worker) {
  let names;
  try { names = await readdir(root); }
  catch (error) { if (error.code === 'ENOENT') return { tracked: 0, active: [], unknown: [] }; throw error; }
  const records = await Promise.all(names.filter(name => name.endsWith('.json')).map(async name => {
    try { return await load(join(root, name)); }
    catch (cause) { throw new RunError(`Cannot read command ownership record ${join(root, name)}.`, { cause }); }
  }));
  const { stdout } = await exec('ps', ['-axo', 'pgid='], { maxBuffer: 8 * 1024 * 1024 });
  const groups = new Set(stdout.trim().split(/\s+/).map(Number));
  const active = [];
  const unknown = [];
  for (const record of records) {
    if (worker !== undefined && record.worker !== worker) continue;
    if (Number.isSafeInteger(record.pid) && record.pid > 0) {
      if (groups.has(record.pid)) active.push({ command: record.id, worker: record.worker, group: record.pid });
    } else if (!['not-spawned', 'spawn-failed'].includes(record.status)) unknown.push(record.id);
  }
  return { tracked: records.length, active, unknown };
}

export async function requireRunQuiescence(dir, worker) {
  const path = join(dir, 'events.jsonl');
  let rows;
  try { rows = (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
  catch (cause) { throw new RunError(`Cannot read command ownership journal ${path}.`, { cause }); }
  return requireQuiescence(join(dir, 'commands'), rows.filter(row => row.type === 'command-created').map(row => row.id), worker);
}

export async function requireQuiescence(root, expectedIds = [], worker) {
  for (const id of expectedIds) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new RunError('Invalid command identity in the ownership journal.');
    try { await load(join(root, `${id}.json`)); }
    catch (cause) { throw new RunError(`Command ownership record ${id} is missing or unreadable. Quiescence is not established; inspect retained records before resuming.`, { cause }); }
  }
  const status = await commandStatus(root, worker);
  if (status.unknown.length) throw new RunError(`Command process identity is unknown for ${status.unknown.join(', ')}. Inspect retained commands; do not resume while their effects are unknown.`);
  if (status.active.length) throw new RunError(`Old command groups are still present: ${status.active.map(item => item.group).join(', ')}. Inspect/stop those foreground commands, then resume this SAME run.`);
  return status;
}
