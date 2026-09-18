import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionScope } from '../lib/extensions.mjs';
import { RunError } from '../lib/primitives.mjs';

function fixture(notify = () => {}) {
  const controller = new AbortController();
  return { controller, scope: extensionScope(controller.signal, notify) };
}

for (const boundary of ['close', 'abort']) {
  test(`extension ${boundary} prevents callback entry`, () => {
    const { controller, scope } = fixture();
    const reason = new Error('caller stopped');
    if (boundary === 'close') scope.close(); else controller.abort(reason);
    let called = false;
    assert.throws(() => scope.invoke('fixture', () => { called = true; }, []), error => boundary === 'close' ? error instanceof RunError : error === reason);
    assert.equal(called, false);
  });
}

test('synchronous extension preserves receiver, mutable arguments and thrown identity', () => {
  const { scope } = fixture();
  const receiver = {}, task = {}, cause = new Error('synchronous failure');
  assert.equal(scope.invoke('fixture', function (input) { assert.equal(this, receiver); input.changed = true; return input; }, [task], receiver), task);
  assert.equal(task.changed, true);
  assert.throws(() => scope.invoke('fixture', () => { throw cause; }, []), error => error === cause);
  assert.deepEqual(scope.failures, []);
});

test('failure reporting cannot discard enrolled work or its rejection cause', async () => {
  const report = new Error('report failed'), rejection = new Error('work failed');
  const { scope } = fixture(() => { throw report; });
  let reject;
  const work = new Promise((_, no) => { reject = no; });
  assert.throws(() => scope.invoke('fixture', () => work, []), RunError);
  let drained = false;
  const drain = scope.drain().then(() => { drained = true; });
  await Promise.resolve();
  assert.equal(drained, false);
  reject(rejection);
  await drain;
  assert.equal(scope.failures.length, 3);
  assert.equal(scope.failures[1].cause, report);
  assert.equal(scope.failures[2].cause, rejection);
});

test('thenable completion is observed once without assimilating its value', async () => {
  const { scope } = fixture();
  let gets = 0, calls = 0, valueGets = 0;
  const value = { get then() { valueGets++; throw new Error('completion values are not results'); } };
  const completion = { get then() {
    gets++;
    return function (resolve) { assert.equal(this, completion); calls++; resolve(value); };
  } };
  assert.throws(() => scope.invoke('fixture', () => completion, []), RunError);
  await scope.drain();
  assert.deepEqual({ gets, calls, valueGets }, { gets: 1, calls: 1, valueGets: 0 });
  assert.equal(scope.failures.length, 1);
});

test('reentrant completion cannot start another extension after failure', async () => {
  const { scope } = fixture();
  let called = false;
  const completion = { then(resolve) {
    assert.throws(() => scope.invoke('nested', () => { called = true; }, []), /entry has closed/);
    resolve();
  } };
  assert.throws(() => scope.invoke('fixture', () => completion, []), RunError);
  await scope.drain();
  assert.equal(called, false);
  assert.equal(scope.failures.length, 1);
});

test('throwing completion method retains its original cause', async () => {
  const { scope } = fixture();
  const cause = new Error('broken completion method');
  assert.throws(() => scope.invoke('fixture', () => ({ then() { throw cause; } }), []), RunError);
  await scope.drain();
  assert.equal(scope.failures.length, 2);
  assert.equal(scope.failures[1].cause, cause);
});

test('independent asynchronous failure is retained even when it reuses cancellation reason', async () => {
  const { controller, scope } = fixture();
  const cancellation = new DOMException('cancel', 'AbortError');
  let reject;
  const work = new Promise((_, no) => { reject = no; });
  assert.throws(() => scope.invoke('fixture', () => work, []), RunError);
  controller.abort(cancellation);
  reject(cancellation);
  await scope.drain();
  assert.equal(scope.failures.length, 2);
  assert.equal(scope.failures[1].cause, cancellation);
});
