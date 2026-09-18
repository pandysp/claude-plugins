import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { discover, identity, check, digest } from './support.mjs';

const [inspectionFile, baselineFile, argsFile] = process.argv.slice(2);
assert.ok(inspectionFile && baselineFile && argsFile, 'Usage: node verify.mjs INSPECTION_JSON BASELINE_JSON ARGS_JSON');
const load = async path => JSON.parse(await readFile(path, 'utf8'));
const inspection = await load(inspectionFile);
const baseline = await load(baselineFile);
const args = await load(argsFile);
assert.equal(inspection.execution, 'finished', 'Inspect the failed/interrupted owner before checking its output');
assert.equal(inspection.ownerActive, false);
assert.equal(inspection.cleanShutdown, true);
const report = await load(inspection.result);
assert.equal(resolve(args.source), baseline.source);
assert.deepStrictEqual(await identity(baseline.source), baseline.identity, 'Original files, HEAD or index changed');
const inventory = await discover(baseline.source);
const include = args.include ?? inventory.map(item => item.id);
const selected = inventory.filter(item => include.includes(item.id));
const runnable = selected.filter(item => item.kind === 'function').slice(0, args.maxCases ?? include.length);
const omitted = selected.filter(item => !runnable.includes(item)).map(item => item.id);
assert.deepStrictEqual(report.discovered, inventory.map(item => item.id));
assert.deepStrictEqual(report.selected, selected.map(item => item.id));
assert.deepStrictEqual(report.outOfScope, inventory.filter(item => !include.includes(item.id)).map(item => item.id));
assert.deepStrictEqual(report.omitted.map(item => item.id), omitted);
assert.ok(report.omitted.every(item => typeof item.reason === 'string' && item.reason.length > 0));
assert.deepStrictEqual(report.attempted, runnable.map(item => item.id).sort());
assert.deepStrictEqual(report.items.map(item => item.id), runnable.map(item => item.id));
assert.ok(report.items.every(item => ['complete', 'failed'].includes(item.status)));
assert.deepStrictEqual(report.completed, report.items.filter(item => item.status === 'complete').map(item => item.id));
assert.deepStrictEqual(report.failed, report.items.filter(item => item.status === 'failed'));
for (const id of args.injectFailure ?? []) assert.ok(report.failed.some(item => item.id === id), `Injected failure was lost: ${id}`);
for (const item of report.items.filter(item => item.status === 'complete')) {
  const artifact = item.artifactKey === null ? null : inspection.jobs.find(job => job.key === item.artifactKey)?.artifact;
  if (item.branch === 'repaired') {
    assert.ok(artifact, `No final artifact: ${item.id}`);
    assert.equal(digest(await readFile(artifact.patch)), artifact.patchHash, 'Patch bytes do not match final inspection');
    assert.ok(artifact.changed.includes(`cases/${item.id}/implementation.mjs`));
    assert.ok(artifact.changed.every(path => path === `cases/${item.id}/implementation.mjs`), 'Candidate changed files outside its task');
  } else assert.equal(item.branch, 'unchanged');
  const checked = await check(baseline.source, artifact?.cwd ?? baseline.source, item.id);
  assert.equal(checked.passed, true, `${item.id}: ${checked.reason}`);
}
const status = report.failed.length === 0 && report.omitted.length === 0 ? 'complete' : report.completed.length ? 'partial' : 'failed';
assert.equal(report.status, status);
assert.deepStrictEqual(await identity(baseline.source), baseline.identity, 'Consumer checks changed the original source');
console.log(JSON.stringify({ reportVerified: true, status, completed: report.completed, failed: report.failed.map(item => item.id), omitted: report.omitted }, null, 2));
