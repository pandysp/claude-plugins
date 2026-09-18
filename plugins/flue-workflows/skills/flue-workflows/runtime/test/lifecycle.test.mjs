import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sqlite } from '@flue/runtime/node';
import { hash, hashTree, json } from '../lib/files.mjs';

const exec = promisify(execFile);
const child = fileURLToPath(new URL('./fixtures/lifecycle-child.mjs', import.meta.url));
async function run(f, mode, withAuth = true, extraEnv = {}) {
  const env = { ...process.env, FLUE_OFFLINE_TEST_KEY: 'not-a-real-credential', ...extraEnv };
  if (!withAuth) delete env.FLUE_OFFLINE_TEST_KEY;
  try {
    const out = await exec(process.execPath, [child, f.workspace, mode, f.program, f.trace], { env, timeout: 20000 });
    return { ...out, code: 0 };
  } catch (error) {
    if (typeof error.code !== 'number') throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}
function diagnostic(result) {
  const lines = result.stderr.split('\n').filter(line => line.startsWith('flue: '));
  assert.ok(lines.length, result.stderr);
  return lines.join('\n');
}
async function fixture(t, { extra, body = "return run.agent('new work', { key: 'new', tools: [] });" } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'flue-lifecycle-'));
  const f = { root, workspace: join(root, 'installed'), program: join(root, 'source', 'program.mjs'), trace: join(root, 'trace.jsonl') };
  await mkdir(join(root, 'source'));
  await writeFile(f.program, `export default async run => { if (process.env.FLUE_TEST_PREPARING) return { fixture: true }; ${body} };\n`);
  if (extra) await writeFile(join(root, 'source', extra), extra === 'tools.mjs' ? 'export default {};\n' : 'export default () => {};\n');
  const prepared = await run(f, 'prepare');
  f.dir = join(f.workspace, 'runs', 'fixture');
  f.manifest = JSON.parse(await readFile(join(f.dir, 'manifest.json')));
  t.after(async () => {
    const programs = fileURLToPath(new URL('../programs/', import.meta.url));
    assert.ok(f.manifest.program.startsWith(programs));
    await rm(f.manifest.program, { recursive: true });
    await rm(root, { recursive: true });
  });
  assert.equal(prepared.code, 0, prepared.stderr);
  f.state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  await writeFile(f.trace, '');
  return f;
}
async function pending(f, isolation = 'none') {
  const descriptor = { prompt: 'old work', model: f.manifest.config.model, effort: 'low', tools: [], schema: null, isolation, cwd: f.manifest.config.cwd, label: '', phase: '', instructions: '', data: null };
  const receipt = { submissionId: 'old-worker', uid: 'old-worker', acceptedAt: '2026-01-01T00:00:00.000Z' };
  f.state.jobs['old-worker'] = { id: 'old-worker', key: 'old', namespace: 'main', descriptor, identity: hash(json(descriptor)), status: 'pending', receipt, result: null, error: null, workspace: null, artifact: null };
  await writeFile(join(f.dir, 'state.json'), json(f.state));
  // A saved receipt implies its row in the native store.
  const store = sqlite(join(f.dir, 'flue.sqlite'));
  try {
    await store.migrate();
    const { submissionStore } = await store.connect();
    await submissionStore.admitDispatch({ submissionId: receipt.submissionId, agent: 'Worker', id: 'old-worker', message: { kind: 'user', body: descriptor.prompt }, acceptedAt: receipt.acceptedAt });
  } finally { await store.close(); }
}
async function refusedBeforeStartup(f, expected) {
  const result = await run(f, 'resume', false);
  assert.equal(result.code, 1);
  assert.match(result.stderr, expected);
  assert.doesNotMatch(await readFile(f.trace, 'utf8'), /native-start/, 'Flue start must not be called');
}

for (const failure of ['extension-start', 'extension-start,sdk']) {
  test(`partial native start cannot abandon extension work (${failure})`, async t => {
    const f = await fixture(t);
    const result = await run(f, 'resume', true, { FLUE_TEST_CLEANUP_FAILURE: failure });
    assert.equal(result.code, 1);
    const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
    assert.equal(state.status, 'failed');
    assert.equal(state.cleanShutdown, false);
    assert.match(state.error, /fixture-runtime-start-error/);
    assert.match(state.error, /fixture-extension-start-rejection/);
    if (failure.includes(',sdk')) assert.match(state.error, /fixture-sdk-close-error/);
    const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(rows.filter(row => row.event === 'startup-extension-effect'), [{ event: 'startup-extension-effect', ownerActive: true, cleanShutdown: false }]);
    const sequence = rows.map(row => row.event);
    assert.ok(sequence.indexOf('startup-extension-effect') < sequence.indexOf('sdk-cleanup'));
    assert.ok(sequence.indexOf('sdk-cleanup') < sequence.indexOf('owner-close'));
    assert.equal(rows.at(-1).forcedExit, false);
  });
}

for (const failure of ['observe', 'sdk', 'tracker']) {
  test(`program cancellation is clean only when cleanup succeeds (${failure})`, async t => {
    const f = await fixture(t, { body: "throw new DOMException('fixture-cancelled', 'AbortError');" });
    const result = await run(f, 'resume', true, { FLUE_TEST_CLEANUP_FAILURE: failure });
    assert.equal(result.code, 1);
    assert.match(diagnostic(result), /fixture-cancelled/);
    const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
    assert.equal(state.status, failure === 'observe' ? 'cancelled' : 'failed');
    assert.equal(state.cleanShutdown, failure === 'observe');
    if (failure !== 'observe') assert.match(state.error, new RegExp(`fixture-${failure}-close-error`));
    const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows.at(-1).forcedExit, false);
  });
}

for (const command of ['run', 'resume']) for (const origin of ['program', 'sdk', 'program+sdk', 'large-program+sdk', 'none']) {
  test(`${command}: final inspection failure does not hide ${origin} execution outcome`, async t => {
    const options = origin.startsWith('large') ? { body: "throw new Error('fixture-program-error:' + 'x'.repeat(5000));" }
      : origin.includes('program') ? { body: "throw new Error('fixture-program-error');" } : {};
    const prepared = await fixture(t, options);
    const f = command === 'run' ? { ...prepared, workspace: join(prepared.root, 'fresh') } : prepared;
    const result = await run(f, command, true, {
      FLUE_TEST_INSPECTION_ERROR: '1', FLUE_TEST_CLEANUP_FAILURE: origin.includes('sdk') ? 'sdk' : 'observe',
    });
    if (command === 'run') {
      const manifest = JSON.parse(await readFile(join(f.workspace, 'runs/fixture/manifest.json')));
      t.after(async () => {
        assert.ok(manifest.program.startsWith(fileURLToPath(new URL('../programs/', import.meta.url))));
        await rm(manifest.program, { recursive: true });
      });
    }
    assert.equal(result.code, 1);
    assert.match(diagnostic(result), /fixture-inspection-error/);
    assert.equal(result.stderr.split('\n').filter(line => line.startsWith('flue: ')).length, origin === 'none' ? 1 : 2);
    if (origin.includes('sdk')) assert.match(diagnostic(result), /fixture-sdk-close-error/);
    if (origin.includes('program')) assert.match(diagnostic(result), /fixture-program-error/);
    const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows.at(-1).forcedExit, false);
  });
}

for (const failure of ['server', 'server-stop', 'socket-journal', 'server-before-dispatch']) test(`controller ${failure} failure remains owned through shutdown`, async t => {
  const options = failure === 'socket-journal' ? { body: "return new Promise((_, reject) => run.signal.addEventListener('abort', () => reject(run.signal.reason), { once: true }));" } : {};
  const f = await fixture(t, options);
  const result = await run(f, 'resume', true, { FLUE_TEST_CONTROLLER_FAILURE: failure, FLUE_TEST_CLEANUP_FAILURE: 'observe' });
  assert.equal(result.code, 1, result.stdout + result.stderr);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, 'failed', result.stderr);
  assert.equal(state.cleanShutdown, false);
  const expected = failure === 'socket-journal' ? /fixture-control-journal-error/ : /fixture-.*-server-error/;
  assert.match(diagnostic(result), expected);
  assert.match(state.error, expected);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.at(-1), { event: 'cleanup-observed', ownerActive: false, serverListening: false, forcedExit: false });
  const cleanup = ['native-stop', 'sdk-cleanup', 'server-close', 'tracker-close', 'loader-close', 'journal-close', 'owner-close'];
  assert.deepEqual(rows.map(row => row.event).filter(event => cleanup.includes(event)), cleanup);
  if (failure === 'server-before-dispatch') assert.equal(rows.some(row => row.event === 'new-admission'), false, 'fatal controller failure must prevent dispatch after the pending save');
});

test('controller socket timeout remains a client error rather than a run failure', async t => {
  const f = await fixture(t, { body: "await new Promise(resolve => setTimeout(resolve, 3500)); return 'client-error-did-not-cancel';" });
  const result = await run(f, 'resume', true, { FLUE_TEST_CONTROLLER_FAILURE: 'socket-timeout', FLUE_TEST_CLEANUP_FAILURE: 'observe' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /Control request timed out/);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, 'finished');
  assert.equal(state.cleanShutdown, true);
  assert.equal(JSON.parse(await readFile(join(f.dir, 'result.json'))), 'client-error-did-not-cancel');
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.at(-1), { event: 'cleanup-observed', ownerActive: false, serverListening: false, forcedExit: false });
});

test('controller failure before native startup prevents recovery', async t => {
  const f = await fixture(t);
  const result = await run(f, 'resume', true, { FLUE_TEST_CONTROLLER_FAILURE: 'server-before-start', FLUE_TEST_CLEANUP_FAILURE: 'observe' });
  assert.equal(result.code, 1, result.stderr);
  assert.match(diagnostic(result), /fixture-before-start-server-error/);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, 'failed');
  assert.equal(state.cleanShutdown, false);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.some(row => row.event === 'native-start'), false, 'fatal controller failure must not start native recovery');
  assert.equal(rows.at(-1).forcedExit, false);
});

for (const mode of ['valid-cancel', 'malformed-client']) test(`controller ${mode} preserves ordinary client behavior`, async t => {
  const f = await fixture(t, { body: "await new Promise(resolve => setTimeout(resolve, 100)); return { checked: true };" });
  const result = await run(f, 'resume', true, { FLUE_TEST_CONTROLLER_FAILURE: mode, FLUE_TEST_CLEANUP_FAILURE: 'observe' });
  assert.equal(result.code, mode === 'valid-cancel' ? 1 : 0, result.stderr);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, mode === 'valid-cancel' ? 'cancelled' : 'finished');
  assert.equal(state.cleanShutdown, true);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  const reply = rows.filter(row => row.event === 'fixture-client-reply').map(row => row.reply).join('');
  assert.ok(reply, JSON.stringify(rows));
  const parsed = JSON.parse(reply);
  if (mode === 'valid-cancel') assert.equal(parsed.requested, true);
  else assert.equal(typeof parsed.error, 'string');
  assert.equal(rows.at(-1).forcedExit, false);
});

test('controller failure retains reporting and SDK causes without callback escape', async t => {
  const f = await fixture(t);
  const result = await run(f, 'resume', true, { FLUE_TEST_CONTROLLER_FAILURE: 'server', FLUE_TEST_CONTROLLER_REPORT_ERROR: '1', FLUE_TEST_CLEANUP_FAILURE: 'sdk' });
  assert.equal(result.code, 1, result.stderr);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, 'failed');
  assert.equal(state.cleanShutdown, false);
  for (const cause of ['fixture-live-server-error', 'fixture-controller-report-error', 'fixture-sdk-close-error']) assert.ok(state.error.includes(cause), state.error);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.at(-1), { event: 'cleanup-observed', ownerActive: false, serverListening: false, forcedExit: false });
});

for (const origin of ['controller', 'runtime']) test(`controller shutdown counts independent reuse of the cancellation cause (${origin})`, async t => {
  const f = await fixture(t, { body: "globalThis.__flueTestControllerSignal = run.signal; process.emit('SIGTERM'); run.signal.throwIfAborted();" });
  const result = await run(f, 'resume', true, {
    FLUE_TEST_CONTROLLER_FAILURE: origin === 'controller' ? 'server-stop-shared-abort' : '',
    FLUE_TEST_CLEANUP_FAILURE: origin === 'controller' ? 'observe' : 'runtime-shared-abort',
  });
  assert.equal(result.code, 1, result.stderr);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, 'failed');
  assert.equal(state.cleanShutdown, false);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.at(-1).forcedExit, false);
});

for (const broken of [true, false]) test(`controller late cancel preserves shutdown accounting (journal failure: ${broken})`, async t => {
  const f = await fixture(t, { body: 'return { checked: true };' });
  const result = await run(f, 'resume', true, { FLUE_TEST_CONTROLLER_FAILURE: broken ? 'cancel-journal-during-stop' : 'cancel-during-stop', FLUE_TEST_CLEANUP_FAILURE: 'observe' });
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  const replies = [0, 1].map(i => JSON.parse(rows.filter(row => row.event === 'fixture-client-reply' && row.request === i).map(row => row.reply).join('')));
  if (broken) {
    assert.equal(rows.filter(row => row.event === 'fixture-journal-fault').length, 2);
    for (const [i, reply] of replies.entries()) assert.match(reply.error, new RegExp(`fixture-late-cancel-journal-error-${i + 1}`));
  } else assert.deepEqual(replies, [{ requested: true }, { requested: true }]);
  assert.deepEqual(rows.at(-1), { event: 'cleanup-observed', ownerActive: false, serverListening: false, forcedExit: false });
  assert.equal(result.code, broken ? 1 : 0, JSON.stringify({ state, stdout: result.stdout, stderr: result.stderr }));
  assert.equal(state.status, broken ? 'failed' : 'finished');
  assert.equal(state.cleanShutdown, !broken);
  if (broken) for (const i of [1, 2]) assert.match(state.error, new RegExp(`fixture-late-cancel-journal-error-${i}`));
});

test('controller fatal startup callback prevents receiptless recovery admission', async t => {
  const f = await fixture(t);
  await pending(f);
  f.state.jobs['old-worker'].receipt = null;
  await writeFile(join(f.dir, 'state.json'), json(f.state));
  const result = await run(f, 'resume', true, { FLUE_TEST_CONTROLLER_FAILURE: 'server-during-start', FLUE_TEST_CLEANUP_FAILURE: 'observe' });
  assert.equal(result.code, 1, result.stderr);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, 'failed');
  assert.equal(state.cleanShutdown, false);
  assert.match(state.error, /fixture-during-start-server-error/);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.at(-1), { event: 'cleanup-observed', ownerActive: false, serverListening: false, forcedExit: false });
  assert.equal(rows.some(row => row.event === 'receiptless-recovery-admitted'), false, 'fatal startup callback must prevent subsequent receiptless dispatch');
});

test('partial composition results retain exit 2 and one printed inspection', async t => {
  const f = await fixture(t, { body: "return run.parallel([() => { throw new Error('fixture-item-error'); }]);" });
  const result = await run(f, 'resume');
  assert.equal(result.code, 2, result.stderr);
  const summaries = result.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].execution, 'finished');
  assert.equal(summaries[0].compositionErrors, 1);
  assert.deepEqual(JSON.parse(await readFile(join(f.dir, 'result.json'))), [null]);
});

test('shutdown cannot claim quiescence after a recorded command identity disappears', async t => {
  const f = await fixture(t);
  const result = await run(f, 'resume', true, { FLUE_TEST_CLEANUP_FAILURE: 'missing-record' });
  assert.equal(result.code, 1, result.stdout + result.stderr);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, 'failed');
  assert.equal(state.cleanShutdown, false);
  assert.match(state.error, /missing|unreadable/);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  const removed = rows.find(row => row.event === 'command-record-removed');
  assert.ok(removed);
  assert.ok(diagnostic(result).includes(removed.id));
  assert.equal(rows.at(-1).forcedExit, false);
});

test('a cleanup AbortError is not clean program cancellation', async t => {
  const f = await fixture(t);
  const result = await run(f, 'resume', true, { FLUE_TEST_CLEANUP_FAILURE: 'runtime-abort' });
  assert.equal(result.code, 1);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, 'failed');
  assert.equal(state.cleanShutdown, false);
  assert.match(state.error, /fixture-runtime-stop-abort/);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.at(-1).forcedExit, false);
});

test('successful execution still exits naturally with clean saved state', async t => {
  const f = await fixture(t);
  const result = await run(f, 'resume', true, { FLUE_TEST_CLEANUP_FAILURE: 'observe' });
  assert.equal(result.code, 0, result.stderr);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, 'finished');
  assert.equal(state.cleanShutdown, true);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.at(-1), { event: 'cleanup-observed', ownerActive: false, serverListening: false, forcedExit: false });
});

for (const failure of ['sdk', 'runtime', 'server', 'tracker', 'loader', 'journal', 'sdk,tracker,loader,journal']) {
  test(`${failure} cleanup failure still closes resources and releases ownership`, async t => {
    const f = await fixture(t);
    const result = await run(f, 'resume', true, { FLUE_TEST_CLEANUP_FAILURE: failure });
    assert.equal(result.code, 1, result.stderr);
    const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(rows.at(-1), { event: 'cleanup-observed', ownerActive: false, serverListening: false, forcedExit: false });
    const events = rows.map(row => row.event);
    const cleanup = ['native-stop', 'sdk-cleanup', 'server-close', 'tracker-close', 'loader-close', 'journal-close', 'owner-close'];
    assert.deepEqual(events.filter(event => cleanup.includes(event)), cleanup);
    const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
    assert.equal(state.status, 'failed');
    assert.equal(state.cleanShutdown, false);
    for (const name of failure.split(',')) {
      const expected = new RegExp(`fixture-${name}-${name === 'runtime' ? 'stop' : 'close'}-error`);
      assert.match(diagnostic(result), expected);
      assert.match(state.error, expected);
    }
  });
}

test('failed runtime startup still cleans SDK resources and closes the controller', async t => {
  const f = await fixture(t);
  const result = await run(f, 'resume', true, { FLUE_TEST_CLEANUP_FAILURE: 'start,sdk' });
  assert.equal(result.code, 1);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(row => row.event), ['native-start', 'sdk-cleanup', 'server-close', 'tracker-close', 'loader-close', 'journal-close', 'owner-close', 'cleanup-observed']);
  assert.equal(rows.at(-1).forcedExit, false);
  assert.match(diagnostic(result), /fixture-runtime-start-error/);
  assert.match(diagnostic(result), /fixture-sdk-close-error/);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, 'failed');
  assert.equal(state.cleanShutdown, false);
});

test('a rejected worker write chain does not prevent terminal failure persistence', async t => {
  const f = await fixture(t);
  const result = await run(f, 'resume', true, { FLUE_TEST_CLEANUP_FAILURE: 'write' });
  assert.equal(result.code, 1);
  assert.match(diagnostic(result), /fixture-worker-persist-error/);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.status, 'failed');
  assert.equal(state.cleanShutdown, false);
  assert.match(state.error, /fixture-worker-persist-error/);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.at(-1).forcedExit, false);
  assert.ok(!rows.some(row => row.event === 'new-admission'));
});

for (const failure of ['persist', 'owner', 'emit']) {
  test(`${failure} failure preserves the primary error and attempts ownership release`, async t => {
    const f = await fixture(t, { body: "await run.agent('new work', { tools: [] }); throw new Error('fixture-program-error');" });
    const result = await run(f, 'resume', true, { FLUE_TEST_CLEANUP_FAILURE: failure });
    assert.equal(result.code, 1);
    const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(rows.at(-1), { event: 'cleanup-observed', ownerActive: false, serverListening: false, forcedExit: false });
    assert.equal(rows.filter(row => row.event === 'owner-close').length, 1);
    assert.match(diagnostic(result), /fixture-program-error/);
    assert.match(diagnostic(result), failure === 'persist' ? /fixture-terminal-persist-error/ : failure === 'emit' ? /fixture-journal-write-error/ : /fixture-owner-close-error/);
    if (failure === 'persist') {
      const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
      assert.equal(state.status, 'running', 'a refused terminal write cannot claim persisted failure state');
      assert.equal(state.cleanShutdown, false);
    }
  });
}

test('returned artifact references resolve to the final workspace after shutdown edits', async t => {
  const f = await fixture(t, { body: "await run.agent('new work', { tools: [], isolation: 'snapshot' }); return run.artifacts();" });
  const cwd = join(f.root, 'source');
  await exec('git', ['init', '-q', cwd]);
  await exec('git', ['-C', cwd, 'add', '.']);
  await exec('git', ['-C', cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'fixture']);
  const result = await run(f, 'resume', true, { FLUE_TEST_SHUTDOWN_EDIT: '1' });
  assert.equal(result.code, 0, result.stderr);
  const returned = JSON.parse(await readFile(join(f.dir, 'result.json')));
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.equal(state.cleanShutdown, true);
  assert.equal(returned.length, 1);
  const final = Object.values(state.jobs)[0].artifact;
  assert.ok(final.changed.includes('shutdown.txt'));
  assert.equal(hash(await readFile(final.patch)), final.patchHash);
  assert.deepEqual(returned, [{ id: Object.keys(state.jobs)[0], key: null, cwd: final.cwd, patch: final.patch }], 'references carry paths only; state.json owns the final hashes');
  assert.match(await readFile(final.patch, 'utf8'), /shutdown\.txt/);
});

for (const quiescence of [true, false]) test(`SDK cleanup failure retains shutdown edits with quiescence=${quiescence}`, async t => {
  const f = await fixture(t, { body: "await run.agent('new work', { tools: [], isolation: 'snapshot' }); throw new Error('fixture-program-error');" });
  const cwd = join(f.root, 'source');
  await exec('git', ['init', '-q', cwd]);
  await exec('git', ['-C', cwd, 'add', '.']);
  await exec('git', ['-C', cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture']);
  const result = await run(f, 'resume', true, { FLUE_TEST_CLEANUP_FAILURE: quiescence ? 'sdk' : 'sdk,quiescence', FLUE_TEST_SHUTDOWN_EDIT: '1' });
  assert.equal(result.code, 1);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  const job = Object.values(state.jobs)[0];
  assert.equal(job.artifact.changed.includes('shutdown.txt'), quiescence, JSON.stringify(job.artifact));
  const patch = await readFile(job.artifact.patch, 'utf8');
  if (quiescence) assert.match(patch, /retained shutdown edit/);
  else {
    assert.doesNotMatch(patch, /retained shutdown edit/, 'uncertain writers forbid final artifact collection');
    assert.match(state.error, /fixture-unknown-command/);
  }
  assert.equal(await readFile(join(job.workspace.cwd, 'shutdown.txt'), 'utf8'), 'retained shutdown edit\n');
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.at(-1), { event: 'cleanup-observed', ownerActive: false, serverListening: false, forcedExit: false });
  assert.equal(state.status, 'failed');
  assert.equal(state.cleanShutdown, false);
  for (const expected of [/fixture-program-error/, /fixture-sdk-close-error/]) {
    assert.match(diagnostic(result), expected);
    assert.match(state.error, expected);
  }
});

for (const [name, source] of [
  ['tools.mjs', 'export const tools = {};'],
  ['tools.mjs', 'export default undefined;'],
  ['tools.mjs', 'export default null;'],
  ['tools.mjs', 'export default 42;'],
  ['tools.mjs', 'export default Promise.resolve({});'],
  ['tools.mjs', 'export default new Date();'],
  ['worker.mjs', 'export const hook = () => {};'],
  ['worker.mjs', 'export default undefined;'],
  ['worker.mjs', 'export default null;'],
]) {
  test(`present ${name} is validated before native startup: ${source}`, async t => {
    const f = await fixture(t, { extra: name });
    await writeFile(join(f.manifest.program, name), source);
    f.manifest.programHash = await hashTree(f.manifest.program, { exclude: ['node_modules', '.git'] });
    f.state.manifestHash = hash(json(f.manifest));
    await writeFile(join(f.dir, 'manifest.json'), json(f.manifest));
    await writeFile(join(f.dir, 'state.json'), json(f.state));
    const result = await run(f, 'resume');
    assert.equal(result.code, 1, result.stderr);
    assert.match(diagnostic(result), new RegExp(name.replace('.', '\\.')));
    assert.doesNotMatch(await readFile(f.trace, 'utf8'), /native-start/);
  });
}

test('changed saved configuration is refused before credentials or Flue startup', async t => {
  const f = await fixture(t);
  f.manifest.config.concurrency = 2;
  await writeFile(join(f.dir, 'manifest.json'), json(f.manifest));
  await refusedBeforeStartup(f, /Saved run configuration changed/);
});

test('lost pending snapshot is refused before credentials or Flue startup', async t => {
  const f = await fixture(t);
  await pending(f, 'snapshot');
  await refusedBeforeStartup(f, /no intact input workspace/);
});

for (const extra of ['tools.mjs', 'worker.mjs']) {
  test(`pending custom effects from ${extra} are refused before startup`, async t => {
    const f = await fixture(t, { extra });
    await pending(f);
    await refusedBeforeStartup(f, /Custom effects are not tracked/);
  });
}

test('recovery observation failure is actionable and admits no new work', async t => {
  const f = await fixture(t);
  await pending(f);
  const result = await run(f, 'resume', true, { FLUE_TEST_RECOVERY_ERROR: '1' });
  assert.equal(result.code, 1);
  const state = JSON.parse(await readFile(join(f.dir, 'state.json')));
  assert.match(state.error, /simulated store read failure/);
  assert.doesNotMatch(await readFile(f.trace, 'utf8'), /new-admission/);
});

test('a lost receipt is reconstructed from the same recorded request', async t => {
  const f = await fixture(t);
  await pending(f);
  f.state.jobs['old-worker'].receipt = null;
  await writeFile(join(f.dir, 'state.json'), json(f.state));
  const result = await run(f, 'resume');
  assert.equal(result.code, 0, result.stderr);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.filter(row => row.event === 'old-dispatch-deduplicated').length, 1);
});

test('new work waits for the native recovered set, preserving concurrency', async t => {
  const f = await fixture(t);
  await pending(f);
  const result = await run(f, 'resume');
  assert.equal(result.code, 0, result.stderr);
  const rows = (await readFile(f.trace, 'utf8')).trim().split('\n').map(JSON.parse);
  const recovered = rows.findIndex(row => row.event === 'native-settled' && row.id === 'old-worker');
  const admitted = rows.findIndex(row => row.event === 'new-admission');
  assert.ok(recovered >= 0 && admitted > recovered, JSON.stringify(rows));
  assert.ok(rows.every(row => row.active === undefined || row.active <= 1));
});
