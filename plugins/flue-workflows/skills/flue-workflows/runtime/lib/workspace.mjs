import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, copyFile, lstat, readlink, symlink, chmod, writeFile, mkdtemp, rm, realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fingerprint } from './files.mjs';
import { RunError } from './primitives.mjs';

const exec = promisify(execFile);
async function git(cwd, args, env = {}) {
  const result = await exec('git', ['-C', cwd, ...args], {
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))), GIT_TERMINAL_PROMPT: '0', ...env },
    maxBuffer: 64 * 1024 * 1024, timeout: 120_000,
  });
  return result.stdout;
}
const files = async cwd => [...new Set((await git(cwd, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean))];

export async function snapshot(source, target) {
  const top = (await git(source, ['rev-parse', '--show-toplevel'])).trim();
  if (await realpath(top) !== await realpath(source)) throw new RunError(`Isolation needs a Git repository root, not a subdirectory: ${source}`);
  const head = (await git(source, ['rev-parse', 'HEAD'])).trim();
  const paths = await files(source);
  const identity = await fingerprint(source, paths);
  await git(source, ['-c', 'core.hooksPath=/dev/null', 'clone', '--no-local', '--no-checkout', source, target]);
  await git(target, ['remote', 'remove', 'origin']);
  await git(target, ['config', 'core.hooksPath', '/dev/null']);
  await git(target, ['config', 'commit.gpgSign', 'false']);
  await git(target, ['reset', '--mixed', head]);
  for (const path of paths) {
    const input = join(source, path);
    const output = join(target, path);
    let stat;
    try { stat = await lstat(input); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    await mkdir(dirname(output), { recursive: true });
    if (stat.isSymbolicLink()) await symlink(await readlink(input), output);
    else if (stat.isFile()) {
      await copyFile(input, output);
      await chmod(output, 0o600 | (stat.mode & 0o111));
    } else throw new RunError(`Cannot snapshot ${input}: only files and symlinks are supported.`);
  }
  if (identity !== await fingerprint(target, paths)) {
    throw new RunError(`Source changed while copying ${source}; stop its writers and start a fresh run.`);
  }
  await git(target, ['config', 'user.name', 'Flue workflow']);
  await git(target, ['config', 'user.email', 'flue-workflow@example.invalid']);
  await git(target, ['add', '--all', '--force']);
  await git(target, ['commit', '--allow-empty', '-qm', 'Workflow input snapshot']);
  return (await git(target, ['rev-parse', 'HEAD'])).trim();
}

export async function collect(cwd, base, patchPath) {
  const temp = await mkdtemp(join(tmpdir(), 'flue-index-'));
  try {
    const env = { GIT_INDEX_FILE: join(temp, 'index') };
    await git(cwd, ['read-tree', 'HEAD'], env);
    await git(cwd, ['add', '--all', '--', '.'], env);
    const patch = await git(cwd, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv', base, '--'], env);
    const changed = (await git(cwd, ['diff', '--cached', '--name-only', '-z', base, '--'], env)).split('\0').filter(Boolean);
    await writeFile(patchPath, patch, { mode: 0o600 });
    return { cwd, base, head: (await git(cwd, ['rev-parse', 'HEAD'])).trim(), changed, patch: patchPath };
  } finally { await rm(temp, { recursive: true }); }
}
