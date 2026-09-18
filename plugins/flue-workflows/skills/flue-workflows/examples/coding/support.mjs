import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const exec = promisify(execFile);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const shellQuote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
export const helper = fileURLToPath(import.meta.url);

export async function discover(source) {
  const entries = await readdir(join(source, 'cases'), { withFileTypes: true });
  const cases = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    assert.ok(entry.isDirectory() && /^[a-z0-9-]+$/.test(entry.name), `Unsupported case entry: ${entry.name}`);
    const spec = JSON.parse(await readFile(join(source, 'cases', entry.name, 'case.json'), 'utf8'));
    assert.ok(['function', 'external'].includes(spec.kind) && typeof spec.contract === 'string', `Invalid descriptor: ${entry.name}`);
    if (spec.kind === 'function') assert.ok(Array.isArray(spec.checks) && spec.checks.length > 0, `No checks: ${entry.name}`);
    cases.push({ id: entry.name, ...spec });
  }
  return cases;
}

export async function identity(source) {
  const files = [];
  async function walk(relative) {
    for (const entry of (await readdir(join(source, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.name === '.git') continue;
      const name = join(relative, entry.name);
      if (entry.isDirectory()) await walk(name);
      else {
        assert.ok(entry.isFile(), `This fixture checker expects regular files: ${name}`);
        files.push([name, digest(await readFile(join(source, name)))]);
      }
    }
  }
  await walk('');
  const { stdout } = await exec('git', ['--no-optional-locks', '-C', source, 'rev-parse', 'HEAD'], { env: { PATH: process.env.PATH }, timeout: 10000 });
  return { head: stdout.trim(), index: digest(await readFile(join(source, '.git', 'index'))), files: digest(JSON.stringify(files)) };
}

export async function check(source, candidate, id, signal) {
  const { stdout } = await exec(process.execPath, [helper, 'check', source, candidate, id], {
    env: { PATH: process.env.PATH }, timeout: 10000, maxBuffer: 1024 * 1024, signal,
  });
  const result = JSON.parse(stdout);
  assert.equal(typeof result.passed, 'boolean', 'Checker returned no verdict');
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === helper) {
  const [mode, source, candidate, id] = process.argv.slice(2);
  assert.equal(mode, 'check', 'Usage: node support.mjs check SOURCE CANDIDATE CASE');
  const item = (await discover(source)).find(item => item.id === id);
  assert.ok(item?.kind === 'function', `No checkable case: ${id}`);
  let result;
  try {
    const { default: fn } = await import(pathToFileURL(join(candidate, 'cases', id, 'implementation.mjs')));
    assert.equal(typeof fn, 'function');
    for (const row of item.checks) {
      assert.ok(Array.isArray(row.args) && Object.hasOwn(row, 'expected'), 'Invalid check row');
      assert.deepStrictEqual(await fn(...row.args), row.expected);
    }
    result = { passed: true, reason: `${item.checks.length} supplied checks passed` };
  } catch (error) {
    result = { passed: false, reason: String(error.message).slice(0, 2000) };
  }
  console.log(JSON.stringify(result));
}
