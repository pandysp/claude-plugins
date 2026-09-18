import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { admissionDatabase } from '../lib/admission.mjs';
import { traceAdmissions } from './fixtures/admission-store.mjs';

async function fixture(t, method) {
  const root = await mkdtemp(join(tmpdir(), 'flue-admission-store-'));
  const controller = new AbortController(), reason = new Error('fixture-closed-admission');
  const database = admissionDatabase(join(root, 'native.sqlite'), controller.signal);
  t.after(async () => { await database.close(); await rm(root, { recursive: true }); });
  await database.migrate();
  const { submissionStore: store } = await database.connect();
  const input = { submissionId: randomUUID(), agent: 'fixture', id: 'one', message: { kind: 'user', body: 'before' }, acceptedAt: new Date().toISOString(), ...(method === 'admitDirect' ? { kind: 'direct' } : {}) };
  return { store, input, close: () => controller.abort(reason), reason };
}

for (const method of ['admitDispatch', 'admitDirect']) {
  test(`${method}: closure denies fresh acceptance but preserves native replay and conflict validation`, async t => {
    const { store, input, close, reason } = await fixture(t, method);
    await store[method](input);
    close();
    const replay = await store[method](input);
    assert.equal((method === 'admitDispatch' ? replay.submission : replay).submissionId, input.submissionId);
    const fresh = { ...input, submissionId: randomUUID(), id: 'two' };
    await assert.rejects(store[method](fresh), error => error === reason);
    assert.equal(await store.getSubmission(fresh.submissionId), null);
    const different = { ...input, message: { kind: 'user', body: 'changed' } };
    if (method === 'admitDispatch') assert.equal((await store[method](different)).kind, 'conflict');
    else await assert.rejects(store[method](different), /Internal direct admission returned an unexpected result/);
    assert.equal((await store.getSubmission(input.submissionId)).input.message.body, 'before');
  });

  test(`${method}: pinned SQLite acceptance completes before the next synchronous closure`, async t => {
    const { store, input, close } = await fixture(t, method);
    const issued = store[method](input);
    close();
    const result = await issued;
    assert.equal((method === 'admitDispatch' ? result.submission : result).submissionId, input.submissionId);
    assert.equal((await store.getSubmission(input.submissionId)).submissionId, input.submissionId);
  });
}

for (const phase of ['trace', 'query', 'none']) test(`native admission fixture preserves original failures (${phase})`, async t => {
  const { store: native, input } = await fixture(t, 'admitDirect');
  await native.admitDirect(input);
  const inspection = new Error(`fixture-native-${phase}-failure`);
  let original;
  const observed = new Proxy(native, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (key === 'admitDirect') return async input => {
      try { return await value.call(target, input); }
      catch (error) { original = error; throw error; }
    };
    if (key === 'getSubmission') return (...args) => {
      if (original && phase === 'query') throw inspection;
      return value.apply(target, args);
    };
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const adapter = traceAdmissions({ connect: () => ({ submissionStore: observed }) }, {
    record: event => { if (phase === 'trace' && event.event === 'store-observed') throw inspection; },
  });
  const { submissionStore: store } = await adapter.connect();
  await assert.rejects(store.admitDirect({ ...input, message: { kind: 'user', body: 'changed' } }), error => {
    assert.match(original.message, /Internal direct admission returned an unexpected result/);
    if (phase === 'none') assert.equal(error, original);
    else {
      assert.ok(error instanceof AggregateError, 'Native admission failure must survive fixture inspection/reporting failure');
      assert.deepEqual(error.errors, [original, inspection]);
      assert.equal(error.errors[0], original); assert.equal(error.errors[1], inspection);
      assert.equal(error.cause, original);
    }
    return true;
  });
  assert.equal((await native.getSubmission(input.submissionId)).input.message.body, 'before');
});

test('native admission fixture preserves a reporting-only error after actual acceptance', async t => {
  const { store: native, input } = await fixture(t, 'admitDirect');
  const original = new Error('fixture-reporting-only');
  const adapter = traceAdmissions({ connect: () => ({ submissionStore: native }) }, {
    record: event => { if (event.event === 'store-observed') throw original; },
  });
  const { submissionStore: store } = await adapter.connect();
  await assert.rejects(store.admitDirect(input), error => error === original);
  assert.equal((await native.getSubmission(input.submissionId)).submissionId, input.submissionId);
});
