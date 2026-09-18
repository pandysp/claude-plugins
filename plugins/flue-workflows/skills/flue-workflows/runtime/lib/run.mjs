import { appendFileSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { mkdir, stat, access, realpath, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { init, AgentRunError } from '@flue/runtime';
import { start, sqlite } from '@flue/runtime/node';
import { cleanupSessionResources } from '@earendil-works/pi-ai';
import { primitives, concurrency, RunError, message, fatal } from './primitives.mjs';
import { hash, json, load, save, lease } from './files.mjs';
import { snapshot, collect } from './workspace.mjs';
import { credentials } from './provider.mjs';
import { workers, validator } from './workers.mjs';
import { recordCommands, liveCommandGroups } from './commands.mjs';
import { loader, checkProgram } from './program.mjs';

export const FORMAT = 3;
const QUIET = new Set(['tool-start', 'tool-completed', 'result-written', 'command']);

async function optionalModule(root, code, name) {
  try { await access(join(root, name)); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  const module = await code.load(name);
  if (module.default === undefined) throw new RunError(`${name} must export a default value.`);
  return module.default;
}

// Refuse to start when the saved run no longer matches what created it.
async function preflight({ dir, manifest, state }) {
  if (manifest.format !== FORMAT) throw new RunError('Unknown run format; use the runtime that created this run.');
  if (state.manifestHash !== hash(json(manifest))) throw new RunError('Saved run configuration changed; restore it or create a new run.');
  if (await checkProgram(manifest.program) !== manifest.programHash) throw new RunError('Pinned program changed; restore it or create a new run.');
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
  const manifest = await load(join(dir, 'manifest.json'));
  const state = await load(join(dir, 'state.json'));
  const { config } = manifest;
  const controller = new AbortController();
  const { signal } = controller;
  const cancellation = new DOMException('Cancellation requested', 'AbortError');
  const handles = new Map();
  const dispatched = new Set();
  const pending = new Set();
  const aborts = [];
  const errors = [];
  const attempt = async fn => { try { return await fn(); } catch (error) { errors.push(error); } };
  let journal, runtime, code, stopRecording, writing = Promise.resolve();

  const persist = () => (writing = writing.then(() => save(join(dir, 'state.json'), JSON.parse(json(state)))));
  const emit = event => {
    const row = { at: new Date().toISOString(), attempt: state.attempt, ...event };
    appendFileSync(journal, json(row) + '\n'); fsyncSync(journal);
    if (event.type === 'composition-failed') state.compositionErrors++;
    if (event.type === 'tool-failed') state.toolErrors++;
    if (!QUIET.has(event.type)) console.error(json(row));
  };
  // One abort path: whoever aborts the controller also aborts every live worker.
  signal.addEventListener('abort', () => { for (const handle of handles.values()) aborts.push(attempt(() => handle.abort())); });
  let signals = 0;
  const onSignal = () => {
    if (signals++) process.exit(1);
    emit({ type: 'cancel-requested' });
    controller.abort(cancellation);
  };

  try {
    await preflight({ dir, manifest, state });
    const { provider, source } = await credentials(config);
    Object.assign(state, { attempt: randomUUID(), status: 'running', owner: { pid: process.pid }, error: null, calls: 0, reused: 0, compositionErrors: 0, toolErrors: 0 });
    await persist();
    journal = openSync(join(dir, 'events.jsonl'), 'a', 0o600);
    emit({ type: 'run-started', auth: source, model: config.model });
    process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
    stopRecording = recordCommands(pid => emit({ type: 'command', pid }));
    code = await loader(manifest.program, runtimeRoot);
    const tools = await optionalModule(manifest.program, code, 'tools.mjs');
    const hook = await optionalModule(manifest.program, code, 'worker.mjs');
    const { Worker, normalize } = workers({ config, provider, tools, hook, emit });
    runtime = await start({ agents: [Worker], db: sqlite(join(dir, 'flue.sqlite')), providers: [provider] });
    signal.throwIfAborted();
    const gate = concurrency(config.concurrency, signal);
    const occurrences = new Map();

    async function invoke(namespace, descriptor, key) {
      signal.throwIfAborted();
      descriptor.cwd = await realpath(resolve(config.cwd, descriptor.cwd));
      if (!(await stat(descriptor.cwd)).isDirectory()) throw new RunError(`Working directory is not a directory: ${descriptor.cwd}`);
      if (runtimeRoot.startsWith(descriptor.cwd + sep) || dir.startsWith(descriptor.cwd + sep)) throw new RunError('Working directories must not contain the workflow workspace.');
      const identity = hash(json(descriptor));
      const occurrenceKey = `${namespace}:${identity}`;
      const occurrence = occurrences.get(occurrenceKey) ?? 0;
      occurrences.set(occurrenceKey, occurrence + 1);
      const id = 'worker-' + hash(key === undefined ? `${occurrenceKey}:${occurrence}` : `${namespace}:key:${key}`);
      let job = state.jobs[id];
      if (handles.has(id)) throw new RunError(`Key ${key} is already running; await its promise instead of calling it twice.`);
      if (job && job.identity !== identity) throw new RunError(`Key ${key} was reused with different inputs; use a distinct key.`);
      state.calls++;
      const { label, phase } = descriptor;
      if (job && job.status !== 'pending') {
        state.reused++;
        emit({ type: 'worker-reused', id, label, phase, status: job.status });
        await persist();
        return job.status === 'completed' ? structuredClone(job.result) : null;
      }
      if (!job) {
        if (Object.keys(state.jobs).length >= config.maxJobs) throw new RunError(`Run-wide worker limit ${config.maxJobs} reached; no new worker was admitted.`);
        job = { id, key: key ?? null, namespace, identity, descriptor, status: 'pending', receipt: null, result: null, error: null, artifact: null, workspace: null };
        if (descriptor.isolation === 'snapshot') {
          const cwd = join(dir, 'workspaces', id);
          await mkdir(join(dir, 'workspaces'), { recursive: true });
          await rm(cwd, { recursive: true, force: true });
          job.workspace = { cwd, ...await snapshot(descriptor.cwd, cwd) };
        }
        state.jobs[id] = job;
        await persist();
      }
      signal.throwIfAborted();
      const task = { ...descriptor, cwd: job.workspace?.cwd ?? descriptor.cwd };
      const handle = init(Worker, { id });
      handles.set(id, handle);
      dispatched.add(id);
      try {
        const receipt = await handle.dispatch({ message: task.prompt, initialData: JSON.parse(json(task)), idempotencyKey: 'workflow-job-v1' });
        if (signal.aborted) await handle.abort();
        job.receipt = receipt;
        await persist();
        emit({ type: 'worker-started', id, label, phase, workspace: task.cwd, deduplicated: receipt.deduplicated === true });
        const reply = await handle.read(receipt);
        let result = reply.text;
        if (descriptor.schema !== null) {
          const values = reply.data.result;
          if (!Array.isArray(values) || values.length !== 1 || !validator(descriptor.schema)(values[0])) {
            throw new AgentRunError({ outcome: 'failed', submissionId: receipt.submissionId, cause: new RunError('Worker finished without calling submit_result with a valid result.') });
          }
          result = values[0];
        }
        job.result = JSON.parse(json(result));
        if (job.workspace) job.artifact = await collect(job.workspace.cwd, job.workspace.commit, join(dir, `${id}.patch`));
        job.status = 'completed';
        await persist();
        emit({ type: 'worker-completed', id });
        return structuredClone(job.result);
      } catch (error) {
        if (!(error instanceof AgentRunError)) throw error;
        job.status = error.outcome;
        job.error = message(error);
        await persist();
        emit({ type: 'worker-failed', id, outcome: error.outcome, message: job.error });
        return null;
      } finally { handles.delete(id); }
    }

    async function program(name, args, namespace) {
      signal.throwIfAborted();
      const module = await code.load(name);
      if (typeof module.default !== 'function') throw new RunError(`${name} must export a default async function (run, args).`);
      let childIndex = 0;
      const api = primitives({
        emit,
        budget: Object.freeze({ maxJobs: config.maxJobs, spent: () => Object.keys(state.jobs).length, remaining: () => config.maxJobs - Object.keys(state.jobs).length }),
        invoke: (prompt, options) => {
          const promise = (async () => {
            signal.throwIfAborted();
            const descriptor = normalize(prompt, options);
            return gate(() => invoke(namespace, descriptor, options.key));
          })().catch(error => {
            // Infrastructure failures (Git, Flue admission) stop the run; they are not item results.
            throw fatal(error) ? error : new RunError(`Worker operation failed: ${message(error)}`, { cause: error });
          });
          pending.add(promise);
          promise.finally(() => pending.delete(promise)).catch(() => {});
          return promise;
        },
        child: (childName, childArgs = null) => program(childName, childArgs, `${namespace}/${childName}:${childIndex++}`),
      });
      api.artifacts = () => Object.values(state.jobs).filter(job => job.artifact).map(job => ({ id: job.id, key: job.key, cwd: job.artifact.cwd, patch: job.artifact.patch }));
      api.signal = signal;
      return module.default(Object.freeze(api), args);
    }

    const result = await program(manifest.entry, manifest.args, manifest.entry);
    if (pending.size) throw new RunError(`Program returned with ${pending.size} unawaited worker calls.`);
    signal.throwIfAborted();
    await save(join(dir, 'result.json'), result);
    state.status = 'finished';
    emit({ type: 'program-finished', result: join(dir, 'result.json') });
  } catch (error) {
    errors.push(error);
    if (journal !== undefined) {
      state.status = error?.name === 'AbortError' ? 'cancelled' : 'failed';
      state.error = message(error);
      await attempt(() => emit({ type: 'run-failed', message: state.error }));
    }
  } finally {
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    if (!signal.aborted) controller.abort(new DOMException('Run shutting down', 'AbortError'));
    await Promise.allSettled([...pending, ...aborts]);
    if (runtime) await attempt(() => runtime.stop());
    if (runtime) await attempt(() => cleanupSessionResources());
    // Workers stopped by this shutdown may have edited after dispatch; keep their partial output.
    for (const id of dispatched) {
      const job = state.jobs[id];
      if (job.workspace && job.status !== 'completed') await attempt(async () => { job.artifact = await collect(job.workspace.cwd, job.workspace.commit, join(dir, `${id}.patch`)); });
    }
    stopRecording?.();
    await attempt(() => code?.close());
    if (journal !== undefined) {
      await attempt(() => closeSync(journal));
      await attempt(() => writing);
      const failures = errors.filter(error => error?.name !== 'AbortError');
      if (failures.length) { state.status = 'failed'; state.error = failures.map(message).join('; '); }
      state.owner = null;
      await attempt(() => save(join(dir, 'state.json'), state));
    }
    release();
  }
  if (errors.length) throw errors.length === 1 ? errors[0] : new AggregateError(errors, 'Workflow execution or cleanup failed');
  return state;
}
