import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { workers, validator } from '../lib/workers.mjs';
import { json } from '../lib/files.mjs';
import { message } from '../lib/primitives.mjs';

const config = { model: 'openai-codex/gpt-5.5', effort: 'low', cwd: '/tmp', timeoutMs: 10_000 };
const { normalize } = workers({ config, provider: openaiCodexProvider(), emit() {} });

test('bad options/model/tool/schema fail locally rather than falling back', () => {
  assert.throws(() => normalize('hello', { models: 'other' }), /Unknown.*models/);
  assert.throws(() => normalize('hello', { model: 'anthropic/anything' }), /not available under the selected/);
  assert.throws(() => normalize('hello', { tools: ['missing'] }), /tools must/);
  assert.throws(() => normalize('hello', { schema: { type: 'object', propreties: {} } }), error => {
    assert.match(message(error), /Invalid result schema:.*unknown keyword/);
    assert.equal(message(error).match(/propreties/g)?.length, 1, 'the cause is printed once');
    return true;
  });
  assert.throws(() => normalize('hello', { isolation: 'container' }), /isolation must be/);
});

test('custom tool maps accept plain and null-prototype objects', () => {
  for (const prototype of [Object.prototype, null]) {
    const extra = Object.assign(Object.create(prototype), { custom: () => ({ name: 'custom', parameters: { type: 'object' }, execute() {} }) });
    const worker = workers({ config, provider: openaiCodexProvider(), tools: extra, emit() {} });
    assert.throws(() => workers({ config, provider: openaiCodexProvider(), hook: async () => {}, emit() {} }), /synchronous/);
    assert.deepEqual(worker.normalize('work', { tools: ['custom'] }).tools, ['custom']);
  }
});

test('result schemas validate formats and exclusive unions, not a lossy translation', () => {
  const validate = validator({ type: 'object', properties: {
    address: { type: 'string', format: 'email' },
    value: { oneOf: [{ type: 'integer' }, { minimum: 0, type: 'number' }] },
  }, required: ['address', 'value'], additionalProperties: false });
  assert.equal(validate({ address: 'not an email', value: -1 }), false);
  assert.equal(validate({ address: 'a@example.invalid', value: 2 }), false);
  assert.equal(validate({ address: 'a@example.invalid', value: -1 }), true);
});

test('compiled result validators own the schema behind their content key', () => {
  const schema = { type: 'object', properties: { value: { enum: [{ stamp: 'original' }] } }, required: ['value'], additionalProperties: false };
  const key = json(schema);
  const validate = validator(schema);
  schema.properties.value.enum[0].stamp = 'changed';
  assert.equal(validate({ value: { stamp: 'original' } }), true);
  assert.equal(validate({ value: { stamp: 'changed' } }), false);
  assert.equal(validator(JSON.parse(key)), validate);
  const changed = validator(schema);
  assert.notEqual(changed, validate);
  assert.equal(changed({ value: { stamp: 'changed' } }), true);
  assert.equal(changed({ value: { stamp: 'original' } }), false);
  assert.equal(validate({ value: { stamp: 'original' } }), true);
});

test('per-call schemas and native-hook data are ordinary JSON, not predefined roles', () => {
  for (const field of ['discovered_file', 'another_shape']) {
    const task = normalize('work', { schema: { type: 'object', properties: { [field]: { type: 'string' } } }, data: { arbitrary: [42] } });
    assert(task.schema.properties[field]);
    assert.deepEqual(task.data, { arbitrary: [42] });
    assert.doesNotThrow(() => json(task));
  }
  assert.throws(() => json({ unsupported: undefined }), /JSON/);
  assert.throws(() => json({ unsupported: NaN }), /JSON/);
});
