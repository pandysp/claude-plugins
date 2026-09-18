import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { load, ownerActive } from '../lib/files.mjs';

const runtime = fileURLToPath(new URL('..', import.meta.url));
const child = fileURLToPath(new URL('./fixtures/native-worker-child.mjs', import.meta.url));
const schema = { type: 'object', properties: { answer: { type: 'integer' } }, required: ['answer'], additionalProperties: false };

async function fixture(t, { factory = false, mode = 'promise', cleanupFailure = '', executable = process.execPath } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'flue-extension-'));
  const source = join(root, 'source'), workspace = join(root, 'workspace');
  const dir = join(workspace, 'runs', 'fixture'), trace = join(root, 'trace.jsonl');
  const release = join(root, 'release');
  await mkdir(source); await mkdir(join(root, 'home'));
  await writeFile(trace, '');
  const helpers = `import { setTimeout } from 'node:timers/promises';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const record = value => appendFileSync(process.env.FLUE_EXTENSION_TRACE, JSON.stringify(value)+'\\n');
class WrappedPromise extends Promise {
  constructor(source) {
    if (!source || typeof source.then !== 'function') throw new TypeError('WrappedPromise requires a source promise');
    super((resolve, reject) => source.then(resolve, reject));
    this.source = source;
  }
  then(resolve, reject) { return this.source.then(resolve, reject); }
}
function effect(task) {
  const dir = process.env.FLUE_EXTENSION_RUN;
  const db = new DatabaseSync(join(dir, 'owner.sqlite'));
  let active = false;
  try { db.exec('BEGIN EXCLUSIVE'); db.exec('ROLLBACK'); }
  catch (error) { if (![5, 6].includes(error.errcode)) throw error; active = true; }
  finally { db.close(); }
  const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
  writeFileSync(join(task.cwd, 'extension-effect.txt'), 'retained extension work\\n');
  record({event:'extension-effect', ownerActive:active, cleanShutdown:state.cleanShutdown});
}
async function delayed(task) {
  record({event:'extension-entered'});
  ${mode === 'never' ? 'await new Promise(() => {});' : mode === 'gated' ? 'while (!existsSync(process.env.FLUE_EXTENSION_RELEASE)) await setTimeout(20); effect(task);' : 'await setTimeout(500); effect(task);'}
  ${mode === 'late-reject' ? "throw new Error('fixture-extension-rejection');" : ''}
}
`;
  const result = factory ? `{name:'late',label:'late',description:'Fixture tool',parameters:{type:'object',properties:{}},execute:async()=>({content:[{type:'text',text:'unused'}],details:{}})}` : 'undefined';
  let body;
  if (mode === 'sync') body = `effect(task); return ${result};`;
  else if (['declared', 'async-generator'].includes(mode)) body = `await delayed(task); return ${result};`;
  else if (mode === 'immediate-reject') body = "record({event:'extension-entered'}); return Promise.reject(new Error('fixture-immediate-extension-rejection'));";
  else if (mode === 'unreadable') body = "return {get then(){throw new Error('fixture-unreadable-completion');}};";
  else if (mode === 'value') body = 'return 42;';
  else {
    body = `const pending = delayed(task).then(()=>(${result}));`;
    if (mode === 'thenable') body += `const completion = {get then(){record({event:'then-get'});return function(resolve,reject){record({event:'then-call',receiverCorrect:this===completion});return pending.then(resolve,reject);};}}; return completion;`;
    else if (mode === 'wrapped') body += 'return new WrappedPromise(pending);';
    else if (mode === 'native-overridden') body += `Object.defineProperty(pending,'then',{get(){record({event:'native-then-get'});throw new Error('fixture-native-then-override');}});return pending;`;
    else body += 'return pending;';
  }
  const callback = `${['declared', 'async-generator'].includes(mode) ? 'async ' : ''}function${['generator', 'async-generator'].includes(mode) ? '*' : ''} callback(${factory ? 'sandbox,{task}' : 'task'}){${body}}`;
  await writeFile(join(source, factory ? 'tools.mjs' : 'worker.mjs'), helpers + callback + (factory ? '\nexport default {late:callback};' : '\nexport default callback;'));
  const program = join(source, 'program.mjs');
  await writeFile(program, `export default async run => await run.agent('Checked answer.', {key:'extension',tools:${JSON.stringify(factory ? ['late'] : [])},schema:${JSON.stringify(schema)}});`);
  const env = Object.fromEntries(['PATH', 'TMPDIR', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { HOME: join(root, 'home'), FLUE_EXTENSION_RUN: dir, FLUE_EXTENSION_TRACE: trace, FLUE_EXTENSION_RELEASE: release, FLUE_EXTENSION_CLEANUP_FAILURE: cleanupFailure });
  const processChild = spawn(executable, [child, workspace, 'run', program, trace], { env, signal: t.signal, killSignal: 'SIGKILL' });
  let stdout = '', stderr = '';
  processChild.stdout.on('data', data => { stdout += data; });
  processChild.stderr.on('data', data => { stderr += data; });
  let spawnError;
  processChild.once('error', error => { spawnError = error; });
  const done = new Promise(resolve => {
    processChild.once('close', (code, signal) => resolve({ error: spawnError, code, signal, stdout, stderr }));
  });
  t.after(async () => {
    if (processChild.exitCode === null && processChild.signalCode === null) processChild.kill('SIGKILL'); // This fixture's child only.
    await done;
    let manifest;
    try { manifest = await load(join(dir, 'manifest.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (manifest) {
      assert.equal(dirname(manifest.program), join(runtime, 'programs'));
      await rm(manifest.program, { recursive: true });
    }
    await rm(root, { recursive: true, force: true });
  });
  const events = async () => {
    if (spawnError) throw spawnError;
    const text = await readFile(trace, 'utf8');
    if (spawnError) throw spawnError;
    return text.trim().split('\n').filter(Boolean).map(JSON.parse);
  };
  async function entered() {
    const deadline = Date.now() + 5000;
    while (!(await events()).some(row => row.event === 'extension-entered')) {
      if (processChild.exitCode !== null || processChild.signalCode !== null) throw new Error('Fixture exited before extension entry.', { cause: await done });
      if (Date.now() >= deadline) throw new Error(`Fixture did not enter the extension: ${stderr}`);
      await setTimeout(20);
    }
  }
  async function finished() {
    const result = await done;
    if (result.error) throw result.error;
    assert.equal(result.signal, null, JSON.stringify(result));
    const rows = await events(), ends = rows.filter(row => row.event === 'finished');
    assert.equal(ends.length, 1, JSON.stringify({ result, rows }));
    assert.equal(ends[0].fetchCalls, 0);
    return { ...result, events: rows, end: ends[0], state: await load(join(dir, 'state.json')) };
  }
  return { dir, processChild, events, entered, finished, release: () => writeFile(release, 'settle the fixture\n') };
}

function failed(result) {
  assert.equal(result.code, 1, JSON.stringify(result));
  assert.equal(result.state.status, 'failed');
  assert.equal(result.state.cleanShutdown, false);
  assert.equal(result.end.modelCalls, 0);
  assert.equal(result.events.at(-1).event, 'finished');
}

function ownedUntilSettlement(result) {
  const effects = result.events.filter(row => row.event === 'extension-effect');
  assert.ok(effects.length, JSON.stringify(result));
  assert.ok(effects.every(row => row.ownerActive && !row.cleanShutdown), JSON.stringify(result));
  const sequence = result.events.map(row => row.event);
  assert.ok(sequence.lastIndexOf('extension-effect') < sequence.indexOf('native-stop'), JSON.stringify(sequence));
  assert.ok(sequence.indexOf('native-stop') < sequence.indexOf('sdk-cleanup'));
  failed(result);
}

for (const factory of [false, true]) {
  for (const mode of ['declared', 'generator', 'async-generator']) {
    test(`invalid ${mode} extension is rejected before native startup (factory: ${factory})`, { timeout: 30_000 }, async t => {
      const f = await fixture(t, { factory, mode });
      const result = await f.finished();
      assert.equal(result.events.some(row => row.event === 'native-start'), false, JSON.stringify(result));
      failed(result);
      assert.match(result.state.error, factory ? /tools\.mjs|factory/i : /worker\.mjs|hook/i);
      assert.equal(result.events.some(row => row.event === 'extension-entered'), false);
    });
  }
  for (const mode of ['promise', 'immediate-reject', 'late-reject', 'thenable', 'native-overridden', 'gated']) {
    test(`unexpected ${mode} extension work stays owned (factory: ${factory})`, { timeout: 30_000 }, async t => {
      const f = await fixture(t, { factory, mode });
      let held;
      if (mode === 'gated') {
        await f.entered();
        await setTimeout(500);
        held = ownerActive(join(f.dir, 'owner.sqlite'));
        await f.release();
      }
      const result = await f.finished();
      if (mode === 'immediate-reject') {
        failed(result);
        assert.match(result.state.error, /fixture-immediate-extension-rejection/);
      } else ownedUntilSettlement(result);
      if (mode === 'late-reject') assert.match(result.state.error, /fixture-extension-rejection/);
      if (mode === 'thenable') {
        assert.equal(result.events.filter(row => row.event === 'then-get').length, 1);
        assert.deepEqual(result.events.filter(row => row.event === 'then-call'), [{ event: 'then-call', receiverCorrect: true }]);
      }
      if (mode === 'native-overridden') assert.equal(result.events.some(row => row.event === 'native-then-get'), false);
      if (mode === 'gated') assert.equal(held, true, 'Lease must stay held before external completion');
    });
  }
  for (const mode of ['value', 'unreadable']) {
    test(`invalid ${mode} completion fails the run (factory: ${factory})`, { timeout: 30_000 }, async t => {
      const f = await fixture(t, { factory, mode });
      const result = await f.finished();
      failed(result);
      assert.match(result.state.error, mode === 'unreadable' ? /fixture-unreadable-completion/ : /must.*return/i);
    });
  }
  test(`unobservable Promise subtype reports failure, not successful cleanup (factory: ${factory})`, { timeout: 30_000 }, async t => {
    const f = await fixture(t, { factory, mode: 'wrapped' });
    const result = await f.finished();
    assert.equal(result.code, 1, JSON.stringify(result));
    assert.equal(result.state.status, 'failed');
    assert.equal(result.state.cleanShutdown, false);
    assert.equal(result.end.modelCalls, 0);
    for (const diagnostic of [result.stderr, result.state.error]) {
      assert.match(diagnostic, /must return synchronously/);
      assert.match(diagnostic, /WrappedPromise requires a source promise/);
    }
    // The unsupported hook's background writes are not contained. No claim
    // that the lease remains held when completion observation itself failed.
  });
  for (const cleanupFailure of ['abort', 'read']) {
    test(`native ${cleanupFailure} failure cannot skip extension drain (factory: ${factory})`, { timeout: 30_000 }, async t => {
      const f = await fixture(t, { factory, cleanupFailure });
      const result = await f.finished();
      ownedUntilSettlement(result);
      assert.match(result.state.error, cleanupFailure === 'abort' ? /fixture-native-abort-error/ : /fixture-native-settlement-error/);
    });
  }
  test(`ordinary synchronous extension remains usable (factory: ${factory})`, { timeout: 30_000 }, async t => {
    const f = await fixture(t, { factory, mode: 'sync' });
    const result = await f.finished();
    assert.equal(result.code, 0, JSON.stringify(result));
    assert.equal(result.state.status, 'finished');
    assert.equal(result.state.cleanShutdown, true);
    assert.equal(result.end.modelCalls, 1);
    assert.ok(result.events.some(row => row.event === 'extension-effect' && row.ownerActive));
  });
  test(`never-settling extension work retains the owner (factory: ${factory})`, { timeout: 10_000 }, async t => {
    const f = await fixture(t, { factory, mode: 'never' });
    await f.entered();
    await setTimeout(500);
    assert.equal(ownerActive(join(f.dir, 'owner.sqlite')), true, 'Do not release ownership while extension work is unresolved');
    assert.equal(f.processChild.exitCode, null);
    assert.equal((await f.events()).some(row => row.event === 'finished'), false);
  });
}

test('extension fixture observation preserves the original spawn error', { timeout: 10_000 }, async t => {
  const executable = join(runtime, 'test', 'fixtures', 'missing-executable');
  const f = await fixture(t, { mode: 'never', executable });
  let cause;
  await assert.rejects(f.finished(), error => {
    cause = error;
    return error.code === 'ENOENT' && error.path === executable;
  });
  await assert.rejects(f.events(), error => error === cause);
  await assert.rejects(f.entered(), error => error === cause);
});
