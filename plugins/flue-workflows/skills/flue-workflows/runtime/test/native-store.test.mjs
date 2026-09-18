import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sqlite } from '@flue/runtime/node';
import { load, save, hash, json } from '../lib/files.mjs';

const exec = promisify(execFile);
const child = fileURLToPath(new URL('./fixtures/native-worker-child.mjs', import.meta.url));
const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));

const resultSchema = { type: 'object', properties: { answer: { type: 'integer' } }, required: ['answer'], additionalProperties: false };

async function fixture(t, jobCount = 1, { body, hook, childProgram, concurrency = jobCount, response = 'structured', expectedResult = jobCount === 1 ? { answer: 42 } : [{ answer: 42 }, { answer: 42 }] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'flue-native-store-'));
  const workspace = join(root, 'workspace');
  const dir = join(workspace, 'runs', 'fixture');
  const program = join(root, 'source', 'program.mjs');
  const trace = join(root, 'trace.jsonl');
  const database = join(dir, 'flue.sqlite');
  let pinned;
  t.after(async () => {
    if (pinned) {
      assert.equal(dirname(pinned), join(runtimeRoot, 'programs'));
      await rm(pinned, { recursive: true });
    }
    await rm(root, { recursive: true });
  });
  await mkdir(dirname(program));
  if (hook) await writeFile(join(dirname(program), 'worker.mjs'), hook);
  if (childProgram) await writeFile(join(dirname(program), 'child.mjs'), childProgram);
  const call = key => `run.agent('Return the checked answer.', {
    key: ${JSON.stringify(key)}, tools: [],
    schema: ${JSON.stringify(resultSchema)},
  })`;
  await writeFile(program, `export default async run => {
    run.phase('fixture-program-entered');
    ${body ?? `return ${jobCount === 1 ? call('answer') : `run.parallel([() => ${call('answer-0')}, () => ${call('answer-1')}])`};`}
  };\n`);
  async function invoke(mode) {
    await writeFile(trace, '');
    let result;
    try { result = { ...await exec(process.execPath, [child, workspace, mode, program, trace], { env: { ...env, FLUE_NATIVE_FIXTURE_JOBS: String(jobCount), FLUE_NATIVE_FIXTURE_CONCURRENCY: String(concurrency), FLUE_NATIVE_FIXTURE_RESPONSE: response }, timeout: 20_000, killSignal: 'SIGKILL' }), code: 0 }; }
    catch (error) {
      if (typeof error.code !== 'number' || error.killed) throw error;
      result = { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
    const events = (await readFile(trace, 'utf8')).trim().split('\n').map(JSON.parse);
    const end = events.at(-1);
    assert.equal(end.event, 'finished', JSON.stringify(events));
    assert.equal(end.fetchCalls, 0);
    return { ...result, events, modelCalls: end.modelCalls };
  }
  const first = await invoke('run');
  pinned = (await load(join(dir, 'manifest.json'))).program;
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.modelCalls, jobCount);
  assert.deepEqual(await load(join(dir, 'result.json')), expectedResult);
  const state = await load(join(dir, 'state.json'));
  const job = Object.values(state.jobs)[0];
  assert.equal(job.status, 'completed');
  assert.ok(job.receipt.submissionId);
  async function forgetReceipt() {
    // Restore the controller sidecar's pre-receipt state, not the native store.
    job.status = 'pending'; job.receipt = null;
    await save(join(dir, 'state.json'), state);
  }
  async function removeDatabase() {
    for (const suffix of ['', '-wal', '-shm']) await rm(database + suffix, { force: true });
  }
  async function replaceDatabase() {
    await removeDatabase();
    const db = sqlite(database);
    try { await db.migrate(); }
    finally { await db.close(); }
  }
  return { dir, state, job, first, invoke, forgetReceipt, removeDatabase, replaceDatabase };
}

test('native worker records own their inputs after caller mutation', async t => {
  const f = await fixture(t, 1, { body: `
    const schema = ${JSON.stringify(resultSchema)}, tools = [], data = { stamp: 'original' };
    const result = await run.agent('Return the checked answer.', { key: 'answer', schema, tools, data });
    data.stamp = 'changed'; tools.push('write'); schema.required.push('changed');
    return result;
  ` });
  const sent = f.first.events.find(event => event.event === 'native-dispatch').input.initialData;
  assert.deepEqual(sent.data, { stamp: 'original' });
  assert.deepEqual(f.job.descriptor, sent, 'caller mutation must not rewrite the recorded native task');
  assert.equal(f.job.identity, hash(json(f.job.descriptor)));
});

for (const concurrency of [1, 2]) test(`worker inputs are captured at the call, even while queued (concurrency: ${concurrency})`, async t => {
  const f = await fixture(t, 2, { concurrency, body: `
    const first = run.agent('First answer.', { key: 'first', tools: [], schema: ${JSON.stringify(resultSchema)} });
    const data = { stamp: 'original' }, tools = [], schema = ${JSON.stringify(resultSchema)};
    const second = run.agent('Second answer.', { key: 'second', data, tools, schema });
    data.stamp = 'changed'; tools.push('write'); schema.description = 'changed';
    return Promise.all([first, second]);
  ` });
  const job = Object.values(f.state.jobs).find(job => job.key === 'second');
  assert.deepEqual(job.descriptor.data, { stamp: 'original' });
  assert.deepEqual(job.descriptor.tools, []);
  assert.deepEqual(job.descriptor.schema, resultSchema);
  const sent = f.first.events.find(event => event.event === 'native-dispatch' && event.input.message === 'Second answer.');
  assert.deepEqual(sent.input.initialData, job.descriptor);
});

test('native worker records own their results after caller transformation', async t => {
  const f = await fixture(t, 1, { expectedResult: { answer: 43 }, body: `
    const result = await run.agent('Return the checked answer.', { key: 'answer', tools: [], schema: ${JSON.stringify(resultSchema)} });
    result.answer = 43;
    return result;
  ` });
  assert.deepEqual(f.job.result, { answer: 42 }, 'workflow transformation must not rewrite the native worker result');
  const resumed = await f.invoke('resume');
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.modelCalls, 0);
  const job = (await load(join(f.dir, 'state.json'))).jobs[f.job.id];
  assert.deepEqual(job.result, { answer: 42 });
  assert.deepEqual(await load(join(f.dir, 'result.json')), { answer: 43 });
});

test('native hook mutation cannot rewrite the controller task', async t => {
  const f = await fixture(t, 1, {
    hook: "export default task => { task.data.stamp = 'native-hook'; };\n",
    body: `return await run.agent('Return the checked answer.', { key: 'answer', tools: [], schema: ${JSON.stringify(resultSchema)}, data: { stamp: 'original' } });`,
  });
  const sent = f.first.events.find(event => event.event === 'native-dispatch').input.initialData;
  assert.deepEqual(sent.data, { stamp: 'original' });
  assert.deepEqual(f.job.descriptor.data, { stamp: 'original' });
  assert.equal(f.job.identity, hash(json(f.job.descriptor)));
});

test('native receiptless recovery dispatch does not lend saved inputs', async t => {
  const f = await fixture(t, 1, {
    body: `return await run.agent('Return the checked answer.', { key: 'answer', tools: [], schema: ${JSON.stringify(resultSchema)}, data: { stamp: 'original' } });`,
  });
  await f.forgetReceipt();
  const result = await f.invoke('resume-mutate-dispatch');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.events.filter(event => event.event === 'dispatch-input-mutated').length, 2);
  const job = (await load(join(f.dir, 'state.json'))).jobs[f.job.id];
  assert.deepEqual(job.descriptor.data, { stamp: 'original' });
  assert.equal(job.identity, hash(json(job.descriptor)));
});

test('native reply mutations after capture do not change cached or returned data', async t => {
  const f = await fixture(t);
  const result = await f.invoke('resume-mutate-result');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.events.filter(event => event.event === 'native-reply-mutated').length, 1);
  const job = (await load(join(f.dir, 'state.json'))).jobs[f.job.id];
  assert.deepEqual(job.result, { answer: 42 });
  assert.deepEqual(await load(join(f.dir, 'result.json')), { answer: 42 });
});

test('a caught child failure is visible without forcing the parent to fail', async t => {
  const f = await fixture(t, 1, {
    childProgram: "export default () => { throw new Error('fixture-caught-child-failure'); };",
    body: `try { await run.workflow('child.mjs'); }
      catch (error) { if (error.message !== 'fixture-caught-child-failure') throw error; }
      return run.agent('Continue with the checked answer.', { key: 'answer', tools: [], schema: ${JSON.stringify(resultSchema)} });`,
  });
  assert.equal(f.first.code, 0);
  assert.equal(f.state.status, 'finished');
  assert.equal(f.state.cleanShutdown, true);
  assert.equal(f.state.compositionErrors, 0);
  const logged = f.first.stderr.split('\n').filter(line => line.startsWith('{')).map(JSON.parse);
  const failure = logged.find(event => event.type === 'workflow-failed');
  assert.equal(failure?.name, 'child.mjs');
  assert.match(failure?.message ?? '', /fixture-caught-child-failure/);
  assert.match(await readFile(join(f.dir, 'events.jsonl'), 'utf8'), /fixture-caught-child-failure/);
});

test('native text worker results remain reusable strings', async t => {
  const f = await fixture(t, 1, { response: 'text', expectedResult: 'checked text', body: "return run.agent('Return checked text.', { key: 'text', tools: [] });" });
  assert.equal(f.job.result, 'checked text');
  const result = await f.invoke('resume');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.modelCalls, 0);
  assert.equal((await load(join(f.dir, 'state.json'))).jobs[f.job.id].result, 'checked text');
  assert.equal(await load(join(f.dir, 'result.json')), 'checked text');
});

test('native completed worker is reused without another model call', async t => {
  const f = await fixture(t);
  const result = await f.invoke('resume');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.modelCalls, 0);
  const job = Object.values((await load(join(f.dir, 'state.json'))).jobs)[0];
  assert.equal(job.receipt.submissionId, f.job.receipt.submissionId);
  assert.equal(job.receipt.uid, f.job.receipt.uid);
});

test('native accepted work survives loss of the controller receipt', async t => {
  const f = await fixture(t);
  const receipt = f.job.receipt;
  await f.forgetReceipt();
  const result = await f.invoke('resume');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.modelCalls, 0);
  const job = Object.values((await load(join(f.dir, 'state.json'))).jobs)[0];
  assert.equal(job.receipt.submissionId, receipt.submissionId);
  assert.equal(job.receipt.uid, receipt.uid);
});

for (const [mode, status, clean] of [['resume-cancel', 'cancelled', true], ['resume-cancel-after-read', 'cancelled', true], ['resume-load-cancel', 'cancelled', true], ['resume-read-abort', 'failed', false]]) test(`native recovery classifies ${mode} without repeating work`, async t => {
  const f = await fixture(t);
  f.job.status = 'pending';
  await save(join(f.dir, 'state.json'), f.state);
  const result = await f.invoke(mode);
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.modelCalls, 0);
  const state = await load(join(f.dir, 'state.json'));
  assert.equal(state.calls, 0);
  assert.equal(state.status, status, result.stderr);
  assert.equal(state.cleanShutdown, clean, result.stderr);
  assert.match(result.stderr, mode === 'resume-read-abort' ? /fixture-native-observation-abort/ : /Cancellation requested/);
  assert.doesNotMatch(result.stderr, /fixture-program-entered/, 'cancellation must not enter the authored program after the recovery barrier');
});

for (const mode of ['resume-store-cancel', 'resume-store-fatal']) test(`native startup stays stopped after ${mode}`, async t => {
  const f = await fixture(t);
  const result = await f.invoke(mode);
  assert.equal(result.code, 1, result.stderr);
  assert.ok(result.events.some(event => event.event === 'stop-at-store-lookup'));
  assert.equal(result.events.some(event => event.event === 'native-start'), false, 'Store inspection must not reopen startup after a stop');
  assert.equal(result.modelCalls, 0);
  assert.match(result.stderr, mode === 'resume-store-cancel' ? /Cancellation requested/ : /fixture-native-admission-controller-error/);
});

test('native recovery keeps mixed cancellation and observation failures unclean', async t => {
  const f = await fixture(t, 2);
  for (const job of Object.values(f.state.jobs)) job.status = 'pending';
  await save(join(f.dir, 'state.json'), f.state);
  const result = await f.invoke('resume-cancel-mixed');
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.modelCalls, 0);
  const state = await load(join(f.dir, 'state.json'));
  assert.equal(state.status, 'failed');
  assert.equal(state.cleanShutdown, false);
  assert.match(result.stderr, /Cancellation requested/);
  assert.match(result.stderr, /fixture-other-observer-failure/);
  assert.doesNotMatch(result.stderr, /fixture-program-entered/);
});

for (const mode of ['missing', 'replaced']) test(`resume refuses ${mode} native storage before start or repeat work`, async t => {
  const f = await fixture(t);
  if (mode === 'missing') await f.removeDatabase();
  else await f.replaceDatabase();
  const result = await f.invoke('resume');
  assert.equal(result.code, 1, JSON.stringify(result));
  assert.equal(result.modelCalls, 0, JSON.stringify(result.events));
  assert.equal(result.events.some(event => event.event === 'native-start'), false);
  assert.match(result.stderr, /native|storage|database|submission/i);
});

for (const mode of ['missing', 'replaced']) test(`receiptless recovery refuses ${mode} storage instead of repeating work`, async t => {
  const f = await fixture(t);
  await f.forgetReceipt();
  if (mode === 'missing') await f.removeDatabase();
  else await f.replaceDatabase();
  const result = await f.invoke('resume');
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.modelCalls, 0, JSON.stringify(result.events));
  assert.equal(result.events.filter(event => event.event === 'store-observed' && event.fresh).length, 0);
  assert.match(result.stderr, /Cannot confirm saved work|Native store is missing/);
  assert.match(result.stderr, /new run/);
  const state = await load(join(f.dir, 'state.json'));
  assert.equal(state.status, 'failed');
  assert.equal(state.cleanShutdown, false);
  assert.equal(state.jobs[f.job.id].status, 'pending', 'Unknown admission is not a terminal outcome');
});
