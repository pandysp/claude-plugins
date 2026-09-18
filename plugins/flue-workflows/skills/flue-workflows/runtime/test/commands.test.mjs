import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { local } from '@flue/runtime/node';
import { commandTracker, requireQuiescence } from '../lib/commands.mjs';
import { save } from '../lib/files.mjs';

test('track the native process without rewriting shell semantics; detect quiescence', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flue-commands-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tracker = commandTracker(join(dir, 'commands'));
  t.after(() => tracker.close());
  const sandbox = await local({ cwd: dir }).createSandbox({ id: 'test' });
  const tracked = tracker.wrap(sandbox, 'worker');
  const command = `printf '%s:%s' "$BASH_VERSION" "$SHLVL"`;
  assert.deepEqual(await tracked.exec(command), await sandbox.exec(command));
  const status = await requireQuiescence(join(dir, 'commands'));
  assert.equal(status.tracked, 1);
  assert.deepEqual(status.active, []);
  assert.deepEqual(status.unknown, []);
});

test('missing process identity fails closed, not a manual trust flag', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flue-commands-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await save(join(dir, 'unknown.json'), { id: 'unknown', worker: 'worker', pid: null, status: 'starting' });
  await assert.rejects(requireQuiescence(dir), /identity.*unknown|unknown.*identity/);
});
