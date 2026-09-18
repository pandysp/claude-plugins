import { parseArgs } from 'node:util';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { hash, json, save, load, ownerActive } from './files.mjs';
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
node flue.mjs cancel NAME

Run options: --effort low (default), --concurrency 6, --max-jobs 1000,
--timeout 600 (seconds per worker), --auth-file PATH (pi only), --args JSON.
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

async function cancel(dir) {
  const state = await load(join(dir, 'state.json'));
  if (state.status !== 'running' || !state.owner || !ownerActive(join(dir, 'owner.sqlite'))) throw new RunError(`Run is ${state.status} and has no live owner; nothing to cancel.`);
  process.kill(state.owner.pid, 'SIGTERM');
  const deadline = Date.now() + 90_000;
  while (ownerActive(join(dir, 'owner.sqlite'))) {
    if (Date.now() > deadline) throw new RunError('Cancellation requested but the owner has not exited after 90 seconds; inspect it.');
    await sleep(200);
  }
  console.log(json(await inspect(dir)));
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
    await mkdir(dir);
    const sourceFile = resolve(subject);
    const program = join(runtimeRoot, 'programs', randomUUID());
    const programHash = await copyProgram(dirname(sourceFile), program);
    const { FORMAT } = await import('./run.mjs');
    const manifest = { format: FORMAT, id: values.id, runtime: runtimeRoot, program, programHash, entry: basename(sourceFile), config, args };
    await save(join(dir, 'manifest.json'), manifest);
    await save(join(dir, 'state.json'), { manifestHash: hash(json(manifest)), status: 'created', attempt: null, owner: null, jobs: {}, calls: 0, reused: 0, compositionErrors: 0, toolErrors: 0, error: null });
    await executeAndInspect(dir);
    return;
  }
  if (!subject || !ID.test(subject)) throw new RunError(`${command} needs a valid run id.`);
  if (Object.keys(values).length) throw new RunError(`${command} uses the saved run configuration; options are not accepted.`);
  const dir = join(workspace, 'runs', subject);
  if (command === 'inspect') { console.log(json(await inspect(dir))); return; }
  if (command === 'cancel') { await cancel(dir); return; }
  const manifest = await load(join(dir, 'manifest.json'));
  if (manifest.runtime !== runtimeRoot) throw new RunError('This run belongs to another runtime installation; use the launcher that created it.');
  await executeAndInspect(dir);
}

export async function cli(workspace, argv) {
  try { await main(resolve(workspace), argv); }
  catch (error) {
    console.error(`flue: ${message(error)}`);
    process.exitCode = 1;
  }
}
