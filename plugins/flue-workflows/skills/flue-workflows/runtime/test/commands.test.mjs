import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { local } from '@flue/runtime/node';
import { recordCommands, liveCommandGroups } from '../lib/commands.mjs';

test('shell commands run by Flue are recorded; git and other helpers are not', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flue-commands-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const pids = [];
  const recorder = recordCommands(pid => pids.push(pid));
  t.after(recorder.stop);
  const sandbox = await local({ cwd: dir }).createSandbox({ id: 'test' });
  const result = await sandbox.exec('echo $$');
  assert.equal(result.exitCode, 0);
  await new Promise((resolve, reject) => spawn('git', ['--version']).on('exit', resolve).on('error', reject));
  assert.deepEqual(pids, [Number(result.stdout.trim())]);
});

test('a recorded process group that is still alive is reported until it exits', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flue-commands-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
  t.after(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} });
  await new Promise(resolve => child.once('spawn', resolve));
  await writeFile(join(dir, 'events.jsonl'), JSON.stringify({ type: 'command', pid: child.pid, at: new Date().toISOString() }) + '\n' + JSON.stringify({ type: 'log' }) + '\n');
  assert.deepEqual(await liveCommandGroups(dir), [child.pid]);
  process.kill(-child.pid, 'SIGKILL');
  await new Promise(resolve => child.once('exit', resolve));
  assert.deepEqual(await liveCommandGroups(dir), []);
  assert.deepEqual(await liveCommandGroups(join(dir, 'missing')), []);
});

test('a recorded pid now used by an unrelated, newer process is not reported', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flue-commands-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
  t.after(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} });
  await new Promise(resolve => child.once('spawn', resolve));
  // Same pid, but journaled an hour before this process started: the pid was reused.
  await writeFile(join(dir, 'events.jsonl'), JSON.stringify({ type: 'command', pid: child.pid, at: new Date(Date.now() - 3_600_000).toISOString() }) + '\n');
  assert.deepEqual(await liveCommandGroups(dir), []);
});
