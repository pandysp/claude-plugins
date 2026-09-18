import { parseArgs } from 'node:util';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { hash, hashTree, json, save, load, ownerActive } from './files.mjs';
import { checkProgram, copyProgram } from './program.mjs';
import { RunError, message } from './primitives.mjs';
import { commandStatus, requireRunQuiescence } from './commands.mjs';

const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
class ExecutionAndInspectionError extends AggregateError {}
const help = `Flue workflow primitives (unrestricted local workers)

node flue.mjs doctor --model PROVIDER/MODEL --auth pi|env:VARIABLE
node flue.mjs check PATH/TO/program.mjs
node flue.mjs run PATH/TO/program.mjs --id NAME --cwd REPO --model PROVIDER/MODEL --auth pi|env:VARIABLE --access unrestricted [--args-file FILE]
node flue.mjs inspect NAME
node flue.mjs resume NAME
node flue.mjs cancel NAME

Run options: --effort low (default), --concurrency 6, --max-jobs 1000,
--timeout 600 (seconds per worker), --auth-file PATH (pi only), --args JSON.
Subscription credentials are read-only. env:VARIABLE explicitly selects API billing.
Run files and isolated edits stay in this workflow workspace, not the plugin cache.
`;

function positive(value, label) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new RunError(`${label} must be a positive integer.`);
  return Number(value);
}

async function inspect(dir) {
  const [manifest, state] = await Promise.all([load(join(dir, 'manifest.json')), load(join(dir, 'state.json'))]);
  const counts = {};
  for (const job of Object.values(state.jobs)) counts[job.status] = (counts[job.status] ?? 0) + 1;
  const active = state.owner ? ownerActive(join(dir, 'owner.sqlite')) : false;
  return { id: manifest.id, execution: state.status === 'running' && !active ? 'interrupted' : state.status, ownerActive: active, cleanShutdown: state.cleanShutdown,
    model: manifest.config.model, auth: manifest.config.auth, access: manifest.config.access,
    calls: state.calls, reused: state.reused, reattached: state.reattached, commands: await commandStatus(join(dir, 'commands')), workers: counts, compositionErrors: state.compositionErrors, toolErrors: state.toolErrors,
    error: state.error, result: join(dir, 'result.json'), events: join(dir, 'events.jsonl'),
    jobs: Object.values(state.jobs).map(job => ({ id: job.id, key: job.key, label: job.descriptor.label, status: job.status, error: job.error, receipt: job.receipt, artifact: job.artifact })) };
}

async function executeAndInspect(dir) {
  const errors = [];
  try {
    const { execute } = await import('./run.mjs');
    await execute({ dir, runtimeRoot });
  } catch (error) { errors.push(error); }
  let summary;
  try {
    summary = await inspect(dir);
    console.log(json(summary));
  } catch (cause) {
    errors.push(new RunError(`Final inspection failed for ${basename(dir)}. Inspect retained files in ${dir}.`, { cause }));
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new ExecutionAndInspectionError(errors, 'Execution and final inspection failed');
  if (summary.workers.failed || summary.workers.aborted || summary.compositionErrors) process.exitCode = 2;
}

export async function main(workspace, argv = process.argv.slice(2)) {
  process.umask(0o077);
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: {
    help: { type: 'boolean' }, id: { type: 'string' }, cwd: { type: 'string' }, model: { type: 'string' }, auth: { type: 'string' },
    'auth-file': { type: 'string' }, access: { type: 'string' }, effort: { type: 'string' }, concurrency: { type: 'string' },
    'max-jobs': { type: 'string' }, timeout: { type: 'string' }, args: { type: 'string' }, 'args-file': { type: 'string' },
  } });
  if (values.help || !positionals.length) { console.log(help); return; }
  const [command, subject] = positionals;
  if (positionals.length > 2 || !['check', 'doctor', 'run', 'inspect', 'resume', 'cancel'].includes(command)) throw new RunError(help);
  const lifecycle = ['inspect', 'resume', 'cancel'].includes(command);
  if (lifecycle && Object.keys(values).length) throw new RunError(`${command} uses the saved run configuration. Options cannot silently change an existing run.`);
  if (command === 'check') {
    if (!subject) throw new RunError('check needs an entry module path.');
    const path = resolve(subject);
    if (!(await stat(path)).isFile()) throw new RunError('Entry module must be a file.');
    const programHash = await checkProgram(dirname(path));
    console.log(json({ valid: true, programHash, scope: 'syntax only; no program/model executed' })); return;
  }
  if (command === 'doctor' || command === 'run') {
    const config = {
      model: values.model, auth: values.auth, authFile: values['auth-file'] ? resolve(values['auth-file']) : null,
      cwd: resolve(values.cwd ?? process.cwd()), access: values.access ?? null,
      effort: values.effort ?? 'low', concurrency: positive(values.concurrency ?? 6, 'concurrency'),
      maxJobs: positive(values['max-jobs'] ?? 1000, 'max-jobs'), timeoutMs: positive(values.timeout ?? 600, 'timeout') * 1000,
    };
    if (!config.model || !config.auth) throw new RunError('Both --model PROVIDER/MODEL and --auth pi|env:VARIABLE are required. Host model/login settings are not inherited.');
    const { credentials } = await import('./provider.mjs');
    const { workers } = await import('./workers.mjs');
    const { provider, source } = await credentials(config);
    workers({ config, provider, emit() {} }).normalize('configuration check', {});
    if (!(await stat(config.cwd)).isDirectory()) throw new RunError(`Invalid working directory: ${config.cwd}`);
    if (command === 'doctor') { console.log(json({ ready: true, node: process.version, model: config.model, auth: source, runtime: runtimeRoot, modelRequestMade: false })); return; }
    if (!subject || !values.id || !values.cwd) throw new RunError('run needs an entry module, --id NAME and an explicit --cwd directory.');
    if (config.access !== 'unrestricted') throw new RunError('Workers can access the host filesystem and shell. Explicitly authorize with --access unrestricted; snapshots are not security containment.');
    if (values.args && values['args-file']) throw new RunError('Choose --args or --args-file, not both.');
    const args = values['args-file'] ? JSON.parse(await readFile(resolve(values['args-file']), 'utf8')) : JSON.parse(values.args ?? '{}');
    json(args);
    const id = values.id;
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) throw new RunError('Run id must be 1–48 lowercase letters, digits or hyphens, starting with a letter/digit.');
    const dir = join(workspace, 'runs', id);
    await mkdir(join(workspace, 'runs'), { recursive: true });
    await mkdir(dir);
    const sourceFile = resolve(subject);
    const program = join(runtimeRoot, 'programs', randomUUID());
    const programHash = await copyProgram(dirname(sourceFile), program);
    const manifest = {
      format: 2, id, runtime: runtimeRoot, program, programHash, entry: basename(sourceFile), config, args,
      libraryHash: await hashTree(join(runtimeRoot, 'lib')), lockHash: hash(await readFile(join(runtimeRoot, 'package-lock.json'))),
    };
    await save(join(dir, 'manifest.json'), manifest);
    await save(join(dir, 'state.json'), { manifestHash: hash(json(manifest)), status: 'created', cleanShutdown: true, attempt: null, owner: null, store: null, jobs: {}, directories: {}, calls: 0, reused: 0, reattached: 0, compositionErrors: 0, toolErrors: 0, error: null });
    await executeAndInspect(dir);
    return;
  }
  if (!subject || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(subject)) throw new RunError(`${command} needs a valid run id.`);
  const dir = join(workspace, 'runs', subject);
  if (command === 'inspect') { console.log(json(await inspect(dir))); return; }
  if (command === 'resume') {
    const manifest = await load(join(dir, 'manifest.json'));
    if (manifest.runtime !== runtimeRoot) throw new RunError('This run belongs to another runtime version. Invoke the launcher printed in its manifest, not an upgraded runtime.');
    await executeAndInspect(dir);
    return;
  }
  const state = await load(join(dir, 'state.json'));
  if (state.status !== 'running' || !state.owner) throw new RunError(`Run is ${state.status}, not owned by a live controller. No recovery/runtime was started by cancel.`);
  await new Promise((resolve, reject) => {
    const socket = createConnection(state.owner.socket);
    socket.setTimeout(5000, () => socket.destroy(new Error('Cancellation acknowledgement timed out')));
    let data = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(json({ action: 'cancel', nonce: state.owner.nonce }) + '\n'));
    socket.on('data', chunk => { data += chunk; });
    socket.on('error', cause => reject(new RunError('Cannot reach the run owner. It may have died while shell commands survived. Inspect and stop old writers; cancel does not start a competing Flue runtime.', { cause })));
    socket.on('end', () => {
      try { if (!JSON.parse(data).requested) throw new Error(data); resolve(); }
      catch (error) { reject(error); }
    });
  });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (!ownerActive(join(dir, 'owner.sqlite'))) {
      const failures = [];
      // Read after ownership is free, not before its terminal save/release.
      // Inspection and quiescence failures must not erase the saved cause.
      try {
        const latest = await load(join(dir, 'state.json'));
        const unsettled = [...new Set(Object.values(latest.jobs).map(job => job.status))].filter(status => !['completed', 'failed', 'aborted', 'not-started', 'completed-uncollected'].includes(status));
        if (!['cancelled', 'finished'].includes(latest.status) || latest.cleanShutdown !== true || unsettled.length) {
          failures.push(new RunError(`Execution ${latest.status}; clean shutdown: ${latest.cleanShutdown}; unsettled worker states: ${unsettled.join(', ') || 'none'}.`, latest.error ? { cause: new Error(latest.error) } : undefined));
        }
      } catch (cause) { failures.push(new RunError(`Cannot read cancellation state in ${dir}.`, { cause })); }
      let summary;
      try { summary = await inspect(dir); }
      catch (error) { failures.push(error); }
      try { await requireRunQuiescence(dir); }
      catch (error) { failures.push(error); }
      let active;
      try { active = summary?.ownerActive || ownerActive(join(dir, 'owner.sqlite')); }
      catch (cause) { failures.push(new RunError(`Cannot recheck cancellation ownership in ${dir}.`, { cause })); }
      if (active) continue;
      try { if (summary) console.log(json(summary)); }
      catch (cause) { failures.push(new RunError(`Cannot render final cancellation summary for ${subject}.`, { cause })); }
      if (failures.length) throw new AggregateError(failures, `Cancellation not confirmed for ${subject}: the owner exited without a verified clean shutdown. Inspect retained files in ${dir}; no recovery was started.`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new RunError('Cancellation was requested but shutdown has not been confirmed after 90 seconds. Inspect the owner and its workspaces; do not launch replacement workers.');
}

export async function cli(workspace, argv) {
  try { await main(resolve(workspace), argv); }
  catch (error) {
    // Each failed phase gets its own bounded diagnostic; nested execution
    // causes must not consume the inspection failure's display budget.
    const failures = error instanceof ExecutionAndInspectionError ? error.errors : [error];
    for (const failure of failures) console.error(`flue: ${message(failure)}`);
    process.exitCode = 1;
  }
}
