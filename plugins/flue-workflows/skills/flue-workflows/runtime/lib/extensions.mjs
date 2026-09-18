import { types } from 'node:util';
import { RunError } from './primitives.mjs';

const promiseThen = Promise.prototype.then;

export function extensionScope(signal, onFailure) {
  const work = new Set();
  const failures = [];
  let open = true;
  function fail(error) {
    open = false;
    failures.push(error);
    try { onFailure(error); }
    catch (cause) { failures.push(new RunError('Cannot report the extension failure to its run owner.', { cause })); }
    return error;
  }
  return {
    failures,
    fail,
    close() { open = false; },
    invoke(label, callback, args, receiver) {
      signal.throwIfAborted();
      if (!open) throw new RunError(`${label} cannot run after extension entry has closed.`);
      const value = Reflect.apply(callback, receiver, args);
      let then;
      try {
        if (value !== null && ['object', 'function'].includes(typeof value)) {
          then = types.isPromise(value) ? promiseThen : value.then;
        }
      } catch (cause) {
        throw fail(new RunError(`${label} returned an unreadable completion. Return synchronously; hidden background work cannot be tracked.`, { cause }));
      }
      if (typeof then !== 'function') return value;
      open = false;
      const error = new RunError(`${label} must return synchronously. Its asynchronous work remains owned until settlement; remove the asynchronous return.`);
      const settled = Promise.resolve({ then(resolve, reject) {
        // Own completion, not its value: do not assimilate a second result.
        Reflect.apply(then, value, [() => resolve(), reject]);
      } }).catch(cause => { failures.push(new RunError(`${label} asynchronous work failed.`, { cause })); });
      work.add(settled);
      throw fail(error);
    },
    async drain() {
      while (work.size) {
        const batch = [...work];
        await Promise.all(batch);
        for (const pending of batch) work.delete(pending);
      }
    },
  };
}
