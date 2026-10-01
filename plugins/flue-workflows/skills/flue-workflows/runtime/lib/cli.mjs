import { parseArgs } from 'node:util';
import { readFile, readdir, mkdir, rm, stat, realpath } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { json, save, load, ownerActive, workspaceLock } from './files.mjs';
import { checkProgram, copyProgram } from './program.mjs';
import { RunError, message } from './primitives.mjs';
import { liveCommandGroups } from './commands.mjs';

const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const help = `Flue workflow primitives (unrestricted local workers)

node flue.mjs doctor --model PROVIDER/MODEL --auth pi|env:VARIABLE
node flue.mjs check PATH/TO/program.mjs
node flue.mjs run PATH/TO/program.mjs --id NAME --cwd REPO --model PROVIDER/MODEL --auth pi|env:VARIABLE --access unrestricted [--args-file FILE]
node flue.mjs inspect NAME
node flue.mjs resume NAME
node flue.mjs cancel NAME     (discards in-flight work; Ctrl-C/SIGTERM only stop the owner)
node flue.mjs prune

Run options: --effort low (default), --concurrency 6, --max-jobs 1000,
--timeout 600 (seconds per worker, one budget across Flue's up to 3 attempts),
--auth-file PATH (pi only), --args JSON.
`;

function positive(value, label) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new RunError(`${label} must be a positive integer.`);
  return Number(value);
}

async function inspect(dir) {
  const [manifest, state] = await Promise.all([load(join(dir, 'manifest.json')), load(join(dir, 'state.json'))]);
  const workers = {};
  for (const job of Object.values(state.jobs)) workers[job.status] = (workers[job.status] ?? 0) + 1;
  const ownerAlive = state.owner ? ownerActive(join(dir, 'owner.sqlite')) : false;
  return {
    id: manifest.id, execution: state.status === 'running' && !ownerAlive ? 'interrupted' : state.status, ownerAlive,
    model: manifest.config.model, auth: manifest.config.auth,
    calls: state.calls, reused: state.reused, workers, compositionErrors: state.compositionErrors, toolErrors: state.toolErrors,
    liveCommandGroups: await liveCommandGroups(dir),
    error: state.error, result: join(dir, 'result.json'), events: join(dir, 'events.jsonl'),
    jobs: Object.values(state.jobs).map(job => ({ id: job.id, key: job.key, label: job.descriptor.label, status: job.status, error: job.error, artifact: job.artifact })),
  };
}

// Remove runtime installations that neither the current setup nor any run uses.
async function prune(workspace) {
  const release = workspaceLock(workspace);
  try { return await pruneLocked(workspace); }
  finally { release(); }
}

async function pruneLocked(workspace) {
  const installs = join(workspace, '.runtime');
  const listing = async (path, filter = () => true) => {
    try { return (await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory() && filter(entry.name)).map(entry => entry.name); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  };
  const used = new Set([await realpath(join(installs, (await load(join(workspace, '.runtime.json'))).runtime))]);
  const incomplete = [];
  for (const id of await listing(join(workspace, 'runs'))) {
    let manifest;
    try { manifest = await load(join(workspace, 'runs', id, 'manifest.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; incomplete.push(id); continue; }
    used.add(await realpath(manifest.runtime).catch(() => null));
  }
  // Run creation holds the workspace lock, so a run without a manifest was interrupted while being created.
  if (incomplete.length) throw new RunError(`Runs without a manifest: ${incomplete.join(', ')}. Their creation was interrupted; remove those directories, then prune again. Nothing was removed.`);
  // Holding the workspace lock, no setup is running: a `*.installing-*` directory, or
  // dependencies without any library, are leftovers of a setup that failed or crashed.
  const removed = [];
  const remove = async path => { await rm(path, { recursive: true }); removed.push(path); };
  for (const lock of await listing(installs)) {
    if (lock.includes('.installing-')) { await remove(join(installs, lock)); continue; }
    const entries = await listing(join(installs, lock), name => name !== 'node_modules');
    const unknown = entries.filter(name => !/^[a-f0-9]{64}(\.installing-|$)/.test(name));
    if (unknown.length) throw new RunError(`Unrecognized installation layout in ${join(installs, lock)} (${unknown.join(', ')}); prune only handles installations from this setup version. Nothing was removed there.`);
    const unused = entries.filter(name => !used.has(join(installs, lock, name)));
    // Dependencies go with their last library.
    if (unused.length === entries.length) await remove(join(installs, lock));
    else for (const name of unused) await remove(join(installs, lock, name));
  }
  return { removed, kept: [...used].filter(Boolean) };
}

// Pin the run to this runtime under the workspace lock: prune either ran before (and
// this runtime is checked for) or runs after and sees the manifest.
async function createRun({ workspace, dir, id, sourceFile, config, args }) {
  const release = workspaceLock(workspace);
  try {
    try { await stat(join(runtimeRoot, 'lib', 'cli.mjs')); }
    catch (cause) { throw new RunError('This runtime installation has been pruned; run setup.mjs again.', { cause }); }
    await mkdir(dir);
    try {
      const program = join(dir, 'program');
      const programHash = await copyProgram(dirname(sourceFile), program);
      await save(join(dir, 'state.json'), { status: 'created', attempt: null, owner: null, jobs: {}, calls: 0, reused: 0, compositionErrors: 0, toolErrors: 0, error: null });
      await save(join(dir, 'manifest.json'), { id, runtime: runtimeRoot, program, programHash, entry: basename(sourceFile), config, args });
    } catch (error) {
      await rm(dir, { recursive: true, force: true }); // a refused program leaves no half-created run behind
      throw error;
    }
  } finally { release(); }
}

async function executeAndInspect(dir) {
  const { execute } = await import('./run.mjs');
  let failure;
  try { await execute({ dir, runtimeRoot }); }
  catch (error) { failure = error; }
  let summary;
  try { summary = await inspect(dir); }
  catch (error) { throw failure ? new AggregateError([failure, error], 'Execution and final inspection failed') : error; }
  console.log(json(summary));
  if (failure) throw failure;
  if (summary.workers.failed || summary.workers.aborted || summary.compositionErrors) process.exitCode = 2;
}

// Discard the run's in-flight work. A bare signal would only stop the owner (resumable).
async function cancel(dir) {
  const state = await load(join(dir, 'state.json'));
  if (state.status !== 'running' || !state.owner || !ownerActive(join(dir, 'owner.sqlite'))) throw new RunError(`Run is ${state.status} and has no live owner; nothing to cancel.`);
  process.kill(state.owner.pid, 'SIGUSR2');
  const deadline = Date.now() + 90_000;
  while (ownerActive(join(dir, 'owner.sqlite'))) {
    if (Date.now() > deadline) throw new RunError('Cancellation requested but the owner has not exited after 90 seconds; inspect it.');
    await sleep(200);
  }
  const summary = await inspect(dir);
  console.log(json(summary));
  if (summary.liveCommandGroups.length) throw new RunError(`The owner exited but worker commands are still running (process groups ${summary.liveCommandGroups.join(', ')}); stop them before using the retained patches.`);
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
  if (positionals.length > 2 || !['check', 'doctor', 'run', 'inspect', 'resume', 'cancel', 'prune'].includes(command)) throw new RunError(help);
  if (command === 'prune') {
    if (subject || Object.keys(values).length) throw new RunError('prune takes no arguments.');
    console.log(json(await prune(await realpath(workspace))));
    return;
  }
  if (command === 'check') {
    if (!subject) throw new RunError('check needs an entry module path.');
    const path = resolve(subject);
    if (!(await stat(path)).isFile()) throw new RunError('Entry module must be a file.');
    console.log(json({ valid: true, programHash: await checkProgram(dirname(path)), scope: 'syntax only; no program/model executed' }));
    return;
  }
  if (command === 'doctor' || command === 'run') {
    const config = {
      model: values.model, auth: values.auth, authFile: values['auth-file'] ? resolve(values['auth-file']) : null,
      cwd: resolve(values.cwd ?? process.cwd()), access: values.access ?? null,
      effort: values.effort ?? 'low', concurrency: positive(values.concurrency ?? 6, 'concurrency'),
      maxJobs: positive(values['max-jobs'] ?? 1000, 'max-jobs'), timeoutMs: positive(values.timeout ?? 600, 'timeout') * 1000,
    };
    if (!config.model || !config.auth) throw new RunError('Both --model PROVIDER/MODEL and --auth pi|env:VARIABLE are required.');
    const { credentials } = await import('./provider.mjs');
    const { workers } = await import('./workers.mjs');
    const { provider, source } = await credentials(config);
    workers({ config, provider, emit() {} }).normalize('configuration check', {});
    if (!(await stat(config.cwd)).isDirectory()) throw new RunError(`Invalid working directory: ${config.cwd}`);
    if (command === 'doctor') { console.log(json({ ready: true, node: process.version, model: config.model, auth: source, runtime: runtimeRoot, modelRequestMade: false })); return; }
    if (!subject || !values.id || !values.cwd) throw new RunError('run needs an entry module, --id NAME and an explicit --cwd directory.');
    if (config.access !== 'unrestricted') throw new RunError('Workers get full host access; authorize with --access unrestricted.');
    if (values.args && values['args-file']) throw new RunError('Choose --args or --args-file, not both.');
    const args = values['args-file'] ? JSON.parse(await readFile(resolve(values['args-file']), 'utf8')) : JSON.parse(values.args ?? '{}');
    json(args);
    if (!ID.test(values.id)) throw new RunError('Run id must be 1–48 lowercase letters, digits or hyphens, starting with a letter/digit.');
    const dir = join(workspace, 'runs', values.id);
    await mkdir(join(workspace, 'runs'), { recursive: true });
    await createRun({ workspace, dir, id: values.id, sourceFile: resolve(subject), config, args });
    await executeAndInspect(dir);
    return;
  }
  if (!subject || !ID.test(subject)) throw new RunError(`${command} needs a valid run id.`);
  if (Object.keys(values).length) throw new RunError(`${command} uses the saved run configuration; options are not accepted.`);
  const dir = join(workspace, 'runs', subject);
  if (command === 'inspect') { console.log(json(await inspect(dir))); return; }
  if (command === 'cancel') { await cancel(dir); return; }
  await executeAndInspect(dir);
}

export async function cli(workspace, argv) {
  try { await main(resolve(workspace), argv); }
  catch (error) {
    console.error(`flue: ${message(error)}`);
    process.exitCode = 1;
  }
}
