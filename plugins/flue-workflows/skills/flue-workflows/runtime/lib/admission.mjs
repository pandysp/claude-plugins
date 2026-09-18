import { sqlite } from '@flue/runtime/node';
import { RunError } from './primitives.mjs';

export function admissionDatabase(path, signal, observed = () => {}, refused = () => {}, replaying = new Set()) {
  const database = sqlite(path);
  return { ...database, async connect() {
    const stores = await database.connect(), store = stores.submissionStore;
    const capture = row => { if (row) observed(row); return row; };
    const getSubmission = async id => capture(await store.getSubmission(id));
    const admission = method => async input => {
      if (replaying.has(input.id) && !await getSubmission(input.submissionId)) {
        throw new RunError(`Cannot confirm saved work for ${input.id}. Restore the native store or create a new run; recovery will not admit it again.`);
      }
      // The pinned built-in SQLite store commits synchronously. Do not yield
      // between this check and admission, or generalize this to async backends.
      if (signal.aborted && !await getSubmission(input.submissionId)) { refused(input); signal.throwIfAborted(); }
      // Existing submissions still go through native replay/conflict validation.
      try {
        const result = await store[method](input);
        capture(method === 'admitDispatch' ? (result.kind === 'submission' ? result.submission : null) : result);
        return result;
      } catch (error) {
        // A rejected delivery can still have committed. Only native evidence
        // establishes acceptance; a missing high-level receipt does not refute it.
        try { await getSubmission(input.submissionId); }
        catch (inspection) { throw new AggregateError([error, inspection], 'Native admission and its inspection failed', { cause: error }); }
        throw error;
      }
    };
    const methods = { getSubmission, admitDispatch: admission('admitDispatch'), admitDirect: admission('admitDirect') };
    for (const name of ['listRunningSubmissions', 'listRunnableSubmissions', 'listUnreadySubmissions']) {
      methods[name] = async (...args) => (await store[name](...args)).map(capture);
    }
    return { ...stores, submissionStore: new Proxy(store, { get(target, key) {
      if (Object.hasOwn(methods, key)) return methods[key];
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } }) };
  } };
}
