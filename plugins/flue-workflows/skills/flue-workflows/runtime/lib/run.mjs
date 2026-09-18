import { appendFileSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { mkdir, stat, access, readFile, realpath } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { init, AgentRunError } from '@flue/runtime';
import { start, local, sqlite } from '@flue/runtime/node';
import { cleanupSessionResources } from '@earendil-works/pi-ai';
import { primitives, concurrency, RunError, message, fatal } from './primitives.mjs';
import { hash, json, load, save, lease, hashTree } from './files.mjs';
import { snapshot, collect, verifyArtifact } from './workspace.mjs';
import { credentials } from './provider.mjs';
import { workers, validator } from './workers.mjs';
import { extensionScope } from './extensions.mjs';
import { admissionDatabase } from './admission.mjs';
import { commandTracker, requireRunQuiescence, commandStatus } from './commands.mjs';
import { loader, checkProgram } from './program.mjs';

async function optionalModule(program, name) {
  try { await access(join(program.root, name)); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  const module = await program.loader.load(name);
  if (module.default === undefined) throw new RunError(`${name} must export a default value. Remove the file if this extension is not intended.`);
  return module;
}

export async function execute({ dir, runtimeRoot }) {
  const release = lease(join(dir, 'owner.sqlite'));
  let runtime, code, journal, server, tracker;
  let runtimeAttempted = false;
  const seen = new Set();
  let state, manifest;
  const controller = new AbortController();
  const cancellation = new DOMException('Cancellation requested', 'AbortError');
  const handles = new Map();
  const pending = new Set();
  const occurrences = new Map();
  let writing = Promise.resolve();
  let operationFailure = null;
  const extensions = extensionScope(controller.signal, error => { operationFailure ??= error; controller.abort(error); });
  const persist = () => {
    const captured = JSON.parse(json(state));
    writing = writing.then(() => save(join(dir, 'state.json'), captured));
    return writing;
  };
  const emit = event => {
    const row = { at: new Date().toISOString(), attempt: state.attempt, ...event };
    try { appendFileSync(journal, json(row) + '\n'); fsyncSync(journal); }
    catch (cause) {
      const error = new RunError('Cannot persist the run journal; stopping rather than losing ownership/evidence.', { cause });
      operationFailure ??= error; controller.abort(error); throw error;
    }
    if (event.type === 'composition-failed') state.compositionErrors++;
    if (event.type === 'tool-failed') state.toolErrors++;
    if (!['tool-start', 'tool-completed', 'result-written', 'command-created'].includes(event.type)) console.error(json(row));
  };
  const onSignal = () => controller.abort(cancellation);
  const errors = [];
  const controllerFailures = [];
  const failController = cause => {
    const error = new RunError('Control channel failed; inspect the saved run before retrying.', { cause });
    controllerFailures.push(error);
    operationFailure ??= error;
    controller.abort(error);
    try { emit({ type: 'controller-failed', message: message(error) }); }
    catch (reportError) { controllerFailures.push(reportError); }
    return error;
  };
  const controlCallback = fn => (...args) => {
    try { fn(...args); }
    catch (error) { failController(error); }
  };
  const attempt = async fn => {
    try { return await fn(); }
    catch (error) { errors.push(error); }
  };
  // A submission known on an instance; a new one bumps the version that drives
  // the shutdown re-inspection loop.
  const remember = (entry, submissionId, target) => {
    const fresh = !entry.submissions.has(submissionId);
    if (fresh) entry.version++;
    entry.submissions.set(submissionId, target);
    return fresh;
  };
  // Shutdown ownership of one native instance: abort it, replay the job's keyed
  // request to recover its receipt, observe every known submission, and
  // attribute an outcome only through the job's own receipt.
  async function settleAddress(id, entry) {
    entry.outcome = undefined;
    if (!entry.abortRequested) { entry.abortRequested = true; await attempt(() => entry.handle.abort()); }
    if (!entry.receipt && entry.request && (entry.inspect || entry.dispatched)) {
      // Admission is closed. Flue derives the submission id from the instance
      // and idempotency key, so replaying can only return the job's existing
      // submission or establish that it was never admitted.
      try {
        const receipt = await entry.fresh().dispatch(JSON.parse(json(entry.request)));
        entry.receipt = receipt;
        remember(entry, receipt.submissionId, receipt);
        if (state.jobs[id]) { state.jobs[id].receipt = receipt; await persist(); }
      } catch (error) {
        if (!(entry.denied && error === controller.signal.reason)) errors.push(error);
      }
    }
    const outcomes = new Map();
    while ([...entry.submissions.keys()].some(submission => !outcomes.has(submission))) {
      const reads = await Promise.allSettled([...entry.submissions].filter(([submission]) => !outcomes.has(submission)).map(async ([submission, target]) => {
        try {
          await entry.handle.read(target, { signal: AbortSignal.timeout(60_000) });
          outcomes.set(submission, 'completed-uncollected');
        } catch (error) {
          if (!(error instanceof AgentRunError)) throw error;
          outcomes.set(submission, error.outcome);
        }
      }));
      const failed = reads.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failed.length) throw new AggregateError(failed, `Native settlement observation failed for ${id}`);
    }
    if (entry.receipt) { entry.outcome = outcomes.get(entry.receipt.submissionId); return; }
    if (entry.denied || !entry.inspect && !entry.dispatched) { entry.outcome = 'not-started'; return; }
    throw new RunError(`Worker receipt is unknown for ${id}. Retain the saved run and native store and resume to recover it; no outcome was guessed.`);
  }
  try {
    manifest = await load(join(dir, 'manifest.json'));
    state = await load(join(dir, 'state.json'));
    if (manifest.format !== 2) throw new RunError('Unknown run format; use the runtime that created this run.');
    if (state.manifestHash !== hash(json(manifest))) throw new RunError('Saved run configuration changed. Restore the original manifest or create a new run; no Flue runtime was started.');
    if (await checkProgram(manifest.program) !== manifest.programHash) throw new RunError('Pinned program changed. Restore the original or create a new run; no workers were started.');
    if (await hashTree(join(runtimeRoot, 'lib')) !== manifest.libraryHash) throw new RunError('Runtime code changed. Restore the pinned installation; no workers were started.');
    if (hash(await readFile(join(runtimeRoot, 'package-lock.json'))) !== manifest.lockHash) throw new RunError('Runtime dependency lock changed; no workers were started.');
    if (Object.keys(state.jobs).length) await requireRunQuiescence(dir);
    for (const job of Object.values(state.jobs)) {
      if (job.artifact && !await verifyArtifact(job.artifact)) throw new RunError(`Output changed or disappeared for ${job.id}. Restore the retained workspace or start a new run; cached success was not used.`);
    }
    for (const [cwd, identity] of Object.entries(state.directories)) {
      if (await hashTree(cwd, { exclude: ['.git'] }) !== identity) throw new RunError(`Declared working directory changed: ${cwd}. Use a new run for changed inputs.`);
    }
    const recovering = Object.values(state.jobs).filter(job => job.status === 'pending');
    if (recovering.length > manifest.config.concurrency) throw new RunError('Saved pending workers exceed the configured concurrency; recovery was not started.');
    for (const job of Object.values(state.jobs)) {
      if (job.descriptor.isolation !== 'snapshot') continue;
      if (!job.workspace || await realpath(job.workspace.cwd) !== job.workspace.cwd || !(await stat(join(job.workspace.cwd, '.git'))).isDirectory()) {
        throw new RunError(`Job ${job.id} has no intact input workspace. Retain its files and create a new run; source-directory execution is not a recovery fallback.`);
      }
    }
    if (recovering.length) {
      for (const name of ['tools.mjs', 'worker.mjs']) {
        try { await access(join(manifest.program, name)); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        throw new RunError(`Interrupted workers use ${name}. Custom effects are not tracked by the native-command boundary. Inspect/stop their effects and recover into a new run; no Flue runtime was started.`);
      }
    }
    const { provider, source } = await credentials(manifest.config);
    state.attempt = randomUUID();
    state.status = 'running';
    state.cleanShutdown = false;
    state.compositionErrors = 0;
    state.toolErrors = 0;
    state.calls = 0;
    state.reused = 0;
    state.reattached = 0;
    state.error = null;
    const socket = `/tmp/flue-${state.attempt}.sock`;
    state.owner = { pid: process.pid, socket, nonce: state.attempt };
    await persist();
    journal = openSync(join(dir, 'events.jsonl'), 'a', 0o600);
    emit({ type: 'run-started', auth: source, model: manifest.config.model, access: 'unrestricted-local' });
    server = createServer(controlCallback(connection => {
      let data = '';
      connection.setEncoding('utf8');
      connection.setTimeout(3000, controlCallback(() => connection.destroy(new Error('Control request timed out'))));
      connection.on('data', controlCallback(chunk => {
        data += chunk;
        if (data.length > 4096) connection.destroy(new Error('Control request too large'));
        if (!data.includes('\n')) return;
        try {
          const request = JSON.parse(data.trim());
          if (request.nonce !== state.owner.nonce || request.action !== 'cancel') throw new Error('Invalid control request');
        } catch (error) { connection.end(json({ error: message(error) }) + '\n'); return; }
        try {
          emit({ type: 'cancel-requested' });
          onSignal();
          connection.end('{"requested":true}\n');
        } catch (error) {
          failController(error);
          connection.end(json({ error: message(error) }) + '\n');
        }
      }));
      connection.on('error', controlCallback(error => { emit({ type: 'control-error', message: message(error) }); }));
    }));
    await new Promise((resolve, reject) => {
      let starting = true;
      server.on('error', cause => {
        const error = failController(cause);
        if (starting) { starting = false; reject(error); }
      });
      server.listen(socket, () => { starting = false; resolve(); });
    });
    process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
    code = await loader(manifest.program, runtimeRoot);
    const tools = (await optionalModule({ root: manifest.program, loader: code }, 'tools.mjs'))?.default;
    const extension = (await optionalModule({ root: manifest.program, loader: code }, 'worker.mjs'))?.default;
    tracker = commandTracker(join(dir, 'commands'), error => { operationFailure ??= error; controller.abort(error); }, record => emit({ type: 'command-created', id: record.id, worker: record.worker }));
    const probe = tracker.wrap(await local({ cwd: dir }).createSandbox({ id: '__capability_probe' }), '__capability_probe');
    const probeResult = await probe.exec('true', { timeoutMs: 5000 });
    if (probeResult.exitCode !== 0) throw new RunError('Native shell/command tracking capability check failed.');
    await requireRunQuiescence(dir);
    const { Worker, normalize } = workers({ config: manifest.config, provider, extra: tools, extension, tracker, emit, extensions });
    function address(id) {
      if (!handles.has(id)) handles.set(id, { handle: init(Worker, { id }), fresh: () => init(Worker, { id }), receipt: null, request: null, submissions: new Map(), version: 0, dispatched: false, inspect: false, denied: false });
      return handles.get(id);
    }
    function own(job, inspect = false) {
      const entry = address(job.id);
      entry.inspect ||= inspect;
      const task = JSON.parse(json({ ...job.descriptor, cwd: job.workspace?.cwd ?? job.descriptor.cwd }));
      entry.request = { message: task.prompt, initialData: task, idempotencyKey: 'workflow-job-v1' };
      if (job.receipt) {
        entry.receipt = job.receipt;
        remember(entry, job.receipt.submissionId, job.receipt);
      }
      return entry;
    }
    for (const job of recovering) own(job, true);
    // Every saved receipt must still be in the native store, or startup is
    // refused: a missing or replaced store cannot recover this run's work.
    async function requireOwnStore() {
      const jobs = Object.values(state.jobs);
      if (!jobs.length) return;
      const receipts = jobs.filter(job => job.receipt);
      const storePath = join(dir, 'flue.sqlite');
      await access(storePath).catch(error => {
        if (error.code !== 'ENOENT') throw error;
        throw new RunError('Native store is missing. Restore the original flue.sqlite or create a new run; no workers were started.');
      });
      if (!receipts.length) return;
      const store = sqlite(storePath);
      try {
        const { submissionStore } = await store.connect();
        for (const job of receipts) {
          if (!await submissionStore.getSubmission(job.receipt.submissionId)) throw new RunError(`Native store no longer holds submission ${job.receipt.submissionId} for ${job.id}. Restore the original flue.sqlite or create a new run; no workers were started.`);
        }
      } finally { await store.close(); }
    }
    const replaying = new Set(recovering.map(job => job.id));
    const database = admissionDatabase(join(dir, 'flue.sqlite'), controller.signal, row => {
      if (row.input.agent !== Worker.agentName) {
        const error = new RunError(`Native submission ${row.submissionId} targets an unregistered workflow agent: ${row.input.agent}. Retain the native store for inspection.`);
        errors.push(error); operationFailure ??= error; controller.abort(error); throw error;
      }
      const entry = address(row.input.id);
      if (remember(entry, row.submissionId, row.submissionId)) emit({ type: 'native-submission-observed', id: row.input.id, submission: row.submissionId });
      entry.denied = false;
    }, input => { address(input.id).denied = true; }, replaying);
    controller.signal.throwIfAborted();
    await requireOwnStore();
    controller.signal.throwIfAborted();
    runtimeAttempted = true;
    runtime = await start({ agents: [Worker], db: database, providers: [provider] });
    controller.signal.throwIfAborted();
    // start() recovers accepted submissions before the caller's admission gate exists.
    // Settle that bounded, already-admitted set before allowing any new work.
    if (recovering.length) {
      emit({ type: 'recovery-settling', workers: recovering.length });
      const settlements = await Promise.allSettled(recovering.map(async job => {
        try {
          const entry = own(job, true), handle = entry.fresh();
          entry.handle = handle;
          entry.dispatched = !job.receipt;
          const receipt = job.receipt ?? await handle.dispatch(JSON.parse(json(entry.request)));
          job.receipt = receipt;
          own(job);
          await persist();
          await handle.read(receipt, { signal: controller.signal });
        } catch (error) {
          if (!(error instanceof AgentRunError)) { operationFailure ??= error; controller.abort(error); throw error; }
          emit({ type: 'recovery-worker-failed', id: job.id, outcome: error.outcome, message: message(error) });
        }
      }));
      const failed = settlements.filter(item => item.status === 'rejected').map(item => item.reason);
      if (failed.length) {
        if (controller.signal.reason === cancellation && failed.every(error => error === cancellation)) throw cancellation;
        throw new AggregateError(failed, 'Recovery observation failed');
      }
      controller.signal.throwIfAborted();
      emit({ type: 'recovery-settled', workers: recovering.length });
    }
    replaying.clear();
    const gate = concurrency(manifest.config.concurrency, controller.signal);
    async function invoke(namespace, descriptor, key) {
      controller.signal.throwIfAborted();
      descriptor.cwd = await realpath(resolve(manifest.config.cwd, descriptor.cwd));
      if (!(await stat(descriptor.cwd)).isDirectory()) throw new RunError(`Working directory is not a directory: ${descriptor.cwd}`);
      if (runtimeRoot.startsWith(descriptor.cwd + sep) || dir.startsWith(descriptor.cwd + sep)) throw new RunError('Working directories must not contain the workflow workspace. Keep source, programs and run state in separate directories.');
      const identity = hash(json(descriptor));
      const occurrenceKey = `${namespace}:${identity}`;
      const occurrence = occurrences.get(occurrenceKey) ?? 0;
      occurrences.set(occurrenceKey, occurrence + 1);
      const id = 'worker-' + hash(key === undefined ? `${occurrenceKey}:${occurrence}` : `${namespace}:key:${key}`);
      let job = state.jobs[id];
      if (job?.status === 'pending' && seen.has(id)) throw new RunError(`Concurrent calls reused key ${key}. Share/await the first promise instead of starting the same job twice.`);
      seen.add(id);
      const existing = !!job;
      const wasTerminal = job && ['completed', 'failed', 'aborted'].includes(job.status);
      if (job && descriptor.isolation === 'snapshot' && !job.workspace) throw new RunError(`Job ${id} has no complete input snapshot. Retain its files and create a new run; original-source execution is not a fallback.`);
      if (job && job.identity !== identity) throw new RunError(`Job key ${key} was reused with different inputs. Use a distinct key, not a cached answer to a different question.`);
      state.calls++;
      if (!job && Object.keys(state.jobs).length >= manifest.config.maxJobs) throw new RunError(`Run-wide worker limit ${manifest.config.maxJobs} reached. No new worker was admitted. Report omitted work; raise the limit only in a new explicitly configured run.`);
      if (!job) {
        job = { id, key: key ?? null, namespace, identity, descriptor, status: 'pending', receipt: null, result: null, error: null, artifact: null, workspace: null };
        state.jobs[id] = job;
        own(job);
        await persist();
        if (descriptor.isolation === 'snapshot') {
          const cwd = join(dir, 'workspaces', id);
          await mkdir(join(dir, 'workspaces'), { recursive: true });
          const base = await snapshot(descriptor.cwd, cwd);
          job.workspace = { cwd: await realpath(cwd), ...base };
        }
      }
      controller.signal.throwIfAborted();
      const entry = own(job, existing), handle = entry.fresh();
      entry.handle = handle;
      const task = entry.request.initialData;
      if (job.status === 'not-started') job.status = 'pending';
      await persist();
      controller.signal.throwIfAborted();
      entry.dispatched = true;
      const receipt = await handle.dispatch(JSON.parse(json(entry.request)));
      job.receipt = receipt;
      own(job);
      if (receipt.deduplicated) { if (wasTerminal) state.reused++; else state.reattached++; }
      await persist();
      emit({ type: receipt.deduplicated ? (wasTerminal ? 'worker-reused' : 'worker-reattached') : 'worker-started', id, label: descriptor.label, phase: descriptor.phase, workspace: task.cwd });
      try {
        const reply = await handle.read(receipt, { signal: controller.signal });
        let result = reply.text;
        if (descriptor.schema !== null) {
          const values = reply.data.result;
          if (!Array.isArray(values) || values.length !== 1 || !validator(descriptor.schema)(values[0])) throw new RunError(`Worker ${id} finished without one valid final result. Inspect its retained Flue record; no text/JSON fallback was used.`);
          result = values[0];
        }
        const resultJson = json(result);
        job.result = JSON.parse(resultJson);
        await requireRunQuiescence(dir, id);
        if (job.workspace) job.artifact = await collect(job.workspace.cwd, job.workspace.commit, join(dir, `${id}.patch`));
        if (!job.workspace) state.directories[descriptor.cwd] = await hashTree(descriptor.cwd, { exclude: ['.git'] });
        job.status = 'completed';
        job.error = null;
        await persist();
        emit({ type: 'worker-completed', id });
        return JSON.parse(resultJson);
      } catch (error) {
        if (!(error instanceof AgentRunError)) throw error;
        job.status = error.outcome;
        job.error = message(error);
        await persist();
        emit({ type: 'worker-failed', id, outcome: error.outcome, message: message(error), submission: receipt.submissionId });
        return null;
      }
    }
    async function program(name, args, namespace) {
      controller.signal.throwIfAborted();
      const module = await code.load(name);
      controller.signal.throwIfAborted();
      if (typeof module.default !== 'function') throw new RunError(`${name} must export a default async function (run, args).`);
      let childIndex = 0;
      const api = primitives({
        emit,
        budget: Object.freeze({ maxJobs: manifest.config.maxJobs, spent: () => Object.keys(state.jobs).length, remaining: () => manifest.config.maxJobs - Object.keys(state.jobs).length }),
        invoke: (prompt, options) => {
          const promise = (async () => {
            // Capture caller-owned values before waiting for a worker slot.
            controller.signal.throwIfAborted();
            const descriptor = normalize(prompt, options), key = options.key;
            return gate(() => invoke(namespace, descriptor, key));
          })().catch(error => {
            if (fatal(error)) throw error;
            throw new RunError(`Worker operation failed: ${message(error)}`, { cause: error });
          });
          pending.add(promise);
          promise.then(() => pending.delete(promise), error => {
            pending.delete(promise);
            if (fatal(error)) { operationFailure ??= error; controller.abort(error); }
          });
          return promise;
        },
        child: (childName, childArgs = null) => program(childName, childArgs, `${namespace}/${childName}:${childIndex++}`),
      });
      // References into the final workspace: shutdown recollects every patch, so
      // consumers resolve these paths after the run. state.json holds the hashes.
      api.artifacts = () => Object.values(state.jobs).filter(job => job.artifact).map(job => ({ id: job.id, key: job.key, cwd: job.artifact.cwd, patch: job.artifact.patch }));
      api.signal = controller.signal;
      return module.default(Object.freeze(api), args);
    }
    const result = await program(manifest.entry, manifest.args, manifest.entry);
    if (operationFailure) throw operationFailure;
    if (pending.size) throw new RunError(`Program returned with ${pending.size} unawaited worker calls. Await every worker/composition promise.`);
    controller.signal.throwIfAborted();
    await save(join(dir, 'result.json'), result);
    state.status = 'finished';
    emit({ type: 'program-finished', result: join(dir, 'result.json') });
  } catch (error) {
    errors.push(error);
    if (journal !== undefined) {
      state.status = error?.name === 'AbortError' ? 'cancelled' : 'failed';
      state.error = message(error);
      await attempt(() => emit({ type: 'run-failed', message: message(error) }));
    }
  } finally {
    try {
      await attempt(() => { process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal); });
      extensions.close();
      await attempt(() => controller.abort(new DOMException('Run shutting down', 'AbortError')));
      if (runtimeAttempted) {
        await attempt(async () => {
          await Promise.allSettled([...pending]);
          const inspected = new Map();
          while ([...handles].some(([id, entry]) => inspected.get(id) !== entry.version)) {
            const batch = [...handles].filter(([id, entry]) => inspected.get(id) !== entry.version);
            const versions = new Map(batch.map(([id, entry]) => [id, entry.version]));
            const stops = await Promise.allSettled(batch.map(async ([id, entry]) => {
              try { await settleAddress(id, entry); }
              finally { inspected.set(id, versions.get(id)); }
            }));
            errors.push(...stops.filter(result => result.status === 'rejected').map(result => result.reason));
          }
        });
      }
      await attempt(() => extensions.drain());
      if (runtime) await attempt(() => runtime.stop());
      if (runtimeAttempted) await attempt(() => cleanupSessionResources());
      if (runtime) {
        let quiescent = false;
        await attempt(async () => {
          const deadline = Date.now() + 10_000;
          while ((await commandStatus(join(dir, 'commands'))).active.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
          await requireRunQuiescence(dir);
          quiescent = true;
        });
        await attempt(async () => {
          for (const job of Object.values(state.jobs)) {
            if (job.workspace && quiescent) await attempt(async () => {
              job.artifact = await collect(job.workspace.cwd, job.workspace.commit, join(dir, `${job.id}.patch`));
            });
          }
          for (const [id, entry] of handles) {
            const job = state.jobs[id];
            if (job?.status === 'pending' && entry.outcome) {
              job.status = entry.outcome;
              job.error = entry.outcome === 'not-started' ? 'Cancelled before admission.' : 'Settlement observed during shutdown; result was not collected by the program.';
            }
          }
          for (const job of Object.values(state.jobs)) {
            if (!job.workspace && quiescent) await attempt(async () => {
              state.directories[job.descriptor.cwd] = await hashTree(job.descriptor.cwd, { exclude: ['.git'] });
            });
          }
        });
      }
      await attempt(async () => {
        if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      });
      await attempt(() => tracker?.close());
      await attempt(() => code?.close());
      if (journal !== undefined) {
        await attempt(() => closeSync(journal));
        await attempt(() => writing);
        errors.push(...controllerFailures.filter(error => !errors.includes(error)));
        errors.push(...extensions.failures.filter(error => !errors.includes(error)));
        await attempt(async () => {
          state.cleanShutdown = !!runtime && (errors.length === 0 || (state.status === 'cancelled' && errors.length === 1 && errors[0]?.name === 'AbortError'));
          if (errors.length) {
            if (state.status !== 'cancelled' || !state.cleanShutdown) state.status = 'failed';
            state.error = errors.map(message).join('; ');
          }
          // Terminal failure reporting must not depend on a rejected write chain.
          // Keep this last state write under ownership; never write after release.
          await save(join(dir, 'state.json'), state);
        });
      }
    } finally { await attempt(release); }
  }
  if (errors.length) throw new AggregateError(errors, 'Workflow execution or cleanup failed');
  return state;
}
