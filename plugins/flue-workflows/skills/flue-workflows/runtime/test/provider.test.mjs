import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { credentials } from '../lib/provider.mjs';
import { RunError } from '../lib/primitives.mjs';

const token = 'test-access-token-must-not-leak';

async function authFile(t, records) {
  const dir = await mkdtemp(join(tmpdir(), 'flue-auth-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'auth.json');
  await writeFile(path, JSON.stringify(records));
  return path;
}

// Any refresh or login would need the network; fail the test if one is attempted.
function forbidNetwork(t) {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network access attempted'); };
  t.after(() => { globalThis.fetch = original; });
}

const oauth = (expires) => ({ type: 'oauth', access: token, refresh: 'test-refresh-token', expires });

for (const [providerId, model] of [['anthropic', 'anthropic/claude-sonnet-5'], ['openai-codex', 'openai-codex/gpt-5.5']]) {
  test(`--auth pi reads an existing ${providerId} login read-only`, async t => {
    forbidNetwork(t);
    const path = await authFile(t, { [providerId]: oauth(Date.now() + 3_600_000) });
    const before = { bytes: await readFile(path), mtime: (await stat(path)).mtimeMs };

    const { source, provider } = await credentials({ model, auth: 'pi', authFile: path });
    const resolved = await provider.auth.apiKey.resolve();

    assert.deepEqual(source, { kind: 'pi-subscription', path });
    assert.equal(resolved.auth.apiKey, token);
    assert.doesNotMatch(JSON.stringify(source), new RegExp(token));
    assert.deepEqual(await readFile(path), before.bytes);
    assert.equal((await stat(path)).mtimeMs, before.mtime);
  });

  for (const [label, record] of [
    ['an expired login', oauth(Date.now() - 1)],
    ['a login that expires within a minute', oauth(Date.now() + 30_000)],
    ['an API-key record', { type: 'api_key', key: token }],
    ['no record', undefined],
  ]) {
    test(`--auth pi refuses ${label} for ${providerId} without refreshing`, async t => {
      forbidNetwork(t);
      const path = await authFile(t, record ? { [providerId]: record } : {});
      const before = await readFile(path);
      await assert.rejects(credentials({ model, auth: 'pi', authFile: path }), error =>
        error instanceof RunError && error.message === `No valid ${providerId} OAuth credential at ${path}; log in through pi first.`);
      assert.deepEqual(await readFile(path), before);
    });
  }
}

test('--auth pi refuses providers without a pi login route', async t => {
  forbidNetwork(t);
  const path = await authFile(t, { openai: oauth(Date.now() + 3_600_000) });
  await assert.rejects(credentials({ model: 'openai/gpt-5.5', auth: 'pi', authFile: path }), error =>
    error instanceof RunError && /--auth pi supports openai-codex\/… and anthropic\/… models only/.test(error.message));
});
