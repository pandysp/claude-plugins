// setup.mjs and the workspace launcher, with npm replaced by a stub that links the
// already-installed dependencies, so no network or second install is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, rm, writeFile, appendFile, readFile, readdir, chmod, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const skill = fileURLToPath(new URL('../..', import.meta.url));
const modules = fileURLToPath(new URL('../node_modules', import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'flue-setup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const copy = join(root, 'skill');
  await mkdir(join(copy, 'runtime'), { recursive: true });
  await cp(join(skill, 'scripts'), join(copy, 'scripts'), { recursive: true });
  await cp(join(skill, 'runtime/lib'), join(copy, 'runtime/lib'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json']) await cp(join(skill, 'runtime', name), join(copy, 'runtime', name));
  const bin = join(root, 'bin'), calls = join(root, 'npm-calls');
  await mkdir(bin);
  await writeFile(join(bin, 'npm'), `#!/bin/sh\necho "$@" >> ${JSON.stringify(calls)}\nln -s ${JSON.stringify(modules)} node_modules\n`);
  await chmod(join(bin, 'npm'), 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const workspace = join(root, 'workspace');
  return {
    copy, workspace,
    setup: async () => JSON.parse((await exec(process.execPath, [join(copy, 'scripts/setup.mjs'), workspace], { env })).stdout),
    flue: async (...args) => (await exec(process.execPath, [join(workspace, 'flue.mjs'), ...args], { env })).stdout,
    npmCalls: async () => (await readFile(calls, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean),
  };
}

test('a library change reuses installed dependencies; prune keeps what runs still use', async t => {
  const f = await fixture(t);
  const first = await f.setup();
  const firstRuntime = await realpath(first.runtime);
  assert.equal(first.dependenciesInstalled, true);
  assert.match(await f.flue('--help'), /node flue.mjs prune/);

  await appendFile(join(f.copy, 'runtime/lib/primitives.mjs'), '\n// library-only change\n');
  const second = await f.setup();
  assert.equal(second.dependenciesInstalled, false);
  assert.deepEqual(await f.npmCalls(), ['ci --ignore-scripts --omit=dev'], 'npm ci ran once for both libraries');
  assert.notEqual(second.runtime, first.runtime);
  assert.equal(join(second.runtime, '..'), join(first.runtime, '..'), 'both libraries share one dependency installation');
  assert.match(await f.flue('--help'), /node flue.mjs prune/, 'the new library resolves the shared dependencies');

  await mkdir(join(f.workspace, 'runs', 'old'), { recursive: true });
  await writeFile(join(f.workspace, 'runs', 'old', 'manifest.json'), JSON.stringify({ runtime: first.runtime }));
  assert.deepEqual(JSON.parse(await f.flue('prune')).removed, [], 'a run still uses the first library');

  await rm(join(f.workspace, 'runs', 'old'), { recursive: true });
  assert.deepEqual(JSON.parse(await f.flue('prune')).removed, [firstRuntime]);
  const lock = join(second.runtime, '..');
  assert.deepEqual((await readdir(lock)).sort(), [second.runtime.split('/').at(-1), 'node_modules', 'package-lock.json', 'package.json'].sort());
});

test('the launcher refuses a run whose runtime points outside the workspace', async t => {
  const f = await fixture(t);
  await f.setup();
  await mkdir(join(f.workspace, 'runs', 'escape'), { recursive: true });
  await writeFile(join(f.workspace, 'runs', 'escape', 'manifest.json'), JSON.stringify({ runtime: tmpdir() }));
  await assert.rejects(f.flue('inspect', 'escape'), /outside this workspace installation/);
});

test('prune refuses an installation layout it does not recognize', async t => {
  const f = await fixture(t);
  await f.setup();
  const old = join(f.workspace, '.runtime', 'a'.repeat(64));
  await mkdir(join(old, 'lib'), { recursive: true });
  await assert.rejects(f.flue('prune'), /Unrecognized installation layout.*lib/);
  await readdir(join(old, 'lib'));
});

test('inspect, resume and cancel use the runtime that created the run, not the current one', async t => {
  const f = await fixture(t);
  const first = await realpath((await f.setup()).runtime); // the CLI records real paths
  await appendFile(join(f.copy, 'runtime/lib/primitives.mjs'), '\n// library-only change\n');
  await f.setup();
  await mkdir(join(f.workspace, 'runs', 'old'), { recursive: true });
  await writeFile(join(f.workspace, 'runs', 'old', 'manifest.json'), JSON.stringify({ runtime: first }));
  await rm(join(first, 'lib'), { recursive: true });
  // The current runtime is intact, so only routing to the run's own runtime can fail here.
  await assert.rejects(f.flue('inspect', 'old'), new RegExp(`${first.split('/').at(-1)}/lib/cli.mjs`));
  assert.match(await f.flue('--help'), /node flue.mjs prune/);
});

test('prune refuses while a run has no manifest yet, since its runtime is unknown', async t => {
  const f = await fixture(t);
  const first = await realpath((await f.setup()).runtime);
  await appendFile(join(f.copy, 'runtime/lib/primitives.mjs'), '\n// library-only change\n');
  await f.setup();
  await mkdir(join(f.workspace, 'runs', 'creating'), { recursive: true });
  await assert.rejects(f.flue('prune'), /Runs without a manifest: creating/);
  await readdir(join(first, 'lib')); // nothing was removed
});

test('a second setup or prune fails at once while one holds the workspace', async t => {
  const f = await fixture(t);
  await f.setup();
  const { lease } = await import('../lib/files.mjs');
  const release = lease(join(f.workspace, '.runtime.lock'));
  t.after(release);
  await assert.rejects(f.flue('prune'), /Another setup or prune is running in this workspace/);
  await assert.rejects(f.setup(), /Another setup or prune is running in this workspace/);
});
