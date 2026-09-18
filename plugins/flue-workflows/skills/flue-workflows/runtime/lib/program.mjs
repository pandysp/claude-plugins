import { registerHooks } from 'node:module';
import { cp, lstat, readlink, realpath } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, relative, resolve, sep, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { entries, hashTree } from './files.mjs';
import { RunError } from './primitives.mjs';

const inside = (root, path) => path === root || path.startsWith(root + sep);
const exclude = ['node_modules', '.git'];
export const hashProgram = root => hashTree(root, { exclude });
export async function checkProgram(root) {
  for (const name of await entries(root, { exclude })) {
    const path = join(root, name);
    if ((await lstat(path)).isSymbolicLink()) {
      const link = await readlink(path);
      if (isAbsolute(link) || !inside(root, resolve(root, name, '..', link))) throw new RunError(`Program symlink must be relative and stay inside its pinned directory: ${name}`);
    }
    if (/\.(mjs|js|cjs)$/.test(name)) {
      try { execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' }); }
      catch (cause) { throw new RunError(`Syntax check failed for ${name}`, { cause }); }
    }
  }
  return hashProgram(root);
}

export async function copyProgram(source, target) {
  const before = await checkProgram(source);
  await cp(source, target, { recursive: true, verbatimSymlinks: true,
    filter: path => !relative(source, path).split(sep).some(part => exclude.includes(part)) });
  if (before !== await hashProgram(target)) throw new RunError('Program changed while being copied; stop its writers and create a fresh run.');
  return before;
}

export async function loader(root, runtime) {
  root = await realpath(root);
  runtime = await realpath(runtime);
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      const result = next(specifier, context);
      if (context.parentURL?.startsWith(pathToFileURL(root + sep).href) && result.url.startsWith('file:')) {
        const path = fileURLToPath(result.url);
        if (!inside(root, path) && !inside(join(runtime, 'node_modules'), path)) {
          throw new RunError(`Import escapes the program directory: ${specifier}. Keep modules in the program directory; pass data through args.`);
        }
      }
      return result;
    },
  });
  return {
    async load(name) {
      const path = resolve(root, name);
      if (!inside(root, path)) throw new RunError(`Workflow path escapes the program directory: ${name}`);
      return import(pathToFileURL(path).href);
    },
    close() { hooks.deregister(); },
  };
}
