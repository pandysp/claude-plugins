import { AsyncLocalStorage } from 'node:async_hooks';

export class RunError extends Error {}
// One line per error, following causes and (bounded) aggregate members.
export function message(error) {
  const seen = new Set();
  const describe = error => {
    if (seen.has(error) || seen.size > 6) return '[truncated]';
    seen.add(error);
    const text = typeof error?.message === 'string' ? error.message : typeof error === 'object' && error !== null ? 'Non-Error thrown' : String(error);
    const causes = error instanceof AggregateError ? error.errors : error?.cause !== undefined ? [error.cause] : [];
    return [text, ...causes.slice(0, 6).map(describe)].join(': ') + (causes.length > 6 ? ' [truncated]' : '');
  };
  return describe(error);
}
export const fatal = error => error instanceof RunError || error?.name === 'AbortError';

export function primitives({ invoke, emit, child, budget }) {
  const context = new AsyncLocalStorage();
  const current = () => context.getStore() ?? {};
  const guarded = async (kind, index, fn) => {
    try { return await context.run({ ...current() }, fn); }
    catch (error) {
      if (fatal(error)) throw error;
      emit({ type: 'composition-failed', kind, index, message: message(error) });
      return null;
    }
  };
  const functions = values => {
    if (!Array.isArray(values) || values.some(value => typeof value !== 'function')) {
      throw new RunError('Expected an array of functions, not promises.');
    }
  };
  return {
    agent(prompt, options = {}) { return invoke(prompt, { phase: current().phase, ...options }); },
    parallel(thunks) {
      functions(thunks);
      return Promise.all(thunks.map((fn, index) => guarded('parallel', index, fn)));
    },
    pipeline(items, ...stages) {
      if (!Array.isArray(items)) throw new RunError('pipeline() expects an array of items.');
      functions(stages);
      return Promise.all(items.map((item, index) => guarded('pipeline', index, async () => {
        let value = item;
        for (const stage of stages) value = await stage(value, item, index);
        return value;
      })));
    },
    phase(title) {
      if (typeof title !== 'string' || !title.trim()) throw new RunError('phase() needs a nonempty title.');
      context.enterWith({ ...current(), phase: title });
      emit({ type: 'phase', title });
    },
    log(text) { emit({ type: 'log', message: String(text) }); },
    async workflow(name, args) {
      try { return await context.run({ ...current() }, () => child(name, args)); }
      catch (error) {
        try { emit({ type: 'workflow-failed', name, message: message(error) }); }
        catch (reporting) { throw new AggregateError([error, reporting], 'Child workflow and failure reporting failed', { cause: error }); }
        throw error;
      }
    },
    budget,
  };
}

export function concurrency(limit, signal) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RunError('Concurrency must be a positive integer.');
  let active = 0;
  const queue = [];
  return async fn => {
    signal?.throwIfAborted();
    if (active === limit) await new Promise(resolve => queue.push(resolve));
    else active++;
    try { signal?.throwIfAborted(); return await fn(); }
    finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
}
