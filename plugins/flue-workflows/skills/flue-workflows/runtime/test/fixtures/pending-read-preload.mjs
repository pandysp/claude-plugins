// Terminalize a real native secondary before the fixture's pending probe.
// Capture exact escaped errors; no private native state or invented IDs.
import { registerHooks } from 'node:module';
import { appendFileSync, writeFileSync } from 'node:fs';
import { init, AgentRunError } from '@flue/runtime';

const mode = process.env.FLUE_NATIVE_PENDING_FAILURE;
if (!['aborted', 'unexpected', 'settlement-trace'].includes(mode)) throw new Error('Unknown native pending-probe diagnostic');
let original, nativeFailure, reading, receipt;
const reporting = new Error('fixture-native-settlement-trace-error');
const contains = (error, target, seen = new Set()) => {
  if (error === target) return true;
  if (!error || typeof error !== 'object' || seen.has(error)) return false;
  seen.add(error);
  return contains(error.cause, target, seen) || Array.isArray(error.errors) && error.errors.some(item => contains(item, target, seen));
};
const observe = (operation, promise) => promise.catch(error => {
  if (original && operation === (mode === 'settlement-trace' ? 'read' : 'dispatch')) {
    try {
      writeFileSync(process.env.FLUE_NATIVE_PENDING_PROOF, JSON.stringify({
        mode, operation, nativeName: nativeFailure.name, nativeOutcome: nativeFailure.outcome,
        originalName: original.name, originalMessage: original.message,
        observedName: error?.name, observedMessage: error?.message,
        originalIdentity: error === original, originalReachable: contains(error, original),
        reportingReachable: contains(error, reporting), originalCause: error?.cause === original,
        submissionId: receipt.submissionId,
      }, null, 2) + '\n');
    } catch (evidence) {
      throw new AggregateError([error, evidence], 'Pending diagnostic failure and evidence collection failed', { cause: error });
    }
  }
  throw error;
});

globalThis.__fluePendingInit = (...args) => {
  const handle = init(...args);
  return { ...handle, dispatch: async input => {
    const result = await handle.dispatch(input);
    if (input.idempotencyKey === 'fixture-secondary') {
      receipt = result;
      await handle.abort();
      reading = handle.read(result);
      try { await reading; throw new Error('Pending diagnostic requires a genuine native aborted settlement'); }
      catch (error) {
        if (!(error instanceof AgentRunError) || error.outcome !== 'aborted') throw error;
        nativeFailure = error;
      }
      original = mode === 'unexpected' ? new Error('fixture-pending-read-rejected') : nativeFailure;
      if (mode === 'unexpected') reading = Promise.reject(original);
      try { await reading; throw new Error('Pending diagnostic requires a rejected observation'); }
      catch (error) { if (error !== original) throw error; }
    }
    return result;
  }, read: (target, options) => receipt && (typeof target === 'string' ? target : target.submissionId) === receipt.submissionId
    ? reading : handle.read(target, options) };
};
globalThis.__fluePendingAppend = (path, data, ...options) => {
  const event = JSON.parse(data);
  if (mode === 'settlement-trace' && event.event === 'native-settlement' && event.outcome === 'aborted') throw reporting;
  return appendFileSync(path, data, ...options);
};

let fixture;
Object.defineProperty(globalThis, '__flueNativeFixture', {
  configurable: true, get: () => fixture,
  set(value) {
    fixture = { ...value, init: (...args) => {
      const handle = value.init(...args);
      return { ...handle,
        dispatch: (...input) => observe('dispatch', handle.dispatch(...input)),
        read: (...input) => observe('read', handle.read(...input)),
      };
    } };
  },
});
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/test/fixtures/native-worker-child.mjs')) {
      if (specifier === '@flue/runtime') return { url: 'flue-pending-test:runtime', shortCircuit: true };
      if (specifier === 'node:fs') return { url: 'flue-pending-test:fs', shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'flue-pending-test:runtime') return { format: 'module', shortCircuit: true,
      source: `export * from ${JSON.stringify(import.meta.resolve('@flue/runtime'))}; export const init = globalThis.__fluePendingInit;` };
    if (url === 'flue-pending-test:fs') return { format: 'module', shortCircuit: true,
      source: "export * from 'node:fs'; export const appendFileSync = globalThis.__fluePendingAppend;" };
    return next(url, context);
  },
});
