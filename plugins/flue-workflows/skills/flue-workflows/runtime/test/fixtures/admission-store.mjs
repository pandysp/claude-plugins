export function traceAdmissions(adapter, { record, before = () => {}, after = () => {}, failed = () => false }) {
  return { ...adapter, async connect() {
    const stores = await adapter.connect(), store = stores.submissionStore;
    return { ...stores, submissionStore: new Proxy(store, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (!['admitDispatch', 'admitDirect'].includes(key)) return typeof value === 'function' ? value.bind(target) : value;
      return async input => {
        const prior = await store.getSubmission(input.submissionId);
        record({ event: 'store-entry', method: key, submissionId: input.submissionId, existed: prior !== null });
        before();
        let result, failure, rejected = false;
        try { result = await value.call(target, input); }
        catch (error) { failure = error; rejected = true; }
        try {
          const row = await store.getSubmission(input.submissionId);
          record({ event: 'store-observed', method: key, id: input.id, submissionId: input.submissionId, accepted: row !== null, fresh: prior === null && row !== null, controllerFailed: failed() });
        } catch (inspection) {
          if (rejected) throw new AggregateError([failure, inspection], 'Native fixture admission and evidence collection failed', { cause: failure });
          throw inspection;
        }
        if (rejected) throw failure;
        after();
        return result;
      };
    } }) };
  } };
}
