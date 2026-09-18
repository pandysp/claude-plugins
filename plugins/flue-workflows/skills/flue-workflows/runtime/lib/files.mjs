import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { open, readFile, readdir, lstat, readlink, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { RunError } from './primitives.mjs';

export const hash = value => createHash('sha256').update(value).digest('hex');
export function json(value) {
  const seen = new Set();
  function visit(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object' || seen.has(item)) throw new RunError('Expected finite, acyclic JSON data.');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) throw new RunError('Expected plain JSON objects.');
    seen.add(item);
    const result = Array.isArray(item) ? item.map(visit) : Object.fromEntries(Object.keys(item).sort().map(key => [key, visit(item[key])]));
    seen.delete(item);
    return result;
  }
  return JSON.stringify(visit(value));
}

export async function save(path, value) {
  const text = json(value) + '\n';
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  const file = await open(temp, 'wx', 0o600);
  try { await file.writeFile(text); await file.sync(); }
  finally { await file.close(); }
  await rename(temp, path);
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

export const load = async path => JSON.parse(await readFile(path, 'utf8'));

export function lease(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;');
  } catch (cause) {
    db.close();
    if (cause.errcode === 5 || cause.errcode === 6) throw new RunError(`Another owner holds ${path}. Inspect or cancel that owner; do not start a second runtime.`, { cause });
    throw new RunError(`Cannot acquire ownership at ${path}: ${cause.message}`, { cause });
  }
  return () => { try { db.exec('ROLLBACK'); } finally { db.close(); } };
}

export function ownerActive(path) {
  try { lease(path)(); return false; }
  catch (error) { if ([5, 6].includes(error.cause?.errcode)) return true; throw error; }
}

export async function entries(root, { exclude = [] } = {}) {
  const result = [];
  async function walk(relative) {
    for (const entry of (await readdir(join(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (exclude.includes(entry.name)) continue;
      const path = join(relative, entry.name);
      if (entry.isDirectory()) await walk(path);
      else result.push(path);
    }
  }
  await walk('');
  return result.sort();
}

export async function fingerprint(root, paths) {
  const result = [];
  for (const path of paths) {
    const file = join(root, path);
    let stat;
    try { stat = await lstat(file); }
    catch (error) { if (error.code === 'ENOENT') { result.push([path, 'deleted']); continue; } throw error; }
    if (stat.isSymbolicLink()) result.push([path, 'link', await readlink(file)]);
    else if (stat.isFile()) result.push([path, stat.mode & 0o111, hash(await readFile(file))]);
    else throw new RunError(`Cannot snapshot non-file ${file}. Submodules, sockets and special files need an explicit external-input plan.`);
  }
  return hash(json(result));
}

export async function hashTree(root, options) { return fingerprint(root, await entries(root, options)); }
