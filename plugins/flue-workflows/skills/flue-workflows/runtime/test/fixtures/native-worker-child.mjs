// Model/provider transport is scripted; Flue/store stay real. Resume fault modes
// inject signal delivery or an observation error at the public read boundary.
import { registerHooks } from 'node:module';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { createAgentRouter } from '@flue/runtime/routing';
import { start, sqlite, local } from '@flue/runtime/node';
import { init, AgentRunError } from '@flue/runtime';
import { cleanupSessionResources } from '@earendil-works/pi-ai';
import { loader, checkProgram } from '../../lib/program.mjs';
import { traceAdmissions } from './admission-store.mjs';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';

const [workspace, mode, program, trace] = process.argv.slice(2);
const record = value => appendFileSync(trace, JSON.stringify(value) + '\n');
const faux = fauxProvider({ provider: 'openai', api: 'flue-fixture', models: [{ id: 'flue-fixture' }] });
const jobCount = Number(process.env.FLUE_NATIVE_FIXTURE_JOBS ?? 1);
if (![1, 2].includes(jobCount)) throw new Error('Native fixture supports one or two jobs');
const response = process.env.FLUE_NATIVE_FIXTURE_RESPONSE ?? 'structured';
if (!['structured', 'text'].includes(response)) throw new Error('Native fixture response must be structured or text');
let modelEntered;
const enteringModel = new Promise(resolve => { modelEntered = resolve; });
faux.setResponses(Array.from({ length: jobCount }, () => async (_context, options) => {
  record({ event: 'model-call' });
  if (admissionFaults.has('model-until-abort') || admissionFaults.has('secondary-crash') && faux.state.callCount === 2) {
    if (!options?.signal) throw new Error('Interrupted recovery fixture needs the native model abort signal');
    await new Promise(resolve => {
      const aborted = () => { record({ event: 'model-aborted' }); resolve(); };
      if (options.signal.aborted) aborted();
      else options.signal.addEventListener('abort', aborted, { once: true });
      record({ event: 'model-awaiting-abort', aborted: options.signal.aborted });
      modelEntered();
    });
  }
  return response === 'text' ? fauxAssistantMessage('checked text') : fauxAssistantMessage(fauxToolCall('submit_result', { answer: 42 }), { stopReason: 'toolUse' });
}));
let fetchCalls = 0;
globalThis.fetch = () => { fetchCalls++; throw new Error('Network forbidden in native worker fixture'); };
process.env.FLUE_NATIVE_FIXTURE_KEY = 'not-a-credential';
const admissionFaults = new Set((process.env.FLUE_NATIVE_ADMISSION_FAILURES ?? '').split(',').filter(Boolean));
if ([...admissionFaults].some(fault => !['receipt-once', 'receipt-always', 'abort-call', 'abort-ack', 'read', 'controller-before-store', 'controller-after-store', 'controller-after-start', 'crash-after-store', 'model-until-abort', 'secondary-crash'].includes(fault))) throw new Error('Unknown native admission fixture failure');
const route = process.env.FLUE_NATIVE_ADMISSION_ROUTE ?? 'dispatch';
if (!['dispatch', 'direct'].includes(route)) throw new Error('Unknown native admission fixture route');
let injected = false, reads = 0, receiptLost = false, server, controllerFailed = false;
const failController = () => {
  controllerFailed = true;
  server.emit('error', new Error('fixture-native-admission-controller-error'));
  record({ event: 'controller-failed' });
};
globalThis.__flueNativeFixture = {
  provider: faux.provider, local, AgentRunError, checkProgram,
  sqlite: path => {
    const database = sqlite(path);
    if (!['resume-store-cancel', 'resume-store-fatal'].includes(mode)) return database;
    return { ...database, async connect() {
      const stores = await database.connect();
      return { ...stores, submissionStore: new Proxy(stores.submissionStore, { get(target, key) {
        if (key === 'getSubmission') return async id => {
          const row = await target.getSubmission(id);
          record({ event: 'stop-at-store-lookup', mode });
          if (mode === 'resume-store-cancel') process.emit('SIGTERM'); else failController();
          return row;
        };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } }) };
    } };
  },
  createServer: (...args) => { server = createServer(...args); return server; },
  loader: async (...args) => {
    const code = await loader(...args);
    return { ...code, load: async name => {
      const module = await code.load(name);
      if (mode === 'resume-load-cancel' && name === 'program.mjs') {
        record({ event: 'signal-delivered-after-load' });
        process.emit('SIGTERM');
      }
      return module;
    } };
  },
  cleanupSessionResources: () => { record({ event: 'sdk-cleanup' }); return cleanupSessionResources(); },
  start: async options => {
    record({ event: 'native-start' });
    const db = traceAdmissions(options.db, {
      record, failed: () => controllerFailed,
      before: () => { if (!controllerFailed && admissionFaults.has('controller-before-store')) failController(); },
      after: () => {
        if (admissionFaults.has('crash-after-store')) {
          record({ event: 'fixture-crash-after-store', modelCalls: faux.state.callCount, fetchCalls });
          process.kill(process.pid, 'SIGKILL');
          throw new Error('Fixture SIGKILL did not terminate its own child');
        }
        if (!controllerFailed && admissionFaults.has('controller-after-store')) failController();
      },
    });
    const runtime = await start({ ...options, db });
    if (admissionFaults.has('model-until-abort')) {
      await enteringModel;
      const observer = new AbortController(), reason = new Error('fixture-canonical-observation-stop');
      const handle = init(options.agents[0], { id: process.env.FLUE_NATIVE_OBSERVE_INSTANCE });
      const read = handle.read(process.env.FLUE_NATIVE_OBSERVE_SUBMISSION, { signal: observer.signal });
      const pending = await Promise.race([read.then(() => false), new Promise(resolve => setImmediate(() => resolve(true)))]);
      if (!pending) throw new Error('Interrupted recovery fixture unexpectedly settled before fatal startup');
      observer.abort(reason);
      try { await read; } catch (error) { if (error !== reason) throw error; }
      record({ event: 'canonical-read-pending-before-fatal' });
    }
    if (admissionFaults.has('controller-after-start')) failController();
    return { ...runtime, stop: async () => { record({ event: 'native-stop' }); return runtime.stop(); } };
  },
  init: (...args) => {
    const handle = init(...args);
    let abortRequested = false;
    return { ...handle, abort: async (...abortArgs) => {
      abortRequested = true;
      record({ event: 'native-abort' });
      if (process.env.FLUE_EXTENSION_CLEANUP_FAILURE === 'abort') throw new Error('fixture-native-abort-error');
      if (admissionFaults.has('abort-call')) throw new Error('fixture-native-abort-call-error');
      await handle.abort(...abortArgs);
      record({ event: 'native-abort-acknowledged' });
      if (admissionFaults.has('abort-ack')) throw new Error('fixture-native-abort-ack-error');
    }, dispatch: input => {
      const intent = JSON.parse(readFileSync(join(workspace, 'runs', 'fixture', 'state.json'), 'utf8')).jobs[handle.id];
      record({ event: 'native-dispatch', input, intentStatus: intent.status });
      const send = async () => {
        if (route === 'dispatch') return handle.dispatch(input);
        const response = await createAgentRouter(args[0]).request('/' + encodeURIComponent(handle.id), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'user', body: input.message, initialData: input.initialData, idempotencyKey: input.idempotencyKey }),
        });
        const body = await response.json();
        record({ event: 'direct-response', status: response.status });
        if (response.status !== 202) throw new Error('Native direct fixture request failed: ' + JSON.stringify(body));
        return body;
      };
      const dispatched = send().then(async receipt => {
        if (admissionFaults.has('secondary-crash')) {
          const primary = await handle.read(receipt);
          record({ event: 'fixture-primary-completed', receipt, reply: primary });
          const secondary = await handle.dispatch({ message: 'A distinct second delivery.', initialData: input.initialData, idempotencyKey: 'fixture-secondary' });
          record({ event: 'fixture-secondary-accepted', id: handle.id, receipt: secondary });
          const observer = new AbortController(), reason = new Error('fixture-secondary-observation-stop');
          const reading = handle.read(secondary, { signal: observer.signal });
          const pending = await Promise.race([reading.then(() => false), new Promise(resolve => setImmediate(() => resolve(true)))]);
          if (!pending) throw new Error('Secondary unexpectedly settled before fixture crash');
          observer.abort(reason);
          try { await reading; } catch (error) { if (error !== reason) throw error; }
          record({ event: 'fixture-secondary-pending-crash', modelCalls: faux.state.callCount, fetchCalls });
          process.kill(process.pid, 'SIGKILL');
          throw new Error('Fixture SIGKILL did not terminate its own child');
        }
        record({ event: 'native-receipt', receipt });
        if (admissionFaults.has('receipt-always') || admissionFaults.has('receipt-once') && !receiptLost) {
          receiptLost = true;
          const error = new Error('fixture-accepted-receipt-loss');
          try { record({ event: 'receipt-delivery-failed', submissionId: receipt.submissionId }); }
          catch (reporting) { throw new AggregateError([error, reporting], 'Receipt delivery and evidence collection failed', { cause: error }); }
          throw error;
        }
        return receipt;
      });
      if (mode === 'resume-mutate-dispatch') return dispatched.then(receipt => {
        input.initialData.data.stamp = 'native-boundary';
        record({ event: 'dispatch-input-mutated' });
        return receipt;
      });
      return dispatched;
    }, read: (...readArgs) => {
      record({ event: 'native-read', target: readArgs[0] });
      if (admissionFaults.has('read')) return Promise.reject(new Error('fixture-native-read-error'));
      if (abortRequested && process.env.FLUE_EXTENSION_CLEANUP_FAILURE === 'read') return Promise.reject(new Error('fixture-native-settlement-error'));
      if (mode === 'resume-cancel-mixed' && reads++ < 2) {
        if (reads === 2) return Promise.reject(new Error('fixture-other-observer-failure'));
        process.emit('SIGTERM');
      }
      if (!injected && ['resume-cancel', 'resume-cancel-after-read', 'resume-read-abort'].includes(mode)) {
        injected = true;
        if (mode === 'resume-read-abort') return Promise.reject(new DOMException('fixture-native-observation-abort', 'AbortError'));
        const cancel = () => { record({ event: 'signal-delivered-at-read' }); process.emit('SIGTERM'); };
        if (mode === 'resume-cancel-after-read') return handle.read(...readArgs).then(reply => { cancel(); return reply; });
        cancel();
      }
      return handle.read(...readArgs).then(reply => {
        record({ event: 'native-settlement', target: readArgs[0], outcome: 'completed' });
        if (mode === 'resume-mutate-result' && !injected) {
          injected = true;
          setImmediate(() => {
            reply.data.result[0].answer = 99;
            record({ event: 'native-reply-mutated' });
          });
        }
        return reply;
      }, error => {
        try { if (error instanceof AgentRunError) record({ event: 'native-settlement', target: readArgs[0], outcome: error.outcome }); }
        catch (reporting) { throw new AggregateError([error, reporting], 'Native settlement and evidence collection failed', { cause: error }); }
        throw error;
      });
    } };
  },
};
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/lib/provider.mjs') && specifier === '@earendil-works/pi-ai/providers/openai') return { url: 'flue-native-test:provider', shortCircuit: true };
    if (context.parentURL?.endsWith('/lib/run.mjs') && ['@flue/runtime', '@flue/runtime/node'].includes(specifier)) return { url: 'flue-native-test:runtime', shortCircuit: true };
    if (context.parentURL?.endsWith('/lib/run.mjs') && specifier === 'node:net') return { url: 'flue-native-test:net', shortCircuit: true };
    if (context.parentURL?.endsWith('/lib/run.mjs') && specifier === '@earendil-works/pi-ai') return { url: 'flue-native-test:sdk', shortCircuit: true };
    if (context.parentURL?.endsWith('/lib/run.mjs') && specifier === './program.mjs') return { url: 'flue-native-test:program', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'flue-native-test:provider') return { format: 'module', source: 'export const openaiProvider = () => globalThis.__flueNativeFixture.provider;', shortCircuit: true };
    if (url === 'flue-native-test:runtime') return { format: 'module', source: 'export const { start, sqlite, local, init, AgentRunError } = globalThis.__flueNativeFixture;', shortCircuit: true };
    if (url === 'flue-native-test:net') return { format: 'module', source: 'export const { createServer } = globalThis.__flueNativeFixture;', shortCircuit: true };
    if (url === 'flue-native-test:sdk') return { format: 'module', source: 'export const { cleanupSessionResources } = globalThis.__flueNativeFixture;', shortCircuit: true };
    if (url === 'flue-native-test:program') return { format: 'module', source: 'export const { loader, checkProgram } = globalThis.__flueNativeFixture;', shortCircuit: true };
    return next(url, context);
  },
});
const { cli } = await import('../../lib/cli.mjs');
await cli(workspace, mode === 'run' ? ['run', program, '--id', 'fixture', '--cwd', dirname(program),
  '--model', 'openai/flue-fixture', '--auth', 'env:FLUE_NATIVE_FIXTURE_KEY', '--access', 'unrestricted',
  '--effort', 'off', '--concurrency', process.env.FLUE_NATIVE_FIXTURE_CONCURRENCY ?? String(jobCount), '--max-jobs', '5'] : ['resume', 'fixture']);
record({ event: 'finished', exitCode: process.exitCode ?? 0, modelCalls: faux.state.callCount, fetchCalls });
