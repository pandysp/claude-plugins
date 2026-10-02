// End-to-end through the CLI with real Flue, SQLite and Git. Only the model is scripted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, appendFile, rm, stat } from 'node:fs/promises';
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
    if (pinned) assert.equal(pinned, join(dir, 'program'), 'the pinned program lives inside its run');
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

test('a fatal worker call whose rejection the program swallows fails the run', async t => {
  const f = await fixture(t, { body: `run.agent('Never awaited.', { key: 'lost', effort: 'not-an-effort' }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 50));
    return 'finished anyway';` });
  const result = await f.invoke('run');
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.state.status, 'failed');
  assert.match(result.state.error, /Unsupported effort: not-an-effort/);
  await assert.rejects(readFile(join(f.dir, 'result.json')), { code: 'ENOENT' });
});

test('a fatal worker call that is never awaited or handled fails the run', async t => {
  const f = await fixture(t, { body: `run.agent('Never awaited.', { key: 'lost', effort: 'not-an-effort' });
    await new Promise(resolve => setTimeout(resolve, 50));
    return 'finished anyway';` });
  const result = await f.invoke('run');
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.state.status, 'failed');
  assert.match(result.state.error, /Unsupported effort: not-an-effort/);
});

test('a worker.mjs hook can import the pinned Flue package by name', async t => {
  const f = await fixture(t, { files: { 'worker.mjs': "import { useInstruction } from '@flue/runtime';\nexport default () => { useInstruction('Cite evidence.'); };\n" } });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(Object.values(result.state.jobs)[0].status, 'completed');
});

test('a refused program leaves no half-created run behind', async t => {
  const f = await fixture(t, { body: 'return 1; }; invalid syntax {' });
  const failed = await exec(process.execPath, [child, join(f.root, 'workspace'), 'run', f.program, f.trace], { env: baseEnv }).catch(error => error);
  assert.equal(failed.code, 1, 'the CLI exits 1 for a refused program');
  assert.match(failed.stderr, /Syntax check failed for program\.mjs/);
  await assert.rejects(stat(f.dir), { code: 'ENOENT' }, 'the run directory is removed, so the id can be used again');
});

test('a caught fatal worker error still fails the run', async t => {
  const f = await fixture(t, { body: `try { await run.agent('Bad option.', { key: 'bad', isolation: 'container' }); } catch {}
    return 'continued';` });
  const result = await f.invoke('run');
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.state.status, 'failed');
  assert.match(result.state.error, /isolation must be/);
});

test('an invalid submit_result is a counted tool failure, even though it fails before execute()', async t => {
  const f = await fixture(t, { env: { FLUE_FIXTURE_RESPONSE: 'invalid-first' } });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.state.toolErrors, 1);
  const journal = (await readFile(join(f.dir, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(journal.filter(e => e.type.startsWith('tool-')).map(e => [e.type, e.tool]),
    [['tool-start', 'submit_result'], ['tool-failed', 'submit_result'], ['tool-start', 'submit_result'], ['tool-completed', 'submit_result']]);
  assert.deepEqual(await load(join(f.dir, 'result.json')), { answer: 42 });
});

test('a custom tool that throws is a counted tool failure with its message', async t => {
  const f = await fixture(t, {
    env: { FLUE_FIXTURE_RESPONSE: 'tool-error-first' },
    files: { 'tools.mjs': "export default { broken: () => ({ name: 'broken', label: 'Broken', description: 'Always fails.', parameters: { type: 'object', properties: {} }, async execute() { throw new Error('broken on purpose'); } }) };\n" },
    body: `return ${call('answer', '').replace('tools: []', "tools: ['broken']")};`,
  });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.state.toolErrors, 1);
  const failed = (await readFile(join(f.dir, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse).find(e => e.type === 'tool-failed');
  assert.equal(failed.tool, 'broken');
  assert.match(failed.message, /broken on purpose/);
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
  const tools = (await readFile(join(f.dir, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
    .filter(event => event.type.startsWith('tool-') && event.attempt === resumed.state.attempt).map(event => event.type);
  assert.deepEqual(tools, [], 'the first attempt already journaled these tool calls; re-reading the submission adds none');
  assert.equal(resumed.state.toolErrors, 0);
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
  const tools = (await readFile(join(f.dir, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
    .filter(event => event.type.startsWith('tool-')).map(event => [event.attempt === resumed.state.attempt ? 'resumed' : 'killed', event.type]);
  assert.deepEqual(tools, [['resumed', 'tool-start'], ['resumed', 'tool-completed']], 'the killed attempt saw no tool call; the resumed one journals it once');
});

test('SIGTERM only stops the owner: in-flight work stays pending and resume finishes it', async t => {
  const f = await fixture(t, { timeout: 90_000 }); // Flue reclaims the stopped attempt's lease after ~30 s
  const interrupted = await f.interrupt('run', 'SIGTERM');
  assert.equal(interrupted.code, 1, interrupted.stderr);
  assert.match(interrupted.stderr, /run-interrupted/);
  const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', `const { cli } = await import(${JSON.stringify(new URL('../lib/cli.mjs', import.meta.url).href)}); await cli(process.argv[1], ['inspect', 'fixture']);`, '--', join(f.root, 'workspace')], { env: baseEnv });
  assert.equal(JSON.parse(stdout).execution, 'interrupted');
  const [job] = Object.values(interrupted.state.jobs);
  assert.equal(job.status, 'pending');
  assert.doesNotMatch(interrupted.stderr, /cancel-requested/);
  const original = (await readFile(join(f.dir, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse).find(event => event.type === 'worker-started');
  const resumed = await f.invoke('resume');
  assert.equal(resumed.code, 0, resumed.stderr);
  const started = resumed.stderrEvents.find(event => event.type === 'worker-started');
  assert.equal(started.submissionId, original.submissionId, 'resume re-attaches to the same submission');
  assert.equal(resumed.state.jobs[job.id].status, 'completed');
  assert.deepEqual(await load(join(f.dir, 'result.json')), { answer: 42 });
});

test('resume is refused while a shell command from the previous attempt is still running', async t => {
  const f = await fixture(t);
  await f.invoke('run');
  const sleeper = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
  t.after(() => { try { process.kill(-sleeper.pid, 'SIGKILL'); } catch {} });
  await new Promise(resolve => sleeper.once('spawn', resolve));
  await appendFile(join(f.dir, 'events.jsonl'), JSON.stringify({ type: 'command', pid: sleeper.pid, at: new Date().toISOString() }) + '\n');
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
  // The program treats an empty worker as its own failure; a cancelled worker must
  // reject instead, so the run still ends as cancelled.
  const f = await fixture(t, { body: `const [answer] = await run.parallel([() => ${call('answer')}]); if (answer === null) throw new Error('worker came back empty'); return answer;` });
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
  assert.doesNotMatch(summary.error ?? '', /came back empty/);
});

test('program-local #imports resolve within the program, package names within the runtime', async t => {
  const f = await fixture(t, {
    files: { 'package.json': JSON.stringify({ type: 'module', imports: { '#helper': './helper.mjs' } }), 'helper.mjs': "export const answer = 'local';\n" },
    body: `const { answer } = await import('#helper'); if (answer !== 'local') throw new Error('wrong helper'); return ${call('answer')};`,
  });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
});

test('a failure writing the final journal event fails the run instead of saving it as finished', async t => {
  // The program replaces the builtin the runtime journals with, failing only the closing event.
  const f = await fixture(t, { body: `
    const fs = (await import('node:fs')).default;
    const { syncBuiltinESMExports } = await import('node:module');
    const append = fs.appendFileSync;
    fs.appendFileSync = (file, data, ...rest) => {
      if (String(data).includes('"program-finished"')) throw new Error('journal disk full');
      return append(file, data, ...rest);
    };
    syncBuiltinESMExports();
    return ${call('answer')};` });
  const result = await f.invoke('run');
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.state.status, 'failed');
  assert.match(result.state.error, /journal disk full/);
  assert.equal(result.state.owner, null);
});

// A tool that runs one foreground command whose child ignores SIGTERM and writes late.txt after 2 s.
function stubbornTool(marker, execOptions = '') {
  const command = `sh -c 'trap "" TERM; echo ready > "${marker}"; sleep 2; echo late > late.txt; sleep 30' >/dev/null 2>&1; echo done`;
  return `export default { broken: sandbox => ({ name: 'broken', label: 'Probe', description: 'Runs a stubborn command.', parameters: { type: 'object', properties: {} }, async execute(_id, _args, signal) { const result = await sandbox.exec(${JSON.stringify(command)}, { signal${execOptions} }); return { content: [{ type: 'text', text: result.stdout }] }; } }) };\n`;
}
const waitFor = async path => { for (let i = 0; i < 100 && !(await readFile(path, 'utf8').catch(() => '')); i++) await sleep(100); };

test('cancel stops worker commands that ignore SIGTERM before it reports the run cancelled', async t => {
  const marker = join(tmpdir(), `flue-cancel-ready-${process.pid}-${Date.now()}`);
  t.after(() => rm(marker, { force: true }));
  const f = await fixture(t, {
    git: true,
    env: { FLUE_FIXTURE_RESPONSE: 'tool-error-first' },
    files: { 'tools.mjs': stubbornTool(marker) },
    body: `return ${call('answer', ", isolation: 'snapshot'").replace('tools: []', "tools: ['broken']")};`,
  });
  await writeFile(f.trace, '');
  const proc = spawn(process.execPath, [child, join(f.root, 'workspace'), 'run', f.program, f.trace], { env: { ...baseEnv, FLUE_FIXTURE_RESPONSE: 'tool-error-first' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => proc.on('exit', resolve));
  await waitFor(marker);
  assert.equal((await readFile(marker, 'utf8')).trim(), 'ready');
  const cliUrl = new URL('../lib/cli.mjs', import.meta.url).href;
  const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', `const { cli } = await import(${JSON.stringify(cliUrl)}); await cli(process.argv[1], ['cancel', 'fixture']); process.exit(process.exitCode ?? 0);`, '--', join(f.root, 'workspace')], { env: baseEnv });
  await exited;
  const summary = JSON.parse(stdout);
  assert.equal(summary.execution, 'cancelled');
  assert.deepEqual(summary.liveCommandGroups, []);
  const [job] = summary.jobs;
  await sleep(3000);
  await assert.rejects(readFile(join(job.artifact.cwd, 'late.txt')), { code: 'ENOENT' }, 'the stubborn command was stopped before it could write');
});

test('a second live call with the same key is refused at any concurrency', async t => {
  const f = await fixture(t, { env: { FLUE_FIXTURE_CONCURRENCY: '1' }, body: `return run.parallel([() => ${call('same')}, () => ${call('same')}]);` });
  const result = await f.invoke('run');
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /Key same is already running/);
});

test('SIGTERM while a command runs: no command runs on after the owner, not even one started during the stop', async t => {
  const marker = join(tmpdir(), `flue-interrupt-ready-${process.pid}-${Date.now()}`);
  t.after(() => rm(marker, { force: true }));
  // The worker calls the stubborn tool again as soon as the first command ends.
  const f = await fixture(t, { git: true, env: { FLUE_FIXTURE_RESPONSE: 'tool-twice' }, files: { 'tools.mjs': stubbornTool(marker) },
    body: `return ${call('answer', ", isolation: 'snapshot'").replace('tools: []', "tools: ['broken']")};` });
  await writeFile(f.trace, '');
  const proc = spawn(process.execPath, [child, join(f.root, 'workspace'), 'run', f.program, f.trace], { env: { ...baseEnv, FLUE_FIXTURE_RESPONSE: 'tool-twice' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => proc.on('exit', resolve));
  await waitFor(marker);
  proc.kill('SIGTERM');
  assert.equal(await exited, 1);
  await sleep(3000);
  const cliUrl = new URL('../lib/cli.mjs', import.meta.url).href;
  const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', `const { cli } = await import(${JSON.stringify(cliUrl)}); await cli(process.argv[1], ['inspect', 'fixture']);`, '--', join(f.root, 'workspace')], { env: baseEnv });
  const summary = JSON.parse(stdout);
  assert.equal(summary.execution, 'interrupted');
  assert.deepEqual(summary.liveCommandGroups, []);
  assert.equal(summary.jobs[0].status, 'pending');
  const workspace = (await load(join(f.dir, 'state.json'))).jobs[summary.jobs[0].id].workspace.cwd;
  await assert.rejects(readFile(join(workspace, 'late.txt')), { code: 'ENOENT' });
});

test('a command child that ignores SIGTERM after a timeout is killed with its shell, so the patch stays true', async t => {
  const marker = join(tmpdir(), `flue-timeout-ready-${process.pid}-${Date.now()}`);
  t.after(() => rm(marker, { force: true }));
  const f = await fixture(t, { git: true, env: { FLUE_FIXTURE_RESPONSE: 'tool-error-first' }, files: { 'tools.mjs': stubbornTool(marker, ', timeoutMs: 500') },
    body: `const answer = await ${call('answer', ", isolation: 'snapshot'").replace('tools: []', "tools: ['broken']")};
      await new Promise(resolve => setTimeout(resolve, 3000)); // longer than the child would need to write
      return answer;` });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  const [job] = Object.values(result.state.jobs);
  assert.equal(job.status, 'completed');
  await assert.rejects(readFile(join(job.artifact.cwd, 'late.txt')), { code: 'ENOENT' }, 'the child was killed when its shell exited');
  assert.deepEqual(job.artifact.changed, []);
});

// Heads (pi-hydra review heads through @pandysp/flue-hydra). The fixture model answers 41 until a head's
// pi-hydra signal reaches it, then 42.
const headFile = (name, tools = '[]') => `---\nname: ${name}\ndescription: checks the answer\ntools: ${tools}\n---\nCheck the answer.\n`;
const journal = async f => (await readFile(join(f.dir, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);

test('a head steers a text worker, which corrects itself before its answer is returned', async t => {
  const f = await fixture(t, { files: { 'checker.md': headFile('checker') }, env: { FLUE_FIXTURE_HEADS: 'steer', FLUE_FIXTURE_RESPONSE: 'text' },
    body: `return run.agent('Answer.', { key: 'a', tools: [], heads: ['checker.md'] });` });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await load(join(f.dir, 'result.json')), 'answer 42', 'only the final step, not the joined "answer 41\\n\\nanswer 42"');
  const checks = (await journal(f)).filter(row => row.type === 'head-check');
  assert.deepEqual(checks.map(({ head, round, outcome, unresolved }) => ({ head, round, outcome, unresolved })),
    [{ head: 'checker', round: 0, outcome: 'findings', unresolved: false }, { head: 'checker', round: 1, outcome: 'none', unresolved: false }]);
  assert.ok(checks.every(row => row.worker === Object.keys(result.state.jobs)[0]));
  assert.ok(result.stderrEvents.some(event => event.type === 'head-check'), 'checks show in the progress output');
});

test('a steered structured worker resubmits, and the corrected result is the one returned', async t => {
  const f = await fixture(t, { files: { 'checker.md': headFile('checker') }, env: { FLUE_FIXTURE_HEADS: 'steer' },
    body: `return ${call('answer', ", heads: ['checker.md']")};` });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await load(join(f.dir, 'result.json')), { answer: 42 });
  assert.equal(Object.values(result.state.jobs)[0].status, 'completed');
});

test('a worker without heads is not reviewed', async t => {
  const f = await fixture(t, { env: { FLUE_FIXTURE_HEADS: 'steer' } });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await load(join(f.dir, 'result.json')), { answer: 41 });
  assert.equal(result.events.filter(event => event.event === 'head-call').length, 0);
  assert.equal((await journal(f)).filter(row => row.type === 'head-check').length, 0);
});

test('findings still open after three rounds are marked unresolved and the worker finishes', async t => {
  const f = await fixture(t, { files: { 'checker.md': headFile('checker') }, env: { FLUE_FIXTURE_HEADS: 'always', FLUE_FIXTURE_RESPONSE: 'text' },
    body: `return run.agent('Answer.', { key: 'a', tools: [], heads: ['checker.md'] });` });
  const result = await f.invoke('run');
  assert.equal(result.code, 0, result.stderr);
  const checks = (await journal(f)).filter(row => row.type === 'head-check');
  assert.deepEqual(checks.map(row => [row.round, row.unresolved]), [[0, false], [1, false], [2, false], [3, true]]);
});

for (const [label, files, heads, env, pattern] of [
  ['a head that uses tools', { 'actor.md': headFile('actor', 'read') }, ['actor.md'], { FLUE_FIXTURE_HEADS: 'pass' }, /Invalid heads: .*judge heads only/],
  ['a missing head file', {}, ['missing.md'], { FLUE_FIXTURE_HEADS: 'pass' }, /Invalid heads: .*ENOENT/],
  ['a model API heads cannot review', { 'checker.md': headFile('checker') }, ['checker.md'], {}, /heads need a model on the Anthropic or OpenAI Codex API; openai\/flue-fixture uses flue-fixture/],
  ['duplicate heads', { 'checker.md': headFile('checker') }, ['checker.md', 'checker.md'], { FLUE_FIXTURE_HEADS: 'pass' }, /heads must be an array of unique/],
]) {
  test(`${label} is refused when the worker is requested`, async t => {
    const f = await fixture(t, { files, env, body: `return ${call('answer', `, heads: ${JSON.stringify(heads)}`)};` });
    const result = await f.invoke('run');
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, pattern);
    assert.equal(result.modelCalls, 0);
  });
}

test('a worker with heads resumed after a crash finishes unchecked, and the journal says why', async t => {
  const f = await fixture(t, { timeout: 90_000, files: { 'checker.md': headFile('checker') }, env: { FLUE_FIXTURE_HEADS: 'steer' },
    body: `return ${call('answer', ", heads: ['checker.md']")};` }); // Flue reclaims the dead attempt's lease after ~30 s
  const killed = await f.interrupt('run', 'SIGKILL');
  assert.equal(killed.sig, 'SIGKILL');
  const resumed = await f.invoke('resume');
  assert.equal(resumed.code, 0, resumed.stderr);
  // Flue does not rerun useAgentStart for a message it already took in, so nothing was recorded to replay.
  assert.deepEqual(await load(join(f.dir, 'result.json')), { answer: 41 });
  assert.equal(resumed.events.filter(event => event.event === 'head-call').length, 0);
  const checks = (await journal(f)).filter(row => row.type === 'head-check');
  assert.deepEqual(checks.map(({ outcome, errorKind }) => ({ outcome, errorKind })), [{ outcome: 'failed', errorKind: 'no-capture' }]);
  assert.ok(resumed.stderrEvents.some(event => event.type === 'head-check' && event.outcome === 'failed'), 'the failed check shows in the progress output');
});
