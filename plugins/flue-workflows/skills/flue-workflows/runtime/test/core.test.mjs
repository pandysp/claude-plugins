import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { primitives, RunError, message } from '../lib/primitives.mjs';
import { lease, save, load, hashTree } from '../lib/files.mjs';
import { snapshot, collect } from '../lib/workspace.mjs';
import { copyProgram } from '../lib/program.mjs';

const deferred = () => Promise.withResolvers();
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'flue-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('diagnostics include SDK aggregate causes without dumping objects or looping on cycles', () => {
  const error = new AggregateError([new Error('socket close failed', { cause: new Error('connection lost') })], 'SDK cleanup failed');
  error.cause = error;
  assert.equal(message(error), 'SDK cleanup failed: socket close failed: connection lost');
  assert.doesNotMatch(message(new AggregateError([{ secret: 'must-not-appear' }], 'cleanup failed')), /must-not-appear/);
  const many = new AggregateError(Array.from({ length: 100 }, (_, i) => new Error(`failure ${i}`)), 'cleanup failed');
  assert.match(message(many), /truncated/);
});

test('parallel is a barrier; item errors are visible, not fatal to siblings', async () => {
  const events = [];
  const api = primitives({ emit: event => events.push(event) });
  const gate = deferred();
  let finished = false;
  const pending = api.parallel([() => gate.promise, () => { throw 'deliberate'; }]).then(result => { finished = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  gate.resolve(42);
  assert.deepEqual(await pending, [42, null]);
  assert.equal(events.filter(e => e.type === 'composition-failed').length, 1);
});

test('pipelines overlap, preserve original item/index, and pass explicit nulls onward', async () => {
  const api = primitives({ emit() {} });
  const gate = deferred();
  const seen = [];
  const pending = api.pipeline(['slow', 'fast'], async item => item === 'slow' ? gate.promise : null,
    (value, original, index) => { seen.push({ value, original, index }); return original; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, [{ value: null, original: 'fast', index: 1 }]);
  gate.resolve(1);
  assert.deepEqual(await pending, ['slow', 'fast']);
});

test('a thrown stage stops only its chain; cancellation/configuration failures propagate', async () => {
  const events = [];
  const api = primitives({ emit: event => events.push(event) });
  const visited = [];
  assert.deepEqual(await api.pipeline([1, 2], n => { if (n === 1) throw new Error('broken item'); return n; }, n => { visited.push(n); return n; }), [null, 2]);
  assert.deepEqual(visited, [2]);
  await assert.rejects(api.parallel([() => { throw new RunError('invalid configuration'); }]), /invalid configuration/);
  await assert.rejects(api.parallel([() => { throw new DOMException('cancelled', 'AbortError'); }]), /cancelled/);
  assert.equal(events.length, 1);
});

test('parallel phases do not leak between siblings or into their parent', async () => {
  const labels = [];
  const api = primitives({ emit() {}, invoke: async (_prompt, options) => labels.push(options.phase) });
  api.phase('parent');
  await api.parallel([
    async () => { api.phase('A'); await new Promise(resolve => setImmediate(resolve)); await api.agent('a'); },
    async () => { api.phase('B'); await api.agent('b'); },
  ]);
  await api.agent('parent');
  assert.deepEqual(labels, ['B', 'A', 'parent']);
});

test('owner lock is exclusive across processes and released by the kernel', async t => {
  const dir = await fixture(t);
  const path = join(dir, 'owner.sqlite');
  const owner = lease(path);
  const module = new URL('../lib/files.mjs', import.meta.url).href;
  assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', `import {lease} from ${JSON.stringify(module)}; lease(${JSON.stringify(path)});`], { stdio: 'pipe' }), /owner|locked/);
  owner();
  execFileSync(process.execPath, ['--input-type=module', '-e', `import {lease} from ${JSON.stringify(module)}; lease(${JSON.stringify(path)})();`]);
});

test('atomic JSON saves require an existing parent; tree identity includes added files', async t => {
  const dir = await fixture(t);
  await save(join(dir, 'value.json'), { answer: 42 });
  assert.deepEqual(await load(join(dir, 'value.json')), { answer: 42 });
  await assert.rejects(save(join(dir, 'missing', 'value.json'), {}), { code: 'ENOENT' });
  const first = await hashTree(dir);
  await writeFile(join(dir, 'extra'), 'new');
  assert.notEqual(await hashTree(dir), first);
});

test('pinned program symlinks must remain inside the copy, not point back into the source', async t => {
  const dir = await fixture(t), source = join(dir, 'source'), target = join(dir, 'pinned');
  await mkdir(source);
  await writeFile(join(source, 'input.txt'), 'original');
  await symlink(join(source, 'input.txt'), join(source, 'alias.txt'));
  await assert.rejects(copyProgram(source, target), /Program symlink/);
  await rm(join(source, 'alias.txt'));
  await symlink('input.txt', join(source, 'alias.txt'));
  await copyProgram(source, target);
  await writeFile(join(source, 'input.txt'), 'changed');
  assert.equal(await readFile(join(target, 'alias.txt'), 'utf8'), 'original');
});

test('isolated snapshots preserve dirty/untracked inputs and collect committed edits without touching source', async t => {
  const dir = await fixture(t);
  const source = join(dir, 'source');
  execFileSync('git', ['init', '-q', source]);
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' });
  git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  await writeFile(join(source, 'tracked.txt'), 'base\n');
  await writeFile(join(source, '.gitignore'), 'ignored.txt\n');
  git('add', '.'); git('commit', '-qm', 'base');
  await writeFile(join(source, 'tracked.txt'), 'dirty\n');
  await writeFile(join(source, 'new.txt'), 'untracked\n');
  await writeFile(join(source, 'ignored.txt'), 'not an input\n');
  const before = await hashTree(source, { exclude: ['.git'] });
  const status = git('status', '--porcelain=v1');
  const target = join(dir, 'worker');
  const commit = await snapshot(source, target);
  assert.equal(await readFile(join(target, 'tracked.txt'), 'utf8'), 'dirty\n');
  assert.equal(await readFile(join(target, 'new.txt'), 'utf8'), 'untracked\n');
  await assert.rejects(readFile(join(target, 'ignored.txt')), /ENOENT/);
  await writeFile(join(target, 'tracked.txt'), 'worker edit\n');
  execFileSync('git', ['-C', target, 'add', '.']);
  execFileSync('git', ['-C', target, 'commit', '-qm', 'worker commit']);
  await writeFile(join(target, 'output.txt'), 'untracked output\n');
  const artifact = await collect(target, commit, join(dir, 'changes.patch'));
  assert(artifact.changed.includes('tracked.txt'));
  assert(artifact.changed.includes('output.txt'));
  const patch = await readFile(join(dir, 'changes.patch'), 'utf8');
  assert.match(patch, /worker edit/); assert.match(patch, /untracked output/);
  assert.equal(await hashTree(source, { exclude: ['.git'] }), before);
  assert.equal(git('status', '--porcelain=v1'), status);
});
