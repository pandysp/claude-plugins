import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const skill = fileURLToPath(new URL('../skills/flue-workflows', import.meta.url));
const coding = join(skill, 'examples/coding');
const { default: program } = await import(pathToFileURL(join(coding, 'program.mjs')));
const { primitives } = await import(pathToFileURL(join(skill, 'runtime/lib/primitives.mjs')));
const exec = promisify(execFile);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'flue-example-input-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  await exec(process.execPath, [join(coding, 'create-fixture.mjs'), source]);
  const events = [];
  let workerCalls = 0;
  const run = {
    ...primitives({
      invoke: () => { workerCalls++; throw new Error('No worker/model is permitted in these example input tests'); },
      emit: event => events.push(event),
      child: () => { throw new Error('No child program expected'); },
      budget: {},
    }),
    signal: new AbortController().signal,
  };
  t.after(() => assert.equal(workerCalls, 0));
  return { source, run, events };
}

for (const args of [
  { include: ['external'], injectFailure: ['external'] },
  { include: ['identity', 'sum'], maxCases: 1, injectFailure: ['sum'] },
]) test(`coding example rejects unexecutable injection ${JSON.stringify(args)}`, async t => {
  const { source, run, events } = await fixture(t);
  await assert.rejects(program(run, { source, ...args }), /injectFailure must name runnable cases/);
  assert.deepEqual(events, [], 'invalid input must fail before pipeline entry');
});

test('coding example preserves runnable fault injection', async t => {
  const { source, run, events } = await fixture(t);
  const report = await program(run, { source, include: ['sum'], injectFailure: ['sum'] });
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.attempted, ['sum']);
  assert.deepEqual(report.failed.map(item => item.id), ['sum']);
  assert.deepEqual(report.omitted, []);
  assert.equal(events.filter(event => event.type === 'composition-failed').length, 1);
});

test('coding example preserves an already-correct case', async t => {
  const { source, run } = await fixture(t);
  const report = await program(run, { source, include: ['identity'] });
  assert.equal(report.status, 'complete');
  assert.deepEqual(report.completed, ['identity']);
  assert.equal(report.items[0].branch, 'unchanged');
  assert.equal(report.items[0].artifactKey, null);
});

test('coding example preserves explicit omission', async t => {
  const { source, run } = await fixture(t);
  const report = await program(run, { source, include: ['external'] });
  assert.deepEqual(report.attempted, []);
  assert.deepEqual(report.failed, []);
  assert.deepEqual(report.completed, []);
  assert.deepEqual(report.omitted.map(item => item.id), ['external']);
  assert.match(report.omitted[0].reason, /external access/);
});

test('coding example preserves explicitly empty coverage', async t => {
  const { source, run } = await fixture(t);
  const report = await program(run, { source, include: [] });
  assert.equal(report.status, 'complete');
  for (const key of ['selected', 'attempted', 'completed', 'failed', 'omitted', 'items']) assert.deepEqual(report[key], []);
  assert.deepEqual(report.outOfScope, report.discovered);
});
