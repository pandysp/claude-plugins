#!/usr/bin/env node
// Workflow workspace launcher; setup.mjs copies it to <workspace>/flue.mjs.
// inspect/resume/cancel use the runtime that created the run, everything else the
// current installation. The runtime's CLI validates ids and arguments.
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const installs = join(root, '.runtime');
const args = process.argv.slice(2);
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

let runtime = join(installs, (await readJson(join(root, '.runtime.json'))).runtime);
const run = args[1];
if (['inspect', 'resume', 'cancel'].includes(args[0]) && run && basename(run) === run && !run.startsWith('.')) {
  try { runtime = resolve((await readJson(join(root, 'runs', run, 'manifest.json'))).runtime); }
  catch (error) { if (error.code !== 'ENOENT') throw error; } // unknown run: the CLI reports it
}
if (!runtime.startsWith(installs + sep)) throw new Error('Runtime points outside this workspace installation.');
await (await import(pathToFileURL(join(runtime, 'lib/cli.mjs')).href)).cli(root, args);
