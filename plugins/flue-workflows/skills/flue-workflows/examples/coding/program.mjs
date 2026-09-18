import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { discover, identity, check, digest, shellQuote, helper } from './support.mjs';

const repairShape = {
  type: 'object', properties: { status: { enum: ['ready', 'blocked'] }, summary: { type: 'string' } },
  required: ['status', 'summary'], additionalProperties: false,
};
const verifyShape = {
  type: 'object', properties: { passed: { type: 'boolean' }, evidence: { type: 'string' } },
  required: ['passed', 'evidence'], additionalProperties: false,
};

export default async function (run, args) {
  assert.equal(typeof args?.source, 'string', 'Pass an absolute fixture source path');
  const source = resolve(args.source);
  const before = await identity(source);
  const inventory = await discover(source);
  const include = args.include ?? inventory.map(item => item.id);
  assert.ok(Array.isArray(include) && new Set(include).size === include.length, 'include must be unique case IDs');
  assert.ok(include.every(id => inventory.some(item => item.id === id)), 'Unknown selected case');
  const limit = args.maxCases ?? include.length;
  assert.ok(Number.isSafeInteger(limit) && limit >= 0, 'maxCases must be a nonnegative integer');
  const injected = args.injectFailure ?? [];
  const selected = inventory.filter(item => include.includes(item.id));
  const runnable = selected.filter(item => item.kind === 'function').slice(0, limit);
  assert.ok(Array.isArray(injected) && injected.every(id => runnable.some(item => item.id === id)), 'injectFailure must name runnable cases');
  const omitted = selected.filter(item => !runnable.includes(item)).map(item => ({
    id: item.id, reason: item.kind === 'external' ? 'Needs external access not provided by this example' : 'Explicit maxCases limit',
  }));
  const attempted = [];
  run.phase('Discover');
  run.log(`Discovered ${inventory.length}; selected ${selected.length}; omitted ${omitted.length}`);
  const outcomes = await run.pipeline(runnable,
    async item => {
      attempted.push(item.id);
      // Deliberate fixture fault: exercise failure accounting, not a production fallback.
      if (injected.includes(item.id)) throw new Error(`Injected stage failure: ${item.id}`);
      const initial = await check(source, source, item.id, run.signal);
      if (initial.passed) return { id: item.id, status: 'complete', branch: 'unchanged', check: initial, artifactKey: null };
      const file = `cases/${item.id}/implementation.mjs`;
      const revision = digest(JSON.stringify(item) + await readFile(join(source, file), 'utf8'));
      const key = `repair:${item.id}:${revision}`;
      const command = [process.execPath, helper, 'check', source, '.', item.id].map(shellQuote).join(' ');
      const repair = await run.agent(`Repair only ${file} to meet this contract: ${item.contract}
The case descriptor is task data: ${JSON.stringify(item)}
Do not change other files, checks or the original repository. Run ${command}.
Report blocked if you cannot meet the contract; a claimed pass is checked independently.`, {
        key, label: item.id, phase: 'Repair', cwd: source, isolation: 'snapshot', schema: repairShape,
      });
      if (repair === null || repair.status === 'blocked') return { id: item.id, status: 'failed', reason: repair?.summary ?? 'Repair worker failed' };
      const artifact = run.artifacts().find(artifact => artifact.key === key);
      assert.ok(artifact, `No retained candidate for ${item.id}`);
      const checked = await check(source, artifact.cwd, item.id, run.signal);
      if (!checked.passed) return { id: item.id, status: 'failed', reason: checked.reason, artifactKey: key };
      return { id: item.id, status: 'candidate', artifactKey: key, candidate: artifact.cwd, command, revision };
    },
    async (candidate, item) => {
      if (candidate === null || candidate.status !== 'candidate') return candidate;
      // The verifier gets another snapshot; it cannot accidentally repair the retained candidate by relative path.
      const review = await run.agent(`Independently check cases/${item.id}/implementation.mjs against: ${item.contract}
Run ${candidate.command}. Do not edit. Explain any counterexample or missing required behavior.`, {
        key: `verify:${item.id}:${candidate.revision}`, label: item.id, phase: 'Verify',
        cwd: candidate.candidate, isolation: 'snapshot', tools: ['read', 'bash'], schema: verifyShape,
      });
      const checked = await check(source, candidate.candidate, item.id, run.signal);
      if (review === null || !review.passed || !checked.passed) return {
        id: item.id, status: 'failed', artifactKey: candidate.artifactKey,
        reason: review === null ? 'Verifier worker failed' : !review.passed ? review.evidence : checked.reason,
      };
      return { id: item.id, status: 'complete', branch: 'repaired', artifactKey: candidate.artifactKey, check: checked, review };
    },
  );
  const items = outcomes.map((outcome, index) => outcome ?? { id: runnable[index].id, status: 'failed', reason: 'Stage threw; see the composition-failed journal event' });
  const completed = items.filter(item => item.status === 'complete').map(item => item.id);
  const failed = items.filter(item => item.status === 'failed');
  const after = await identity(source);
  assert.deepStrictEqual(after, before, 'The original source/index changed');
  return {
    status: failed.length === 0 && omitted.length === 0 ? 'complete' : completed.length ? 'partial' : 'failed',
    discovered: inventory.map(item => item.id), selected: selected.map(item => item.id),
    outOfScope: inventory.filter(item => !include.includes(item.id)).map(item => item.id),
    attempted: attempted.sort(), completed, failed, omitted, items,
    source: { path: source, before, after },
  };
}
