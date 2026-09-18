import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { lease, save } from '../lib/files.mjs';

const exec = promisify(execFile);
const cli = new URL('../lib/cli.mjs', import.meta.url).href;
const terminalWorkers = ['completed', 'failed', 'aborted', 'not-started', 'completed-uncollected'];

async function cancel(t, { status = 'cancelled', clean = true, workers = terminalWorkers, command, journal = true, error = null, race = false, ownerError = false } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'flue-cancel-'));
  const dir = join(workspace, 'runs', 'fixture');
  await mkdir(dir, { recursive: true });
  const nonce = randomUUID();
  const socketPath = `/tmp/flue-cancel-${nonce}.sock`;
  let release = lease(join(dir, 'owner.sqlite'));
  let child;
  let childExited;
  let server;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) process.kill(-child.pid, 'SIGTERM');
    if (childExited) await childExited;
    release?.();
    if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(workspace, { recursive: true });
  });
  const commandId = randomUUID();
  if (command) {
    await mkdir(join(dir, 'commands'));
    if (command === 'active' || command === 'incomplete') {
      child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { detached: true, stdio: 'ignore' });
      childExited = once(child, 'exit');
      await once(child, 'spawn');
      process.kill(-child.pid, 0);
    }
    if (command === 'malformed') await writeFile(join(dir, 'commands', `${commandId}.json`), '{"broken":');
    else if (command !== 'missing') await save(join(dir, 'commands', `${commandId}.json`), {
      id: commandId, ...(command === 'incomplete' ? {} : { worker: 'worker' }), pid: child?.pid ?? null, status: child ? 'spawned' : 'starting',
    });
  }
  if (journal) await writeFile(join(dir, 'events.jsonl'), command ? JSON.stringify({ type: 'command-created', id: commandId, worker: 'worker' }) + '\n' : '');
  const manifest = { id: 'fixture', config: { model: 'fixture/no-model', auth: 'none-used', access: 'unrestricted' } };
  const state = { status: 'running', cleanShutdown: false, owner: { pid: process.pid, socket: socketPath, nonce },
    jobs: Object.fromEntries(workers.map((status, i) => [`worker-${i}`, { id: `worker-${i}`, key: null, status, descriptor: { label: '' }, error: null, receipt: null, artifact: null }])),
    calls: 0, reused: 0, reattached: 0, compositionErrors: 0, toolErrors: 0, error: null };
  await save(join(dir, 'manifest.json'), manifest);
  await save(join(dir, 'state.json'), state);
  const acknowledged = Promise.withResolvers();
  server = createServer(socket => {
    let request = '';
    socket.setEncoding('utf8');
    socket.on('data', data => {
      request += data;
      if (!request.includes('\n')) return;
      void (async () => {
        assert.deepEqual(JSON.parse(request), { action: 'cancel', nonce });
        // Script the owner outcome, not the cancel client or process liveness.
        if (race) {
          await writeFile(join(workspace, 'acknowledged'), '');
          socket.end('{"requested":true}\n');
          const deadline = Date.now() + 4000;
          while (!existsSync(join(workspace, 'observing'))) {
            assert.ok(Date.now() < deadline, 'Fixture did not observe the cancel poll');
            await new Promise(resolve => setTimeout(resolve, 2));
          }
        }
        await save(join(dir, 'state.json'), { ...state, status, cleanShutdown: clean, error });
        release(); release = null;
        if (race) await writeFile(join(workspace, 'released'), '');
        else socket.end('{"requested":true}\n');
      })().then(acknowledged.resolve, cause => { socket.destroy(); acknowledged.reject(cause); });
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  const interleave = race || ownerError ? `
    import { registerHooks } from 'node:module';
    import { existsSync, writeFileSync } from 'node:fs';
    const files = await import(${JSON.stringify(new URL('../lib/files.mjs', import.meta.url).href)});
    let reads = 0, checks = 0, observed = false;
    const notify = () => writeFileSync(${JSON.stringify(join(workspace, 'observing'))}, '');
    globalThis.__cancelRace = {
      load: async path => {
        const value = await files.load(path);
        if (${race} && path.endsWith('/state.json') && ++reads === 2) notify();
        return value;
      },
      ownerActive: path => {
        if (${ownerError} && ++checks === 3) throw new Error('fixture-final-lease-error');
        if (${race} && !observed && existsSync(${JSON.stringify(join(workspace, 'acknowledged'))})) {
          observed = true; notify();
          const deadline = Date.now() + 4000;
          while (!existsSync(${JSON.stringify(join(workspace, 'released'))})) {
            if (Date.now() > deadline) throw new Error('Fixture lease handoff timed out');
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
          }
        }
        return files.ownerActive(path);
      },
    };
    registerHooks({
      resolve(name, context, next) {
        if (name === './files.mjs' && context.parentURL?.endsWith('/lib/cli.mjs')) return { url: 'cancel-test:race', shortCircuit: true };
        return next(name, context);
      },
      load(url, context, next) {
        if (url === 'cancel-test:race') return { format: 'module', source: ${JSON.stringify(`export * from ${JSON.stringify(new URL('../lib/files.mjs', import.meta.url).href)}; export const { load, ownerActive } = globalThis.__cancelRace;`)}, shortCircuit: true };
        return next(url, context);
      },
    });
  ` : '';
  let result;
  try {
    result = { ...await exec(process.execPath, ['--input-type=module', '-e', `${interleave} const {cli} = await import(${JSON.stringify(cli)}); await cli(${JSON.stringify(workspace)}, ['cancel', 'fixture']);`], { timeout: 5000 }), code: 0, killed: false };
  } catch (error) {
    if (typeof error.code !== 'number' && !error.killed) throw error;
    result = { code: error.code, killed: error.killed, stdout: error.stdout, stderr: error.stderr };
  }
  await acknowledged.promise;
  if (child) process.kill(-child.pid, 0); // cancel must report the survivor, not secretly kill it.
  return { ...result, commandId, group: child?.pid };
}

for (const status of ['cancelled', 'finished']) test(`cancel confirms clean ${status} with known terminal workers`, async t => {
  const result = await cancel(t, { status });
  assert.equal(result.code, 0, result.stderr);
  const summaries = result.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].execution, status);
  assert.equal(summaries[0].ownerActive, false);
  assert.equal(summaries[0].cleanShutdown, true);
});

test('cancel refreshes state when a state read races with terminal save and lease release', async t => {
  const result = await cancel(t, { race: true });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout.trim()).execution, 'cancelled');
});

test('cancel preserves cleanup cause and command context when a command record is malformed', async t => {
  const result = await cancel(t, { clean: false, error: 'fixture-sdk-cleanup-cause', command: 'malformed' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Cancellation not confirmed/);
  assert.match(result.stderr, /fixture-sdk-cleanup-cause/);
  assert.ok(result.stderr.includes(result.commandId), result.stderr);
});

test('cancel preserves cleanup and live-group causes when final summary rendering fails', async t => {
  const result = await cancel(t, { clean: false, error: 'fixture-sdk-cleanup-cause', command: 'incomplete' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Cancellation not confirmed/);
  assert.match(result.stderr, /fixture-sdk-cleanup-cause/);
  assert.ok(result.stderr.includes(String(result.group)), result.stderr);
  assert.match(result.stderr, /finite, acyclic JSON/);
});

test('cancel preserves cleanup and live-group causes when the ownership recheck fails', async t => {
  const result = await cancel(t, { clean: false, error: 'fixture-sdk-cleanup-cause', command: 'active', ownerError: true });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Cancellation not confirmed/);
  assert.match(result.stderr, /fixture-sdk-cleanup-cause/);
  assert.ok(result.stderr.includes(String(result.group)), result.stderr);
  assert.match(result.stderr, /fixture-final-lease-error/);
});

for (const [name, options, expected] of [
  ['unclean shutdown', { clean: false, error: 'fixture-sdk-cleanup-error' }, /fixture-sdk-cleanup-error/],
  ['failed execution', { status: 'failed' }, /failed/],
  ['unknown execution', { status: 'unknown' }, /unknown/],
  ['pending workers', { workers: ['pending'] }, /pending/],
  ['unknown workers', { workers: ['unexpected'] }, /unexpected/],
  ['surviving process group', { command: 'active' }, /command|group/i],
  ['unknown process identity', { command: 'unknown' }, /unknown/i],
  ['missing ownership record', { command: 'missing' }, /missing|unreadable/i],
  ['missing journal', { journal: false }, /journal|events\.jsonl/i],
  ['owner death before terminal save', { status: 'running', clean: false }, /interrupted|running/i],
]) test(`cancel refuses ${name} after acknowledgement and owner exit`, async t => {
  const result = await cancel(t, options);
  assert.equal(result.killed, false, 'cancel waited after the owner was already gone');
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /^flue: /m);
  assert.match(result.stderr, expected);
  if (options.command === 'active') assert.ok(result.stderr.includes(String(result.group)), result.stderr);
  if (options.command === 'missing' || options.command === 'unknown') assert.ok(result.stderr.includes(result.commandId), result.stderr);
});
