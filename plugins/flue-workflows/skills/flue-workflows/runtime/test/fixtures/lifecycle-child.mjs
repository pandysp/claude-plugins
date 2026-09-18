// The native runtime is the boundary under test. No provider/model is called.
import { registerHooks } from 'node:module';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { appendFileSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { createServer, createConnection, Server } from 'node:net';
import { registerSessionResourceCleanup } from '@earendil-works/pi-ai';
import { lease, ownerActive, save, load } from '../../lib/files.mjs';
import { commandTracker, requireRunQuiescence, commandStatus } from '../../lib/commands.mjs';
import { loader, checkProgram } from '../../lib/program.mjs';
import { join, dirname } from 'node:path';
import { local, sqlite } from '@flue/runtime/node';
import { AgentRunError } from '@flue/runtime';
import { extensionScope as ownExtensions } from '../../lib/extensions.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const [workspace, mode, program, trace] = process.argv.slice(2);
const record = event => appendFileSync(trace, JSON.stringify(event) + '\n');
const failures = new Set((process.env.FLUE_TEST_CLEANUP_FAILURE ?? '').split(','));
let ownerReleased = false;
const close = (name, fn) => (...args) => {
  record({ event: `${name}-close` });
  const result = fn(...args);
  if (name === 'owner') ownerReleased = true;
  if (failures.has(name)) throw new Error(`fixture-${name}-close-error`);
  return result;
};
const closable = (name, resource) => {
  resource.close = close(name, resource.close.bind(resource));
  return resource;
};
let server;
const controllerFailure = process.env.FLUE_TEST_CONTROLLER_FAILURE;
const serverFailure = stage => {
  record({ event: 'controller-error-emitted', stage });
  server.emit('error', new Error(`fixture-${stage}-server-error`));
};
let extensionWork;
let pendingWrites = 0;
let active = 0;
let lateCancelFailures = 0;
let startupDatabase, startupStore;
const clients = new Map();
globalThis.__flueTestBoundary = { local, sqlite, AgentRunError,
  extensionScope: (...args) => (extensionWork = ownExtensions(...args)),
  start: async options => {
  const state = JSON.parse(await readFile(join(workspace, 'runs', 'fixture', 'state.json')));
  active = Object.values(state.jobs).filter(job => job.status === 'pending').length;
  await record({ event: 'native-start', active });
  await options.db.migrate(); // real start() creates the native store file
  if (failures.has('start')) throw new Error('fixture-runtime-start-error');
  if (failures.has('extension-start')) {
    // Exercise the real ownership scope while the native start boundary is pending.
    try {
      extensionWork.invoke('fixture startup extension', () => (async () => {
        await delay(80);
        const dir = join(workspace, 'runs', 'fixture');
        const latest = await load(join(dir, 'state.json'));
        record({ event: 'startup-extension-effect', ownerActive: ownerActive(join(dir, 'owner.sqlite')), cleanShutdown: latest.cleanShutdown });
        throw new Error('fixture-extension-start-rejection');
      })(), []);
    } catch (error) {
      if (!extensionWork.failures.includes(error)) throw error;
    }
    throw new Error('fixture-runtime-start-error');
  }
  if (controllerFailure === 'server') setImmediate(() => serverFailure('live'));
  if (controllerFailure === 'server-during-start') {
    startupDatabase = options.db;
    await startupDatabase.migrate();
    startupStore = (await startupDatabase.connect()).submissionStore;
    active = 0; serverFailure('during-start');
  }
  if (['valid-cancel', 'malformed-client'].includes(controllerFailure)) {
    const client = createConnection(state.owner.socket);
    client.on('error', error => record({ event: 'fixture-client-error', message: error.message }));
    client.on('connect', () => client.end(controllerFailure === 'valid-cancel' ? JSON.stringify({ nonce: state.owner.nonce, action: 'cancel' }) + '\n' : 'not-json\n'));
    client.on('data', bytes => record({ event: 'fixture-client-reply', reply: bytes.toString() }));
  }
  if (['socket-journal', 'socket-timeout'].includes(controllerFailure)) {
    const client = createConnection(state.owner.socket);
    client.on('error', error => record({ event: 'fixture-client-error', message: error.message }));
  }
  return { stop: async () => {
    record({ event: 'native-stop' });
    if (startupDatabase) await startupDatabase.close();
    if (['cancel-journal-during-stop', 'cancel-during-stop'].includes(controllerFailure)) {
      for (let i = 0; i < 2; i++) {
        const client = createConnection(state.owner.socket);
        await new Promise((resolve, reject) => {
          client.on('error', reject);
          client.on('connect', () => client.end(JSON.stringify({ nonce: state.owner.nonce, action: 'cancel' }) + '\n'));
          client.on('data', bytes => record({ event: 'fixture-client-reply', request: i, reply: bytes.toString() }));
          client.on('close', resolve);
        });
      }
    }
    if (controllerFailure === 'server-stop') serverFailure('stop');
    if (controllerFailure === 'server-stop-shared-abort') server.emit('error', globalThis.__flueTestControllerSignal.reason);
    if (failures.has('runtime-shared-abort')) throw globalThis.__flueTestControllerSignal.reason;
    if (process.env.FLUE_TEST_SHUTDOWN_EDIT) {
      const latest = JSON.parse(await readFile(join(workspace, 'runs', 'fixture', 'state.json')));
      for (const job of Object.values(latest.jobs)) if (job.workspace) await writeFile(join(job.workspace.cwd, 'shutdown.txt'), 'retained shutdown edit\n');
    }
    if (failures.has('missing-record')) {
      const dir = join(workspace, 'runs', 'fixture');
      const events = (await readFile(join(dir, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
      const command = events.find(event => event.type === 'command-created');
      if (!command) throw new Error('Fixture needs a real capability command record');
      await rm(join(dir, 'commands', `${command.id}.json`));
      record({ event: 'command-record-removed', id: command.id });
    }
    if (failures.has('quiescence')) await writeFile(join(workspace, 'runs', 'fixture', 'commands', 'unknown.json'), JSON.stringify({ id: 'fixture-unknown-command', pid: null, status: 'starting' }));
    if (failures.has('runtime')) throw new Error('fixture-runtime-stop-error');
    if (failures.has('runtime-abort')) throw new DOMException('fixture-runtime-stop-abort', 'AbortError');
  } };
}, init: (_, { id }) => {
  if (clients.has(id)) return clients.get(id);
  let completion;
  const receipt = { submissionId: id, uid: id, acceptedAt: '2026-01-01T00:00:00.000Z' };
  const client = {
    dispatch: async input => {
      if (id === 'old-worker' && controllerFailure === 'server-during-start') {
        // The mock dispatch must honor the adapter supplied by the controller;
        // otherwise it bypasses the very native acceptance boundary under test.
        await startupStore.admitDispatch({ submissionId: receipt.submissionId, agent: 'workflow-worker', id,
          message: { kind: 'user', body: input.message }, initialData: input.initialData, acceptedAt: receipt.acceptedAt });
        active++; record({ event: 'receiptless-recovery-admitted', active }); return receipt;
      }
      if (id === 'old-worker') {
        if (input.message !== 'old work' || input.initialData.prompt !== 'old work' || input.idempotencyKey !== 'workflow-job-v1') throw new Error('Recovery changed the recorded request');
        await record({ event: 'old-dispatch-deduplicated' });
        return { ...receipt, deduplicated: true };
      }
      if (++active > 1) throw new Error('Recovered workers overlap fresh admission');
      await record({ event: 'new-admission', active });
      return receipt;
    },
    read: () => completion ??= (async () => {
      if (id === 'old-worker' && process.env.FLUE_TEST_RECOVERY_ERROR) throw new Error('simulated store read failure');
      await new Promise(resolve => setTimeout(resolve, id === 'old-worker' ? 80 : 5));
      active--;
      await record({ event: 'native-settled', id, active });
      return { text: 'checked', data: {} };
    })(),
    abort: async () => { active = 0; completion = Promise.resolve({ text: 'checked', data: {} }); },
  };
  clients.set(id, client);
  return client;
}, appendFileSync: (fd, text) => {
    if (controllerFailure === 'cancel-journal-during-stop' && JSON.parse(text).type === 'cancel-requested') {
      const error = new Error(`fixture-late-cancel-journal-error-${++lateCancelFailures}`);
      record({ event: 'fixture-journal-fault', message: error.message });
      throw error;
    }
    if (process.env.FLUE_TEST_CONTROLLER_REPORT_ERROR && JSON.parse(text).type === 'controller-failed') throw new Error('fixture-controller-report-error');
    if (controllerFailure === 'socket-journal' && JSON.parse(text).type === 'control-error') throw new Error('fixture-control-journal-error');
    if (failures.has('emit') && JSON.parse(text).type === 'run-failed') throw new Error('fixture-journal-write-error');
    return appendFileSync(fd, text);
  }, openSync, closeSync: close('journal', closeSync), fsyncSync,
  lease: path => close('owner', lease(path)),
  inspectLoad: path => {
    if (ownerReleased && process.env.FLUE_TEST_INSPECTION_ERROR && path.endsWith('/state.json')) throw new Error('fixture-inspection-error');
    return load(path);
  },
  save: async (path, value) => {
    if (path.endsWith('/state.json')) {
      if (controllerFailure === 'server-before-dispatch' && value.status === 'running' && Object.values(value.jobs).some(job => job.status === 'pending' && !job.receipt) && ++pendingWrites === 2) serverFailure('before-dispatch');
      if (failures.has('persist') && value.status !== 'running') throw new Error('fixture-terminal-persist-error');
      if (failures.has('write') && value.status === 'running' && Object.values(value.jobs).some(job => job.status === 'pending')) throw new Error('fixture-worker-persist-error');
    }
    return save(path, value);
  },
  createServer: (...args) => {
    server = createServer(...args);
    return closable('server', server);
  },
  commandTracker: (...args) => closable('tracker', commandTracker(...args)), requireRunQuiescence, commandStatus,
  loader: async (...args) => {
    const code = await loader(...args);
    if (controllerFailure === 'server-before-start') serverFailure('before-start');
    return closable('loader', code);
  }, checkProgram,
};
const observed = new Map([
  ['node:fs', ['appendFileSync', 'openSync', 'closeSync', 'fsyncSync']],
  ['node:net', ['createServer']],
  ['./commands.mjs', ['commandTracker', 'requireRunQuiescence', 'commandStatus']],
  ['./program.mjs', ['loader', 'checkProgram']],
  ['./extensions.mjs', ['extensionScope']],
]);
registerHooks({
  resolve(specifier, context, next) {
    if (['@flue/runtime', '@flue/runtime/node'].includes(specifier)) return { url: 'flue-test:boundary', shortCircuit: true };
    if (context.parentURL?.endsWith('/lib/cli.mjs') && specifier === './files.mjs') return { url: 'flue-test:inspection', shortCircuit: true };
    if (context.parentURL?.endsWith('/lib/run.mjs')) {
      if (observed.has(specifier)) return { url: `flue-test:observe:${specifier}`, shortCircuit: true };
      if (specifier === './files.mjs') return { url: 'flue-test:files', shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'flue-test:boundary') return { format: 'module', source: 'export const { local, sqlite, AgentRunError, start, init } = globalThis.__flueTestBoundary;', shortCircuit: true };
    if (url.startsWith('flue-test:observe:')) return { format: 'module', source: `export const { ${observed.get(url.slice('flue-test:observe:'.length)).join(', ')} } = globalThis.__flueTestBoundary;`, shortCircuit: true };
    if (url === 'flue-test:inspection') return { format: 'module', source: `export * from ${JSON.stringify(new URL('../../lib/files.mjs', import.meta.url).href)}; export const load = globalThis.__flueTestBoundary.inspectLoad;`, shortCircuit: true };
    if (url === 'flue-test:files') return { format: 'module', source: `export * from ${JSON.stringify(new URL('../../lib/files.mjs', import.meta.url).href)}; export const { lease, save } = globalThis.__flueTestBoundary;`, shortCircuit: true };
    return next(url, context);
  },
});
const { cli } = await import('../../lib/cli.mjs');
const runArgs = ['run', program, '--id', 'fixture', '--cwd', dirname(program), '--model', 'openai/gpt-4.1', '--auth', 'env:FLUE_OFFLINE_TEST_KEY', '--access', 'unrestricted', '--concurrency', '1'];
if (mode === 'prepare') {
  process.env.FLUE_TEST_PREPARING = '1';
  await cli(workspace, runArgs);
} else {
  delete process.env.FLUE_TEST_PREPARING;
  if (process.env.FLUE_TEST_CLEANUP_FAILURE) registerSessionResourceCleanup(() => {
    record({ event: 'sdk-cleanup' });
    if (failures.has('sdk')) throw new Error('fixture-sdk-close-error');
  });
  await cli(workspace, mode === 'run' ? runArgs : ['resume', 'fixture']);
  if (process.env.FLUE_TEST_CLEANUP_FAILURE) {
    // Observe leaks while the controller process is still alive. Forced fixture
    // exit is recorded, never mistaken for the runner releasing its own lease.
    const owned = ownerActive(join(workspace, 'runs', 'fixture', 'owner.sqlite'));
    const listening = server?.listening ?? false;
    record({ event: 'cleanup-observed', ownerActive: owned, serverListening: listening, forcedExit: owned || listening });
    if (owned || listening) {
      if (listening) await new Promise((resolve, reject) => Server.prototype.close.call(server, error => error ? reject(error) : resolve()));
      process.exit(1);
    }
  }
}
