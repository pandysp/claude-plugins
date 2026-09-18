import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sqlite } from '@flue/runtime/node';
import { load, save } from '../lib/files.mjs';
import { message } from '../lib/primitives.mjs';

const exec = promisify(execFile);
const child = fileURLToPath(new URL('./fixtures/native-worker-child.mjs', import.meta.url));
const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
const pendingPreload = fileURLToPath(new URL('./fixtures/pending-read-preload.mjs', import.meta.url));
const env = Object.fromEntries(['PATH', 'TMPDIR', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'flue-admission-'));
  const workspace = join(root, 'workspace'), dir = join(workspace, 'runs', 'fixture');
  const program = join(root, 'source', 'program.mjs'), home = join(root, 'home');
  let pinned, invocation = 0;
  t.after(async () => {
    if (pinned) {
      assert.equal(dirname(pinned), join(runtimeRoot, 'programs'));
      await rm(pinned, { recursive: true });
    }
    await rm(root, { recursive: true });
  });
  await mkdir(dirname(program)); await mkdir(home);
  await writeFile(program, `export default run => run.agent('Return the checked answer.', {
    key: 'answer', tools: [], schema: { type: 'object', properties: { answer: { type: 'integer' } }, required: ['answer'], additionalProperties: false },
  });\n`);
  async function invoke(mode, faults = [], beforeInspect = () => {}, route = 'dispatch', observe = {}) {
    const crashEvent = faults.includes('secondary-crash') ? 'fixture-secondary-pending-crash' : 'fixture-crash-after-store';
    const crashing = !observe.pendingFailure && (faults.includes('crash-after-store') || faults.includes('secondary-crash'));
    const trace = join(root, `${invocation++}.trace.jsonl`), diagnostic = trace + '.pending.json';
    let result, executionFailure;
    try {
      result = { ...await exec(process.execPath, [...(observe.pendingFailure ? ['--import', pendingPreload] : []), child, workspace, mode, program, trace], {
        env: { ...env, HOME: home, FLUE_NATIVE_ADMISSION_FAILURES: faults.join(','), FLUE_NATIVE_ADMISSION_ROUTE: route,
          FLUE_NATIVE_FIXTURE_JOBS: String(observe.jobs ?? 1),
          FLUE_NATIVE_PENDING_FAILURE: observe.pendingFailure ?? '', FLUE_NATIVE_PENDING_PROOF: diagnostic,
          FLUE_NATIVE_OBSERVE_INSTANCE: observe.id ?? '', FLUE_NATIVE_OBSERVE_SUBMISSION: observe.submissionId ?? '' }, timeout: 90_000, killSignal: 'SIGKILL',
      }), code: 0 };
    } catch (error) {
      if (error.killed || typeof error.code !== 'number' && !(crashing && error.signal === 'SIGKILL')) throw error;
      executionFailure = error;
      result = { code: error.code, signal: error.signal, stdout: error.stdout, stderr: error.stderr };
    }
    let phase = 'manifest';
    try {
      pinned = (await load(join(dir, 'manifest.json'))).program;
      phase = 'inspection setup';
      await beforeInspect({ dir, trace, executionFailure });
      phase = 'trace';
      const events = (await readFile(trace, 'utf8')).trim().split('\n').map(JSON.parse);
      const end = events.at(-1);
      assert.equal(end.event, crashing ? crashEvent : 'finished', JSON.stringify(events));
      if (crashing) assert.equal(result.signal, 'SIGKILL', 'Only the requested fixture crash may bypass normal termination');
      assert.equal(end.fetchCalls, 0);
      phase = 'pending probe diagnostic';
      const pendingDiagnostic = observe.pendingFailure ? await load(diagnostic) : null;
      phase = 'state';
      const state = await load(join(dir, 'state.json'));
      return { ...result, events, state, job: Object.values(state.jobs)[0], modelCalls: end.modelCalls, pendingDiagnostic };
    } catch (inspection) {
      if (!executionFailure) throw inspection;
      throw new AggregateError([executionFailure, inspection], `Native fixture execution failed (exit ${executionFailure.code}): ${message(executionFailure)}; ${phase} inspection failed: ${message(inspection)}`, { cause: executionFailure });
    }
  }
  async function forgetReceipt(status = 'pending', keepReceipt = false) {
    const state = await load(join(dir, 'state.json'));
    for (const job of Object.values(state.jobs)) { job.status = status; if (!keepReceipt) job.receipt = null; }
    await save(join(dir, 'state.json'), state);
  }
  async function confirmAccepted(result, receiptRequired = true) {
    const receipt = receiptRequired ? result.events.find(event => event.event === 'native-receipt')?.receipt
      : result.events.find(event => event.event === 'store-observed' && event.accepted);
    assert.ok(receipt?.submissionId, 'Fault must happen after genuine native admission evidence');
    const database = sqlite(join(dir, 'flue.sqlite'));
    try {
      const { submissionStore } = await database.connect();
      const row = await submissionStore.getSubmission(receipt.submissionId);
      assert.equal(row?.submissionId, receipt.submissionId, 'Native acceptance must survive receipt delivery failure');
      // The row proves admission, not settlement. Outcomes come from native read.
    } finally { await database.close(); }
  }
  return { invoke, forgetReceipt, confirmAccepted };
}

for (const route of ['dispatch', 'direct']) {
  test(`native ${route} admission control reaches the real store and canonical settlement`, async t => {
    const f = await fixture(t), result = await f.invoke('run', [], undefined, route);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.modelCalls, 1);
    assert.equal(result.job.status, 'completed');
    const rows = result.events.filter(event => event.event === 'store-observed' && event.fresh);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].method, route === 'dispatch' ? 'admitDispatch' : 'admitDirect');
    assert.equal(rows[0].controllerFailed, false);
    await f.confirmAccepted(result);
  });

  test(`fatal controller failure prevents already-issued native ${route} acceptance`, async t => {
    const f = await fixture(t), result = await f.invoke('run', ['controller-before-store'], undefined, route);
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.state.status, 'failed');
    assert.equal(result.state.cleanShutdown, false);
    assert.match(result.state.error, /fixture-native-admission-controller-error/);
    const rows = result.events.filter(event => event.event === 'store-observed');
    assert.ok(rows.length, 'An issued request must reach the actual public admission boundary');
    assert.ok(rows.every(row => row.method === (route === 'dispatch' ? 'admitDispatch' : 'admitDirect')));
    assert.equal(rows.filter(row => row.fresh && row.controllerFailed).length, 0, 'No fresh acceptance after observed fatal failure, including issued requests');
    assert.equal(result.events.filter(event => event.event === 'native-receipt').length, 0);
    assert.equal(result.modelCalls, 0);
    assert.equal(result.job.status, 'not-started');
  });

  test(`native ${route} receipt arriving after fatal failure remains owned`, async t => {
    const f = await fixture(t), result = await f.invoke('run', ['controller-after-store'], undefined, route);
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.state.cleanShutdown, false);
    assert.match(result.state.error, /fixture-native-admission-controller-error/);
    const rows = result.events.filter(event => event.event === 'store-observed' && event.fresh);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].controllerFailed, false, 'This case admits before, not after, controller failure');
    await f.confirmAccepted(result);
    ownedSettlement(result);
  });
}

for (const phase of ['manifest', 'trace', 'state']) {
  test(`admission fixture retains child failure when ${phase} inspection fails`, async t => {
    const f = await fixture(t);
    let execution;
    await assert.rejects(f.invoke('run', [phase === 'manifest' ? 'fixture-invalid-fault' : 'receipt-always'], async ({ dir, trace, executionFailure }) => {
      execution = executionFailure;
      await writeFile(phase === 'trace' ? trace : join(dir, 'state.json'), '{');
    }), error => {
      assert.ok(error instanceof AggregateError, 'Both execution and inspection failures must remain available');
      const [childFailure, inspection] = error.errors;
      if (execution) assert.equal(childFailure, execution, 'Do not replace the original execution error');
      assert.equal(error.cause, childFailure);
      assert.equal(childFailure.code, 1);
      assert.equal(typeof childFailure.stdout, 'string');
      const diagnostic = phase === 'manifest' ? /Unknown native admission fixture failure/ : /fixture-accepted-receipt-loss/;
      assert.match(childFailure.stderr, diagnostic);
      assert.match(error.message, diagnostic);
      assert.match(error.message, new RegExp(phase));
      if (phase === 'manifest') { assert.equal(inspection.code, 'ENOENT'); assert.match(inspection.path, /manifest\.json$/); }
      else assert.equal(inspection.name, 'SyntaxError');
      return true;
    });
  });
}

test('admission fixture preserves an inspection-only error after a successful child', async t => {
  const f = await fixture(t), failure = new Error('fixture-inspection-only');
  await assert.rejects(f.invoke('run', [], () => { throw failure; }), error => error === failure);
});

for (const pendingFailure of ['aborted', 'unexpected', 'settlement-trace']) test(`admission pending probe preserves ${pendingFailure} rejection by identity`, async t => {
  const f = await fixture(t);
  const result = await f.invoke('run', ['secondary-crash'], undefined, 'dispatch', { jobs: 2, pendingFailure });
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.events.find(event => event.event === 'fixture-primary-completed').reply.data.result[0].answer, 42);
  assert.equal(result.events.some(event => event.event === 'fixture-secondary-pending-crash'), false);
  assert.equal(result.events.filter(event => event.event === 'sdk-cleanup').length, 1);
  const proof = result.pendingDiagnostic;
  assert.equal(proof.nativeName, 'AgentRunError');
  assert.equal(proof.nativeOutcome, 'aborted');
  assert.equal(proof.submissionId, result.events.find(event => event.event === 'fixture-secondary-accepted').receipt.submissionId);
  assert.equal(proof.originalName, pendingFailure === 'unexpected' ? 'Error' : 'AgentRunError');
  if (pendingFailure === 'settlement-trace') {
    assert.equal(proof.originalReachable, true, 'Native read failure must survive settlement trace failure');
    assert.equal(proof.reportingReachable, true);
    assert.equal(proof.originalCause, true);
    assert.equal(proof.observedName, 'AggregateError');
  } else {
    assert.equal(proof.originalIdentity, true, 'The pending probe must preserve the exact rejected observation');
    assert.equal(proof.originalReachable, true);
  }
  assert.ok(result.stderr.includes(proof.originalMessage), result.stderr);
});

function failedReceipt(result) {
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.state.status, 'failed');
  assert.equal(result.state.cleanShutdown, false);
  assert.match(result.state.error, /fixture-accepted-receipt-loss/);
  assert.match(result.stderr, /fixture-accepted-receipt-loss/);
  const receipt = result.events.find(event => event.event === 'native-receipt').receipt;
  assert.ok(result.events.some(event => event.event === 'receipt-delivery-failed' && event.submissionId === receipt.submissionId));
}

// The receipt never arrived, not even on the shutdown replay: the work is
// still aborted and observed, but no outcome is attributed. The run says so.
function unknownReceipt(result) {
  assert.equal(result.events.filter(event => event.event === 'native-abort').length, 1, 'Accepted work must remain owned when receipt delivery rejects');
  assert.ok(result.events.some(event => event.event === 'native-settlement'), 'Abort acknowledgement is not terminal observation');
  assert.equal(result.job.status, 'pending');
  assert.equal(result.job.receipt, null);
  assert.match(result.state.error, /Worker receipt is unknown/);
}

function ownedSettlement(result) {
  assert.equal(result.events.filter(event => event.event === 'native-abort').length, 1, 'Accepted work must remain owned when receipt delivery rejects');
  const terminal = result.events.filter(event => event.event === 'native-settlement').at(-1);
  assert.ok(terminal, 'Abort acknowledgement is not terminal observation');
  assert.notEqual(result.job.status, 'not-started');
  assert.notEqual(result.job.status, 'pending');
  assert.equal(result.job.status, terminal.outcome === 'completed' ? 'completed-uncollected' : terminal.outcome);
}

test('fatal startup aborts and observes accepted but unsettled crash recovery', async t => {
  const f = await fixture(t), crashed = await f.invoke('run', ['crash-after-store']);
  assert.equal(crashed.signal, 'SIGKILL');
  assert.equal(crashed.modelCalls, 0);
  assert.equal(crashed.job.status, 'pending');
  assert.equal(crashed.job.receipt, null);
  await f.confirmAccepted(crashed, false);
  const admitted = crashed.events.find(event => event.event === 'store-observed' && event.accepted);
  const failed = await f.invoke('resume', ['controller-after-start', 'model-until-abort'], undefined, 'dispatch', admitted);
  assert.equal(failed.code, 1, failed.stderr);
  assert.equal(failed.state.cleanShutdown, false);
  assert.match(failed.state.error, /fixture-native-admission-controller-error/);
  assert.equal(failed.events.filter(event => event.event === 'store-observed' && event.fresh).length, 0);
  const events = failed.events.map(event => event.event);
  assert.ok(events.includes('canonical-read-pending-before-fatal'));
  assert.ok(events.indexOf('canonical-read-pending-before-fatal') < events.indexOf('controller-failed'));
  assert.equal(failed.events.find(event => event.event === 'model-awaiting-abort').aborted, false);
  assert.equal(events.filter(event => event === 'model-aborted').length, 1);
  ownedSettlement(failed);
  assert.equal(failed.job.status, 'aborted');
  assert.ok(events.indexOf('native-settlement') < events.indexOf('native-stop'));
  const resumed = await f.invoke('resume');
  assert.equal(resumed.code, 2, resumed.stderr);
  assert.equal(resumed.modelCalls, 0);
  assert.equal(resumed.job.receipt.submissionId, admitted.submissionId);
  assert.equal(resumed.job.status, 'aborted');
});

for (const loseReceipt of [false, true]) test(`fatal startup cannot assign a secondary outcome to the primary worker (receipt lost: ${loseReceipt})`, async t => {
  const f = await fixture(t), crashed = await f.invoke('run', ['secondary-crash'], undefined, 'dispatch', { jobs: 2 });
  assert.equal(crashed.job.status, 'pending');
  assert.equal(crashed.job.receipt, null);
  const primary = crashed.events.find(event => event.event === 'fixture-primary-completed');
  const secondary = crashed.events.find(event => event.event === 'fixture-secondary-accepted');
  assert.equal(primary.reply.data.result[0].answer, 42, 'The primary must complete canonically before the crash');
  assert.notEqual(primary.receipt.submissionId, secondary.receipt.submissionId);
  const failed = await f.invoke('resume', ['controller-after-start', 'model-until-abort', ...(loseReceipt ? ['receipt-always'] : [])], undefined, 'dispatch', {
    id: secondary.id, submissionId: secondary.receipt.submissionId,
  });
  assert.equal(failed.code, 1, failed.stderr);
  assert.equal(failed.state.cleanShutdown, false);
  assert.match(failed.state.error, /fixture-native-admission-controller-error/);
  assert.equal(failed.events.filter(event => event.event === 'store-observed' && event.fresh).length, 0);
  const names = failed.events.map(event => event.event);
  assert.ok(names.indexOf('canonical-read-pending-before-fatal') >= 0);
  assert.ok(names.indexOf('canonical-read-pending-before-fatal') < names.indexOf('controller-failed'));
  assert.equal(names.filter(name => name === 'model-aborted').length, 1);
  const settlements = failed.events.filter(event => event.event === 'native-settlement');
  const settled = id => settlements.find(event => (typeof event.target === 'string' ? event.target : event.target.submissionId) === id);
  assert.equal(settled(secondary.receipt.submissionId)?.outcome, 'aborted', 'Secondary work must still be owned and canonically observed');
  assert.ok(settlements.every(event => failed.events.indexOf(event) < names.indexOf('native-stop')));
  // Lost identity can remain explicit uncertainty; it cannot borrow another submission's outcome.
  assert.ok(['completed-uncollected', ...(loseReceipt ? ['pending'] : [])].includes(failed.job.status),
    `A completed primary must not inherit the secondary outcome: ${failed.job.status}`);
  if (failed.job.status === 'pending') assert.match(failed.state.error, /primary|worker receipt is unknown/i);
  else assert.equal(settled(primary.receipt.submissionId)?.outcome, 'completed');
  if (loseReceipt) {
    assert.ok(failed.events.some(event => event.event === 'native-receipt' && event.receipt.submissionId === primary.receipt.submissionId), 'Recovery must obtain a real primary receipt before its delivery can fail');
    assert.ok(failed.events.some(event => event.event === 'receipt-delivery-failed' && event.submissionId === primary.receipt.submissionId), 'An armed fault is not evidence of receipt delivery failure');
    assert.match(failed.state.error, /fixture-accepted-receipt-loss/, 'The delivery failure must reach the run owner');
  }
  const resumed = await f.invoke('resume');
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.modelCalls, 0);
  assert.equal(resumed.job.receipt.submissionId, primary.receipt.submissionId);
  assert.equal(resumed.job.status, 'completed');
});

for (const keepReceipt of [false, true]) test(`fatal startup still owns admitted recovery (saved receipt: ${keepReceipt})`, async t => {
  const f = await fixture(t), first = await f.invoke('run');
  assert.equal(first.code, 0, first.stderr);
  await f.forgetReceipt('pending', keepReceipt);
  const failed = await f.invoke('resume', ['controller-after-start']);
  assert.equal(failed.code, 1, failed.stderr);
  assert.match(failed.state.error, /fixture-native-admission-controller-error/);
  assert.equal(failed.modelCalls, 0);
  assert.equal(failed.events.filter(event => event.event === 'store-observed' && event.fresh).length, 0);
  ownedSettlement(failed);
  const resumed = await f.invoke('resume');
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.modelCalls, 0);
  assert.equal(resumed.job.receipt.submissionId, first.job.receipt.submissionId);
});

test('retry of not-started intent is durably pending before native dispatch', async t => {
  const f = await fixture(t), first = await f.invoke('run');
  assert.equal(first.code, 0, first.stderr);
  await f.forgetReceipt('not-started');
  const failed = await f.invoke('resume', ['receipt-always']);
  failedReceipt(failed); await f.confirmAccepted(failed);
  assert.equal(failed.events.find(event => event.event === 'native-dispatch').intentStatus, 'pending', 'Durable retry intent must precede native acceptance');
  unknownReceipt(failed);
});

for (const recovery of [false, true]) for (const loss of ['receipt-once', 'receipt-always']) {
  test(`native accepted work stays owned after ${loss} (${recovery ? 'recovery' : 'initial'})`, async t => {
    const f = await fixture(t);
    if (recovery) {
      const first = await f.invoke('run');
      assert.equal(first.code, 0, first.stderr); assert.equal(first.modelCalls, 1);
      await f.forgetReceipt();
    }
    const failed = await f.invoke(recovery ? 'resume' : 'run', [loss]);
    failedReceipt(failed); await f.confirmAccepted(failed);
    (loss === 'receipt-once' ? ownedSettlement : unknownReceipt)(failed);
    const reentry = await f.invoke('resume');
    assert.ok([0, 2].includes(reentry.code), reentry.stderr);
    assert.equal(reentry.modelCalls, 0, 'Observed terminal work must not execute again');
    assert.equal(reentry.job.receipt.submissionId, failed.events.find(event => event.event === 'native-receipt').receipt.submissionId);
  });
}

for (const fault of ['abort-call', 'abort-ack']) {
  test(`receipt loss still observes native settlement after ${fault} failure`, async t => {
    const f = await fixture(t);
    const failed = await f.invoke('run', ['receipt-always', fault]);
    failedReceipt(failed); await f.confirmAccepted(failed); unknownReceipt(failed);
    assert.match(failed.state.error, new RegExp(`fixture-native-${fault}-error`));
    assert.equal(failed.events.filter(event => event.event === 'native-abort-acknowledged').length, fault === 'abort-call' ? 0 : 1);
  });
}

test('receipt loss and failed terminal observation preserve uncertainty and later native recovery', async t => {
  const f = await fixture(t);
  const failed = await f.invoke('run', ['receipt-always', 'read']);
  failedReceipt(failed); await f.confirmAccepted(failed);
  assert.equal(failed.events.filter(event => event.event === 'native-abort-acknowledged').length, 1);
  assert.equal(failed.events.filter(event => event.event === 'native-settlement').length, 0);
  assert.match(failed.state.error, /fixture-native-read-error/);
  assert.equal(failed.job.status, 'pending', 'An observation error must not become non-admission or a terminal outcome');
  const reentry = await f.invoke('resume');
  assert.ok([0, 2].includes(reentry.code), reentry.stderr);
  assert.equal(reentry.modelCalls, 0);
  assert.ok(['completed', 'failed', 'aborted'].includes(reentry.job.status));
});
