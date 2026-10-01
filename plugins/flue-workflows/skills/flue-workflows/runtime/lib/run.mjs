import { appendFileSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { stat, access, realpath, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { start, sqlite } from '@flue/runtime/node';
import { cleanupSessionResources } from '@earendil-works/pi-ai';
import { primitives, concurrency, RunError, message, fatal } from './primitives.mjs';
import { json, load, save, lease } from './files.mjs';
import { collect } from './workspace.mjs';
import { credentials } from './provider.mjs';
import { workers } from './workers.mjs';
import { job } from './jobs.mjs';
import { recordCommands, liveCommandGroups } from './commands.mjs';
import { loader, hashProgram } from './program.mjs';

const QUIET = new Set(['tool-start', 'tool-completed', 'result-written', 'command']);
const cancelled = error => error?.name === 'AbortError';

async function optionalModule(root, code, name) {
  try { await access(join(root, name)); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  const module = await code.load(name);
  if (module.default === undefined) throw new RunError(`${name} must export a default value.`);
  return module.default;
}

// `type:call` keys of tool steps earlier attempts already journaled.
async function journaledToolSteps(dir) {
  let text;
  try { text = await readFile(join(dir, 'events.jsonl'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return new Set(); throw error; }
  return new Set(text.split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.type.startsWith('tool-')).map(row => `${row.type}:${row.call}`));
}

// Refuse to start when the saved run no longer matches what created it.
async function preflight({ dir, manifest, state }) {
  if (await hashProgram(manifest.program) !== manifest.programHash) throw new RunError('Pinned program changed; restore it or create a new run.');
  const live = await liveCommandGroups(dir);
  if (live.length) throw new RunError(`Shell commands from a previous attempt are still running (process groups ${live.join(', ')}); stop them, then resume.`);
  for (const job of Object.values(state.jobs)) {
    if (!job.workspace) continue;
    try { await stat(join(job.workspace.cwd, '.git')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      throw new RunError(`Retained workspace for ${job.id} is missing; create a new run.`);
    }
  }
}

export async function execute({ dir, runtimeRoot }) {
  [dir, runtimeRoot] = await Promise.all([realpath(dir), realpath(runtimeRoot)]);
  const release = lease(join(dir, 'owner.sqlite'));
  try { return await executeOwned({ dir, runtimeRoot }); }
  finally { release(); }
}

// The program and everything it calls, against an attempt that is already set up.
async function runProgram(run, { manifest, code, normalize }) {
  const { config, state, signal } = run;
  const gate = concurrency(config.concurrency, signal);
  async function program(name, args, namespace) {
    signal.throwIfAborted();
    const module = await code.load(name);
    if (typeof module.default !== 'function') throw new RunError(`${name} must export a default async function (run, args).`);
    let childIndex = 0;
    const api = primitives({
      emit: run.emit,
      budget: Object.freeze({ maxJobs: config.maxJobs, spent: () => Object.keys(state.jobs).length, remaining: () => config.maxJobs - Object.keys(state.jobs).length }),
      invoke: (prompt, options) => {
        const promise = (async () => {
          signal.throwIfAborted();
          const descriptor = normalize(prompt, options);
          return gate(() => job(run, { namespace, descriptor, key: options.key }));
        })().catch(error => {
          // Infrastructure, configuration and admission failures are not item results: they stop
          // the run even when the program never awaits this promise or catches the rejection.
          const failure = fatal(error) ? error : new RunError('Worker operation failed', { cause: error });
          run.fail(failure);
          throw failure;
        });
        run.pending.add(promise);
        promise.finally(() => run.pending.delete(promise)).catch(() => {});
        return promise;
      },
      child: (childName, childArgs = null) => program(childName, childArgs, `${namespace}/${childName}:${childIndex++}`),
    });
    api.artifacts = () => Object.values(state.jobs).filter(job => job.artifact).map(job => ({ id: job.id, key: job.key, cwd: job.artifact.cwd, patch: job.artifact.patch }));
    api.signal = signal;
    return module.default(Object.freeze(api), args);
  }
  const result = await program(manifest.entry, manifest.args, manifest.entry);
  if (run.pending.size) throw new RunError(`Program returned with ${run.pending.size} unawaited worker calls.`);
  signal.throwIfAborted();
  return result;
}

// Stop every worker, Flue and the recorder; keep partial output of stopped snapshot workers.
async function shutdown(run, { runtime, code, stopRecording }) {
  const { state, dir, attempt } = run;
  if (!run.signal.aborted) run.controller.abort(new DOMException('Run shutting down', 'AbortError'));
  await Promise.allSettled([...run.pending, ...run.aborts]);
  if (runtime) await attempt(() => runtime.stop());
  if (runtime) await attempt(() => cleanupSessionResources());
  // Workers stopped by this shutdown may have edited after dispatch.
  for (const id of run.dispatched) {
    const job = state.jobs[id];
    if (job.workspace && job.status !== 'completed') await attempt(async () => { job.artifact = await collect(job.workspace.cwd, job.workspace.commit, join(dir, `${id}.patch`)); });
  }
  stopRecording?.();
  await attempt(() => code?.close());
}

async function executeOwned({ dir, runtimeRoot }) {
  const manifest = await load(join(dir, 'manifest.json'));
  const state = await load(join(dir, 'state.json'));
  const { config } = manifest;
  const controller = new AbortController();
  const errors = [];
  let journal, writing = Promise.resolve();
  const run = {
    dir, runtimeRoot, config, state, controller, signal: controller.signal, errors,
    handles: new Map(), dispatched: new Set(), pending: new Set(), aborts: [], occurrences: new Map(),
    attempt: async fn => { try { return await fn(); } catch (error) { errors.push(error); } },
    persist: () => (writing = writing.then(() => save(join(dir, 'state.json'), state))),
    emit(event) {
      const row = { at: new Date().toISOString(), attempt: state.attempt, ...event };
      appendFileSync(journal, json(row) + '\n'); fsyncSync(journal);
      if (event.type === 'composition-failed') state.compositionErrors++;
      if (event.type === 'tool-failed') state.toolErrors++;
      if (!QUIET.has(event.type)) console.error(json(row));
    },
    // The first fatal failure aborts the attempt; every distinct one is reported.
    fail(error) {
      if (cancelled(error) || errors.includes(error)) return;
      errors.push(error);
      if (!controller.signal.aborted) controller.abort(error);
    },
  };
  // One abort path: whoever aborts the controller also aborts every live worker.
  run.signal.addEventListener('abort', () => { for (const handle of run.handles.values()) run.aborts.push(run.attempt(() => handle.abort())); });
  const onSignal = () => {
    if (run.signal.aborted) process.exit(1);
    run.emit({ type: 'cancel-requested' });
    controller.abort(new DOMException('Cancellation requested', 'AbortError'));
  };
  const resources = {};
  let result;
  try {
    await preflight({ dir, manifest, state });
    run.journaled = await journaledToolSteps(dir);
    const { provider, source } = await credentials(config);
    Object.assign(state, { attempt: randomUUID(), status: 'running', owner: { pid: process.pid }, error: null, calls: 0, reused: 0, compositionErrors: 0, toolErrors: 0 });
    await run.persist();
    journal = openSync(join(dir, 'events.jsonl'), 'a', 0o600);
    run.emit({ type: 'run-started', auth: source, model: config.model });
    process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
    resources.stopRecording = recordCommands(pid => run.emit({ type: 'command', pid }));
    const code = resources.code = await loader(manifest.program, runtimeRoot);
    const tools = await optionalModule(manifest.program, code, 'tools.mjs');
    const hook = await optionalModule(manifest.program, code, 'worker.mjs');
    const { Worker, normalize } = workers({ config, provider, tools, hook, emit: run.emit });
    run.Worker = Worker;
    resources.runtime = await start({ agents: [Worker], db: sqlite(join(dir, 'flue.sqlite')), providers: [provider] });
    result = await runProgram(run, { manifest, code, normalize });
    await save(join(dir, 'result.json'), result);
  } catch (error) {
    if (!errors.includes(error)) errors.push(error);
  } finally {
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    await shutdown(run, resources);
  }
  if (journal !== undefined) {
    const decide = () => {
      const failures = errors.filter(error => !cancelled(error));
      state.status = failures.length ? 'failed' : errors.length ? 'cancelled' : 'finished';
      state.error = errors.length ? (failures.length ? failures : errors).map(message).join('; ') : null;
    };
    decide();
    await run.attempt(() => run.emit(state.status === 'finished' ? { type: 'program-finished', result: join(dir, 'result.json') } : { type: 'run-failed', message: state.error }));
    await run.attempt(() => closeSync(journal));
    await run.attempt(() => writing);
    decide(); // the final journal writes can fail too
    state.owner = null;
    await run.attempt(() => save(join(dir, 'state.json'), state));
  }
  if (errors.length) throw errors.length === 1 ? errors[0] : new AggregateError(errors, 'Workflow execution or cleanup failed');
  return state;
}
