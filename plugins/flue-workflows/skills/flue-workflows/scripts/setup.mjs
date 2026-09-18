#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { hashTree, hash, json, save } from '../runtime/lib/files.mjs';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../runtime');
const exec = promisify(execFile);
const [target, ...extra] = process.argv.slice(2);
if (!target || extra.length) throw new Error('Usage: node /path/to/skill/scripts/setup.mjs /absolute/workflow-workspace');
const workspace = resolve(target);
if (workspace === homedir() || workspace === '/') throw new Error('Choose a dedicated workflow workspace, not your home or filesystem root.');
process.umask(0o077);
await mkdir(join(workspace, '.runtime'), { recursive: true });
const version = hash(json({ lib: await hashTree(join(source, 'lib')), package: hash(await readFile(join(source, 'package.json'))), lock: hash(await readFile(join(source, 'package-lock.json'))) }));
const installed = join(workspace, '.runtime', version);
let exists = false;
try { await access(installed); exists = true; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!exists) {
  const stage = join(workspace, '.runtime', `${version}.installing-${randomUUID()}`);
  await mkdir(stage);
  for (const name of ['lib', 'package.json', 'package-lock.json']) await cp(join(source, name), join(stage, name), { recursive: true });
  console.error('Installing pinned Flue dependencies in the workflow workspace (no global installation, no lifecycle scripts)…');
  try {
    const result = await exec('npm', ['ci', '--ignore-scripts', '--omit=dev'], { cwd: stage, maxBuffer: 8 * 1024 * 1024, timeout: 300_000 });
    await writeFile(join(stage, 'install.log'), result.stdout + result.stderr, { mode: 0o600 });
    await exec(process.execPath, ['--input-type=module', '-e', "await import('./lib/cli.mjs'); await import('./lib/workers.mjs');"], { cwd: stage, timeout: 30_000 });
  } catch (cause) {
    throw new Error(`Dependency setup failed; incomplete installation retained at ${stage}.`, { cause });
  }
  await rename(stage, installed);
}
await save(join(workspace, '.runtime.json'), { version });
await writeFile(join(workspace, 'flue.mjs'), `#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let runtime;
if (['inspect', 'resume', 'cancel'].includes(args[0]) && /^[a-z0-9][a-z0-9-]{0,47}$/.test(args[1] ?? '')) {
  runtime = JSON.parse(await readFile(join(root, 'runs', args[1], 'manifest.json'), 'utf8')).runtime;
  if (dirname(resolve(runtime)) !== join(root, '.runtime')) throw new Error('Run points outside this workspace runtime installation.');
} else {
  const {version} = JSON.parse(await readFile(join(root, '.runtime.json'), 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(version)) throw new Error('Invalid installed runtime identity.');
  runtime = join(root, '.runtime', version);
}
await (await import(pathToFileURL(join(runtime, 'lib/cli.mjs')).href)).cli(root, args);
`, { mode: 0o700 });
console.log(json({ ready: true, workspace, runtime: installed, command: `node ${join(workspace, 'flue.mjs')} --help` }));
