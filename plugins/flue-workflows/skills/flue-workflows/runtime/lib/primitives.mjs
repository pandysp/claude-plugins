import { AsyncLocalStorage } from 'node:async_hooks';

export class RunError extends Error {}
export function message(error) {
  const parts = [];
  const seen = new Set();
  const pending = [error];
  let truncated = false;
  while (pending.length && seen.size < 6) {
    error = pending.shift();
    if (seen.has(error)) continue;
    seen.add(error);
    const text = typeof error?.message === 'string' ? error.message
      : error === null || ['undefined', 'string', 'number', 'boolean'].includes(typeof error) ? String(error)
        : `Thrown ${typeof error}; throw an Error with a message for useful diagnostics`;
    if (!parts.includes(text)) parts.push(text.length > 4000 ? text.slice(0, 4000) + ' [truncated]' : text);
    const children = error instanceof AggregateError && Array.isArray(error.errors) ? error.errors : [];
    if (children.length > 6) truncated = true;
    pending.unshift(...children.slice(0, 6));
    if (error?.cause !== undefined) pending.unshift(error.cause);
  }
  if (pending.some(error => !seen.has(error))) truncated = true;
  return parts.join(': ') + (truncated ? ' [truncated]' : '');
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
      throw new RunError('Expected an array of functions, not already-started promises.');
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
