import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { identity } from './support.mjs';

assert.equal(process.argv.length, 3, 'Usage: node create-fixture.mjs NEW_DIRECTORY');
const source = resolve(process.argv[2]);
await mkdir(source); // Refuse an existing destination; never overwrite somebody's checkout.
const cases = {
  sum: { contract: 'Return the numeric sum of a finite-number array, including zero for an empty array.', checks: [
    { args: [[1, 2]], expected: 3 }, { args: [[]], expected: 0 }, { args: [[-3, 2, 0]], expected: -1 },
  ], code: 'export default values => values.join(\'\');\n' },
  slug: { contract: 'Trim text, lowercase it, and replace each run of whitespace with one hyphen.', checks: [
    { args: [' Hello  WORLD '], expected: 'hello-world' }, { args: ['  '], expected: '' }, { args: ['A\tB'], expected: 'a-b' },
  ], code: 'export default text => text.trim().replaceAll(\' \', \'_\');\n' },
  identity: { contract: 'Return the supplied JSON value unchanged.', checks: [
    { args: [4], expected: 4 }, { args: [{ ok: true }], expected: { ok: true } },
  ], code: 'export default value => value;\n' },
};
for (const [id, { contract, checks, code }] of Object.entries(cases)) {
  const directory = join(source, 'cases', id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'case.json'), JSON.stringify({ kind: 'function', contract, checks }, null, 2) + '\n');
  await writeFile(join(directory, 'implementation.mjs'), code);
}
await mkdir(join(source, 'cases', 'external'));
await writeFile(join(source, 'cases', 'external', 'case.json'), JSON.stringify({ kind: 'external', contract: 'Check a service requiring separately approved access.' }) + '\n');
const exec = promisify(execFile);
const git = args => exec('git', ['-C', source, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-c', 'user.name=Workflow example', '-c', 'user.email=example@example.invalid', ...args], { env: { PATH: process.env.PATH }, timeout: 10000 });
await git(['init', '-q']);
await git(['add', '--all']);
await git(['commit', '-qm', 'Disposable coding fixture']);
await writeFile(join(source, 'cases', 'sum', 'implementation.mjs'), 'export default values => values.reduce((total, value) => total - value, 0);\n');
await writeFile(join(source, 'cases', 'identity', 'note.txt'), 'This input is deliberately untracked. Preserve it.\n');
console.log(JSON.stringify({ source, identity: await identity(source) }, null, 2));
