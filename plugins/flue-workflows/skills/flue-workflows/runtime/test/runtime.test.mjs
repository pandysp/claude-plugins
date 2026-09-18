// End-to-end through the CLI with real Flue, SQLite and Git. Only the model is scripted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { load, save, hash, json, lease } from '../lib/files.mjs';

const exec = promisify(execFile);
const child = fileURLToPath(new URL('./fixtures/native-worker-child.mjs', import.meta.url));
const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
const baseEnv = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const schema = { type: 'object', properties: { answer: { type: 'integer' } }, required: ['answer'], additionalProperties: false };
const call = (key, extra = '') => `run.agent('Return the checked answer.', { key: ${JSON.stringify(key)}, tools: [], schema: ${JSON.stringify(schema)}${extra} })`;

async function fixture(t, { body = `return ${call('answer')};`, files = {}, env = {}, git = false, timeout = 30_000 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'flue-runtime-'));
  const workspace = join(root, 'workspace');
  const dir = join(workspace, 'runs', 'fixture');
  const program = join(root, 'source', 'program.mjs');
  const trace = join(root, 'trace.jsonl');
  const f = { root, dir, program, trace };
  t.after(async () => {
    const pinned = (await load(join(dir, 'manifest.json')).catch(() => null))?.program;
    if (pinned) { assert.equal(dirname(pinned), join(runtimeRoot, 'programs')); await rm(pinned, { recursive: true }); }
    await rm(root, { recursive: true });
  });
  await mkdir(dirname(program));
  await writeFile(program, `export default async run => { run.phase('entered'); ${body} };\n`);
  for (const [name, text] of Object.entries(files)) await writeFile(join(dirname(program), name), text);
  if (git) {
    for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'Fixture']]) {
      await exec('git', ['-C', dirname(program), ...args], { env: baseEnv });
    }
  }
  f.invoke = async (mode, extraEnv = {}) => {
    await writeFile(trace, '');
    let result;
    try { result = { ...await exec(process.execPath, [child, workspace, mode, program, trace], { env: { ...baseEnv, ...env, ...extraEnv }, timeout, killSignal: 'SIGKILL' }), code: 0 }; }
    catch (error) {
      if (typeof error.code !== 'number') throw error;
      result = { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
    const events = (await readFile(trace, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
    const end = events.at(-1);
    assert.equal(end.event, 'finished', result.stderr);
    assert.equal(end.fetchCalls, 0);
    return { ...result, events, modelCalls: end.modelCalls, state: await load(join(dir, 'state.json')), stderrEvents: result.stderr.split('\n').filter(line => line.startsWith('{')).map(JSON.parse) };
  };
  // Start the child and stop it (signal or kill) once the model call is blocked.
  f.interrupt = async (mode, signal) => {
    await writeFile(trace, '');
    const proc = spawn(process.execPath, [child, workspace, mode, program, trace], { env: { ...baseEnv, ...env, FLUE_FIXTURE_BLOCK: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', chunk => { stderr += chunk; });
    const exited = new Promise(resolve => proc.on('exit', (code, sig) => resolve({ code, sig })));
    for (let i = 0; i < 100 && !(await readFile(trace, 'utf8')).includes('model-blocked'); i++) await sleep(100);
    assert.match(await readFile(trace, 'utf8'), /model-blocked/, stderr);
    proc.kill(signal);
    return { ...await exited, stderr, state: await load(join(dir, 'state.json')) };
  };
  return f;
}

test('a structured worker result is validated, saved and returned', async t => {
  const f = await fixture(t);
  const first = await f.invoke('run');
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.modelCalls, 1);
  assert.equal(first.events.at(-1).syntaxChecks, 1, 'syntax is checked once, not again after copying or starting');
  assert.deepEqual(await load(join(f.dir, 'result.json')), { answer: 42 });
  const [job] = Object.values(first.state.jobs);
  assert.equal(job.status, 'completed');
  assert.ok(first.stderrEvents.find(event => event.type === 'worker-started').submissionId);
  assert.equal('receipt' in job, false);
  assert.equal(first.state.status, 'finished');
  assert.equal(first.state.owner, null);
});

test('worker inputs are captured at the call, even while queued; results are copies', async t => {
  const f = await fixture(t, { env: { FLUE_FIXTURE_CONCURRENCY: '1' }, body: `
    const first = ${call('first')};
    const data = { stamp: 'original' }, tools = [], schema = ${JSON.stringify(schema)};
    const second = run.agent('Second answer.', { key: 'second', data, tools, schema });
    data.stamp = 'changed'; tools.push('write'); schema.description = 'changed';
    const results = await Promise.all([first, second]);
    results[0].answer = 43;
    return results;` });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  const second = Object.values(result.state.jobs).find(job => job.key === 'second');
  assert.deepEqual(second.descriptor.data, { stamp: 'original' });
  assert.deepEqual(second.descriptor.tools, []);
  assert.deepEqual(second.descriptor.schema, schema);
  assert.equal(second.identity, hash(json(second.descriptor)));
  assert.deepEqual(Object.values(result.state.jobs).find(job => job.key === 'first').result, { answer: 42 });
  assert.deepEqual(await load(join(f.dir, 'result.json')), [{ answer: 43 }, { answer: 42 }]);
});

for (const isolation of ['none', 'snapshot']) {
  test(`parallel ${isolation} workers cannot exceed the run-wide admission limit`, async t => {
    const f = await fixture(t, { git: isolation === 'snapshot', env: { FLUE_FIXTURE_CONCURRENCY: '6', FLUE_FIXTURE_RESPONSE: 'text' }, body: `
      return run.parallel(Array.from({ length: 6 }, (_, i) => () => run.agent('Check.', { key: String(i), tools: [], isolation: '${isolation}' })));` });
    const result = await f.invoke('run');
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, /Run-wide worker limit 5 reached/);
    assert.equal(Object.keys(result.state.jobs).length, 5);
    assert.equal(result.state.status, 'failed');
  });

  test(`duplicate keys are refused while a ${isolation} worker is being prepared`, async t => {
    const f = await fixture(t, { git: isolation === 'snapshot', body: `return run.parallel([() => ${call('same', `, isolation: '${isolation}'`)}, () => ${call('same', `, isolation: '${isolation}'`)}]);` });
    const result = await f.invoke('run');
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, /Key same is already running/);
    assert.equal(Object.keys(result.state.jobs).length, 1);
  });
}

test('a worker.mjs hook cannot rewrite the recorded task', async t => {
  const f = await fixture(t, { files: { 'worker.mjs': "export default task => { task.data.stamp = 'hook'; };\n" }, body: `return ${call('answer', ", data: { stamp: 'original' }")};` });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(Object.values(result.state.jobs)[0].descriptor.data, { stamp: 'original' });
});

test('a hook that returns a promise fails the worker loudly', async t => {
  const f = await fixture(t, { files: { 'worker.mjs': 'export default () => Promise.resolve();\n' } });
  const result = await f.invoke('run');
  assert.equal(result.code, 2, result.stderr);
  const [job] = Object.values(result.state.jobs);
  assert.equal(job.status, 'failed');
  assert.match(result.stderr, /must return synchronously/);
});

test('a caught child failure is visible without failing the parent', async t => {
  const f = await fixture(t, {
    files: { 'child.mjs': "export default () => { throw new Error('fixture-caught-child-failure'); };\n" },
    body: `try { await run.workflow('child.mjs'); } catch (error) { if (error.message !== 'fixture-caught-child-failure') throw error; }
      return ${call('answer')};`,
  });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.state.status, 'finished');
  const failure = result.stderrEvents.find(event => event.type === 'workflow-failed');
  assert.equal(failure?.name, 'child.mjs');
  assert.match(await readFile(join(f.dir, 'events.jsonl'), 'utf8'), /fixture-caught-child-failure/);
});

test('a structured worker that answers in text instead of submit_result is a failed worker, not a fatal run', async t => {
  const f = await fixture(t, { env: { FLUE_FIXTURE_RESPONSE: 'text' }, body: `return run.parallel([() => ${call('a')}, () => run.agent('Return checked text.', { key: 'b', tools: [] })]);` });
  const result = await f.invoke('run');
  assert.equal(result.code, 2, result.stderr);
  assert.equal(result.state.status, 'finished');
  assert.deepEqual(await load(join(f.dir, 'result.json')), [null, 'checked text']);
  const failed = Object.values(result.state.jobs).find(job => job.key === 'a');
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /without calling submit_result/);
});

test('text results are plain strings', async t => {
  const f = await fixture(t, { env: { FLUE_FIXTURE_RESPONSE: 'text' }, body: "return run.agent('Return checked text.', { key: 'text', tools: [] });" });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await load(join(f.dir, 'result.json')), 'checked text');
});

test('resume reuses a completed worker without a model call', async t => {
  const f = await fixture(t);
  const first = await f.invoke('run');
  const resumed = await f.invoke('resume');
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.modelCalls, 0);
  assert.equal(resumed.events.at(-1).syntaxChecks, 0, 'resume checks the pinned hash without repeating syntax checks');
  assert.equal(resumed.state.reused, 1);
  assert.deepEqual(resumed.state.jobs, first.state.jobs);
  assert.ok(resumed.stderrEvents.some(event => event.type === 'worker-reused'));
});

test('resume reattaches a pending worker through Flue without a saved receipt', async t => {
  const f = await fixture(t);
  const first = await f.invoke('run');
  const [job] = Object.values(first.state.jobs);
  const { submissionId } = first.stderrEvents.find(event => event.type === 'worker-started');
  job.status = 'pending';
  await save(join(f.dir, 'state.json'), first.state);
  const resumed = await f.invoke('resume');
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.modelCalls, 0, 'the settled submission is read, not rerun');
  const started = resumed.stderrEvents.find(event => event.type === 'worker-started');
  assert.equal(started.deduplicated, true);
  assert.equal(started.submissionId, submissionId);
  assert.deepEqual(await load(join(f.dir, 'result.json')), { answer: 42 });
});

test('a hard-killed run resumes: Flue finishes the admitted worker and the program reuses it', async t => {
  const f = await fixture(t, { timeout: 90_000 }); // Flue reclaims the dead attempt's lease after ~30 s
  const killed = await f.interrupt('run', 'SIGKILL');
  assert.equal(killed.sig, 'SIGKILL');
  assert.equal(killed.state.status, 'running');
  assert.equal(Object.values(killed.state.jobs)[0].status, 'pending');
  const original = (await readFile(join(f.dir, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse).find(event => event.type === 'worker-started');
  assert.ok(original?.submissionId, 'the killed attempt admitted a submission');
  const resumed = await f.invoke('resume');
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.modelCalls, 1, 'Flue re-attempts the interrupted submission once');
  const started = resumed.stderrEvents.find(event => event.type === 'worker-started');
  assert.equal(started.deduplicated, true);
  assert.equal(started.submissionId, original.submissionId, 'resume must not create a fresh submission');
  assert.equal(resumed.state.status, 'finished');
  assert.deepEqual(await load(join(f.dir, 'result.json')), { answer: 42 });
});

test('SIGTERM cancels: live workers settle aborted, the run is cancelled, resume keeps them aborted', async t => {
  const f = await fixture(t);
  const cancelled = await f.interrupt('run', 'SIGTERM');
  assert.equal(cancelled.code, 1, cancelled.stderr);
  assert.equal(cancelled.state.status, 'cancelled', cancelled.stderr);
  assert.equal(cancelled.state.owner, null);
  const [job] = Object.values(cancelled.state.jobs);
  assert.equal(job.status, 'aborted');
  assert.match(cancelled.stderr, /cancel-requested/);
  const resumed = await f.invoke('resume');
  assert.equal(resumed.code, 2, resumed.stderr);
  assert.equal(resumed.modelCalls, 0);
  assert.equal(resumed.state.jobs[job.id].status, 'aborted');
  assert.equal(await load(join(f.dir, 'result.json')), null);
});

test('resume is refused while a shell command from the previous attempt is still running', async t => {
  const f = await fixture(t);
  await f.invoke('run');
  const sleeper = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
  t.after(() => { try { process.kill(-sleeper.pid, 'SIGKILL'); } catch {} });
  await new Promise(resolve => sleeper.once('spawn', resolve));
  await appendFile(join(f.dir, 'events.jsonl'), JSON.stringify({ type: 'command', pid: sleeper.pid }) + '\n');
  const refused = await f.invoke('resume');
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, new RegExp(`still running.*${sleeper.pid}`));
  assert.equal(refused.modelCalls, 0);
});

test('a changed pinned program is refused before any worker starts', async t => {
  const f = await fixture(t);
  const first = await f.invoke('run');
  await appendFile(join((await load(join(f.dir, 'manifest.json'))).program, 'program.mjs'), '\ninvalid syntax {\n');
  const refused = await f.invoke('resume');
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /Pinned program changed/);
  assert.equal(refused.events.at(-1).syntaxChecks, 0, 'changed code is refused by its hash, not rechecked or loaded');
  assert.deepEqual(refused.state, first.state, 'a refusal leaves the saved run untouched');
});

test('unreadable run files release the owner lock before rejecting', async t => {
  const f = await fixture(t);
  await mkdir(f.dir, { recursive: true });
  await writeFile(join(f.dir, 'manifest.json'), '{');
  const { execute } = await import('../lib/run.mjs');
  await assert.rejects(execute({ dir: f.dir, runtimeRoot }), SyntaxError);
  lease(join(f.dir, 'owner.sqlite'))();
});

test('cancel signals the live owner and reports the settled run', async t => {
  const f = await fixture(t);
  await writeFile(f.trace, '');
  const proc = spawn(process.execPath, [child, join(f.root, 'workspace'), 'run', f.program, f.trace], { env: { ...baseEnv, FLUE_FIXTURE_BLOCK: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => proc.on('exit', resolve));
  for (let i = 0; i < 100 && !(await readFile(f.trace, 'utf8')).includes('model-blocked'); i++) await sleep(100);
  const cliUrl = new URL('../lib/cli.mjs', import.meta.url).href;
  const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', `const { cli } = await import(${JSON.stringify(cliUrl)}); await cli(process.argv[1], ['cancel', 'fixture']);`, '--', join(f.root, 'workspace')], { env: baseEnv });
  await exited;
  const summary = JSON.parse(stdout);
  assert.equal(summary.execution, 'cancelled');
  assert.deepEqual(summary.workers, { aborted: 1 });
});
