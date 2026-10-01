#!/usr/bin/env node
// Installs the pinned runtime into a workflow workspace and writes its launcher.
//
//   <workspace>/.runtime/<lockfile hash>/node_modules        dependencies, installed once per lockfile
//   <workspace>/.runtime/<lockfile hash>/<library hash>/lib  runtime library, resolved against the parent's node_modules
//   <workspace>/.runtime.json                                the current installation
//   <workspace>/flue.mjs                                     launcher
import { cp, mkdir, readFile, rename, access, copyFile, chmod } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { hashTree, hash, json, save, lease } from '../runtime/lib/files.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const source = resolve(scripts, '../runtime');
const exec = promisify(execFile);
const [target, ...extra] = process.argv.slice(2);
if (!target || extra.length) throw new Error('Usage: node /path/to/skill/scripts/setup.mjs /absolute/workflow-workspace');
const workspace = resolve(target);
if (workspace === homedir() || workspace === '/') throw new Error('Choose a dedicated workflow workspace, not your home or filesystem root.');
process.umask(0o077);

const exists = path => access(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
// Build in a staging directory next to the target and rename it into place, so a
// failed or concurrent setup never leaves a half-built installation under its final name.
async function install(path, build) {
  if (await exists(path)) return false;
  const stage = `${path}.installing-${randomUUID()}`;
  await mkdir(stage, { recursive: true });
  try { await build(stage); }
  catch (cause) { throw new Error(`Runtime setup failed; incomplete installation retained at ${stage}.`, { cause }); }
  await rename(stage, path);
  return true;
}

await mkdir(workspace, { recursive: true });
// One setup or prune at a time per workspace; see `prune` in runtime/lib/cli.mjs.
const release = lease(join(workspace, '.runtime.lock'), 'Another setup or prune is running in this workspace; try again when it has finished.');
const lockHash = hash(json({ package: hash(await readFile(join(source, 'package.json'))), lock: hash(await readFile(join(source, 'package-lock.json'))) }));
const libHash = await hashTree(join(source, 'lib'));
const dependencies = join(workspace, '.runtime', lockHash);
const runtime = join(dependencies, libHash);

const installedDependencies = await install(dependencies, async stage => {
  for (const name of ['package.json', 'package-lock.json']) await copyFile(join(source, name), join(stage, name));
  console.error('Installing pinned Flue dependencies in the workflow workspace (no global installation, no lifecycle scripts)…');
  await exec('npm', ['ci', '--ignore-scripts', '--omit=dev'], { cwd: stage, maxBuffer: 8 * 1024 * 1024, timeout: 300_000 });
});
await install(runtime, async stage => {
  await cp(join(source, 'lib'), join(stage, 'lib'), { recursive: true });
  // Staged beside its final place, so dependencies already resolve from the parent.
  await exec(process.execPath, ['--input-type=module', '-e', "await import('./lib/cli.mjs'); await import('./lib/workers.mjs');"], { cwd: stage, timeout: 30_000 });
});
await save(join(workspace, '.runtime.json'), { runtime: `${lockHash}/${libHash}` });
await copyFile(join(scripts, 'launcher.mjs'), join(workspace, 'flue.mjs'));
await chmod(join(workspace, 'flue.mjs'), 0o700);
release();
console.log(json({ ready: true, workspace, runtime, dependenciesInstalled: installedDependencies, command: `node ${join(workspace, 'flue.mjs')} --help` }));
