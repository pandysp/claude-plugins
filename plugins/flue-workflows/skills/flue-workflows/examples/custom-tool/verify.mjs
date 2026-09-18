import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [inspectionPath, argsPath] = process.argv.slice(2);
if (!inspectionPath || !argsPath) throw new Error('Usage: node verify.mjs INSPECTION.json ARGS.json');
const inspection = JSON.parse(await readFile(inspectionPath, 'utf8'));
const args = JSON.parse(await readFile(argsPath, 'utf8'));
assert.equal(typeof args.text, 'string', 'args.text must be literal text');
assert.equal(inspection.execution, 'finished');
assert.equal(inspection.ownerActive, false);
assert.equal(inspection.cleanShutdown, true);
assert.equal(inspection.toolErrors, 0);
assert.equal(inspection.compositionErrors, 0);
const report = JSON.parse(await readFile(inspection.result, 'utf8'));
assert.equal(report.status, 'complete');
assert.deepEqual(report.omitted, []);
assert.deepEqual(report.result, {
  utf8Bytes: Buffer.byteLength(args.text, 'utf8'),
  codePoints: [...args.text].length,
  sha256: createHash('sha256').update(args.text, 'utf8').digest('hex'),
});
const job = inspection.jobs.find(item => item.key === 'text-facts');
assert.ok(job, 'The text-facts worker must be recorded');
assert.equal(job.status, 'completed');
const events = (await readFile(inspection.events, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
assert.ok(events.some(event => event.type === 'tool-completed' && event.tool === 'text_facts' && event.worker === job.id), 'A native text_facts tool completion must be recorded; a plausible answer alone is not enough');
console.log('PASS: actual custom-tool completion and independently checked text facts');
