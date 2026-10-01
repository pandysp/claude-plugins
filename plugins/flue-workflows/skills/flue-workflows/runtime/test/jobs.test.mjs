import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolEvents } from '../lib/jobs.mjs';

test('tool steps are journaled once, from stream chunks and from reset snapshots', () => {
  const events = [];
  const journaled = new Set(['tool-start:old', 'tool-completed:old']); // an earlier attempt's steps
  const observe = toolEvents(event => events.push(event), 'worker-1', journaled);
  // A re-read replays the earlier attempt's call: nothing new is journaled.
  observe({ type: 'tool-input', toolCallId: 'old', toolName: 'read' });
  observe({ type: 'tool-output', toolCallId: 'old' });
  // A live call that fails validation before execute().
  observe({ type: 'tool-input', toolCallId: 'a', toolName: 'submit_result' });
  observe({ type: 'tool-output-error', toolCallId: 'a', errorText: 'Invalid result' });
  // A batch Flue folded into a snapshot: only its message parts carry the calls.
  observe({ type: 'conversation-reset', snapshot: { messages: [{ parts: [
    { type: 'text', text: 'checking' },
    { type: 'dynamic-tool', toolCallId: 'a', toolName: 'submit_result', state: 'output-error', errorText: 'Invalid result' },
    { type: 'dynamic-tool', toolCallId: 'b', toolName: 'bash', state: 'output-error', errorText: 'exit 1' },
    { type: 'dynamic-tool', toolCallId: 'c', toolName: 'read', state: 'output-available' },
  ] }] } });
  assert.deepEqual(events.map(e => [e.type, e.tool, e.call, e.message]), [
    ['tool-start', 'submit_result', 'a', undefined],
    ['tool-failed', 'submit_result', 'a', 'Invalid result'],
    ['tool-start', 'bash', 'b', undefined],
    ['tool-failed', 'bash', 'b', 'exit 1'],
    ['tool-start', 'read', 'c', undefined],
    ['tool-completed', 'read', 'c', undefined],
  ]);
  assert.ok(events.every(e => e.worker === 'worker-1'));
});
