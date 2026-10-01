import { mkdir, stat, realpath, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { init, AgentRunError } from '@flue/runtime';
import { RunError, message } from './primitives.mjs';
import { hash, json } from './files.mjs';
import { snapshot, collect } from './workspace.mjs';
import { validator } from './workers.mjs';

// A job's id: its explicit key, or its inputs plus how often the same inputs
// were already requested in this program invocation.
export function jobId(namespace, descriptor, key, occurrences) {
  const identity = hash(json(descriptor));
  const occurrenceKey = `${namespace}:${identity}`;
  const occurrence = occurrences.get(occurrenceKey) ?? 0;
  occurrences.set(occurrenceKey, occurrence + 1);
  return { identity, id: 'worker-' + hash(key === undefined ? `${occurrenceKey}:${occurrence}` : `${namespace}:key:${key}`) };
}

// Tool lifecycle as Flue recorded it, so failures before execute() (argument
// validation) count like failures inside it. Reading a submission again replays
// its stream, so each step is journaled once across attempts (`journaled` holds
// `type:call` keys already in the journal).
export function toolEvents(emit, worker, journaled) {
  const names = new Map();
  const report = (type, call, tool, extra) => {
    if (journaled.has(`${type}:${call}`)) return;
    journaled.add(`${type}:${call}`);
    emit({ type, worker, tool, call, ...extra });
  };
  return chunk => {
    if (chunk.type === 'tool-input') {
      names.set(chunk.toolCallId, chunk.toolName);
      report('tool-start', chunk.toolCallId, chunk.toolName);
    } else if (chunk.type === 'tool-output') {
      report('tool-completed', chunk.toolCallId, names.get(chunk.toolCallId));
    } else if (chunk.type === 'tool-output-error') {
      report('tool-failed', chunk.toolCallId, names.get(chunk.toolCallId), { message: chunk.errorText });
    } else if (chunk.type === 'conversation-reset') {
      // A batch Flue folded into a snapshot carries its tool calls only as message parts.
      for (const part of chunk.snapshot.messages.flatMap(message => message.parts)) {
        if (part.type !== 'dynamic-tool') continue;
        names.set(part.toolCallId, part.toolName);
        report('tool-start', part.toolCallId, part.toolName);
        if (part.state === 'output-available') report('tool-completed', part.toolCallId, part.toolName);
        if (part.state === 'output-error') report('tool-failed', part.toolCallId, part.toolName, { message: part.errorText });
      }
    }
  };
}

async function workingDirectory(run, cwd) {
  cwd = await realpath(resolve(run.config.cwd, cwd));
  if (!(await stat(cwd)).isDirectory()) throw new RunError(`Working directory is not a directory: ${cwd}`);
  if (run.runtimeRoot.startsWith(cwd + sep) || run.dir.startsWith(cwd + sep)) throw new RunError('Working directories must not contain the workflow workspace.');
  return cwd;
}

// The claimed job, after the reuse/duplicate/admission rules. `undefined` means reuse.
function claim(run, { namespace, descriptor, key }) {
  const { state, config } = run;
  const { id, identity } = jobId(namespace, descriptor, key, run.occurrences);
  let job = state.jobs[id];
  if (run.handles.has(id)) throw new RunError(`Key ${key} is already running; await its promise instead of calling it twice.`);
  if (job && job.identity !== identity) throw new RunError(`Key ${key} was reused with different inputs; use a distinct key.`);
  state.calls++;
  if (job && job.status !== 'pending') {
    state.reused++;
    run.emit({ type: 'worker-reused', id, label: descriptor.label, phase: descriptor.phase, status: job.status });
    return { job, reused: true };
  }
  if (!job) {
    if (Object.keys(state.jobs).length >= config.maxJobs) throw new RunError(`Run-wide worker limit ${config.maxJobs} reached; no new worker was admitted.`);
    job = state.jobs[id] = { id, key: key ?? null, identity, descriptor, status: 'pending', result: null, error: null, artifact: null, workspace: null };
  }
  return { job, reused: false };
}

function resultOf(descriptor, reply, submissionId) {
  if (descriptor.schema === null) return reply.text;
  // submit_result already validated the value; a native hook could also write `result`, so check again.
  const values = reply.data.result;
  if (!Array.isArray(values) || values.length !== 1 || !validator(descriptor.schema)(values[0])) {
    throw new AgentRunError({ outcome: 'failed', submissionId, cause: new RunError('Worker finished without calling submit_result with a valid result.') });
  }
  return values[0];
}

// Runs one worker call to a result, `null` for a failed/aborted worker, or a thrown fatal error.
// `run` holds the attempt's shared state: { dir, runtimeRoot, config, state, Worker, persist, emit, signal, handles, dispatched, occurrences, journaled }.
export async function job(run, { namespace, descriptor, key }) {
  descriptor.cwd = await workingDirectory(run, descriptor.cwd);
  const { job, reused } = claim(run, { namespace, descriptor, key });
  if (reused) return job.status === 'completed' ? structuredClone(job.result) : null;
  const { id } = job;
  const { label, phase } = descriptor;
  const handle = init(run.Worker, { id });
  run.handles.set(id, handle);
  try {
    if (descriptor.isolation === 'snapshot' && !job.workspace) {
      const cwd = join(run.dir, 'workspaces', id);
      await mkdir(join(run.dir, 'workspaces'), { recursive: true });
      await rm(cwd, { recursive: true, force: true });
      job.workspace = { cwd, commit: await snapshot(descriptor.cwd, cwd) };
    }
    await run.persist();
    run.signal.throwIfAborted();
    const task = { ...descriptor, cwd: job.workspace?.cwd ?? descriptor.cwd };
    run.dispatched.add(id);
    const receipt = await handle.dispatch({ message: task.prompt, initialData: structuredClone(task), idempotencyKey: 'workflow-job-v1' });
    if (run.signal.aborted) await handle.abort();
    run.emit({ type: 'worker-started', id, label, phase, workspace: task.cwd, submissionId: receipt.submissionId, deduplicated: receipt.deduplicated === true });
    const reply = await handle.read(receipt, { onEvent: toolEvents(run.emit, id, run.journaled) });
    job.result = JSON.parse(json(resultOf(descriptor, reply, receipt.submissionId)));
    if (job.workspace) job.artifact = await collect(job.workspace.cwd, job.workspace.commit, join(run.dir, `${id}.patch`));
    job.status = 'completed';
    await run.persist();
    run.emit({ type: 'worker-completed', id });
    return structuredClone(job.result);
  } catch (error) {
    if (!(error instanceof AgentRunError)) throw error;
    job.status = error.outcome;
    job.error = message(error);
    await run.persist();
    run.emit({ type: 'worker-failed', id, outcome: error.outcome, message: job.error });
    return null;
  } finally { run.handles.delete(id); }
}
