// Runs the real CLI, runtime, Flue and SQLite. Only the model transport is
// scripted (pi-ai's faux provider) and the network is forbidden.
//
//   node native-worker-child.mjs WORKSPACE run|resume PROGRAM TRACE
//
// FLUE_FIXTURE_RESPONSE   structured (default) | text | invalid-first (an invalid
//                         submit_result, then a valid one) | tool-error-first (a
//                         call to the program's `broken` tool, then a valid result) |
//                         tool-twice (two `broken` calls, then a valid result) |
//                         head-steer (submits 41; after a pi-hydra signal, submits 42)
// FLUE_FIXTURE_PROVIDER   openai (default) | anthropic (an Anthropic-shaped request body
//                         goes through onPayload, as pi-ai's real provider does, so
//                         review heads can capture and replay it)
// FLUE_FIXTURE_BLOCK      hold the first model call open until the process is
//                         signalled or killed (cancel/crash tests)
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import childProcess from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';

const [workspace, mode, program, trace] = process.argv.slice(2);
const record = value => appendFileSync(trace, JSON.stringify(value) + '\n');
let syntaxChecks = 0;
const { execFileSync } = childProcess;
childProcess.execFileSync = (file, args, options) => {
  if (file === process.execPath && args[0] === '--check') syntaxChecks++;
  return execFileSync(file, args, options);
};
syncBuiltinESMExports();
const anthropic = process.env.FLUE_FIXTURE_PROVIDER === 'anthropic';
const faux = anthropic
  ? fauxProvider({ provider: 'anthropic', api: 'anthropic-messages', models: [{ id: 'flue-fixture' }] })
  : fauxProvider({ provider: 'openai', api: 'flue-fixture', models: [{ id: 'flue-fixture' }] });
const toolUse = (name, args) => fauxAssistantMessage(fauxToolCall(name, args), { stopReason: 'toolUse' });
let replies = 0;
// A review head steers on its first check and finds nothing after.
let headCalls = 0;
const headReply = () => {
  const steer = headCalls++ === 0;
  return fauxAssistantMessage(JSON.stringify({ findings: steer ? [{ action: 'steer', reason: 'wrong product', message: 'The answer is 42.' }] : [] }));
};
const reply = text => {
  const mode = process.env.FLUE_FIXTURE_RESPONSE ?? 'structured';
  const first = replies++ === 0;
  if (mode === 'head-steer') return toolUse('submit_result', { answer: text.includes('The answer is 42.') ? 42 : 41 });
  if (mode === 'text') return fauxAssistantMessage('checked text');
  if (mode === 'invalid-first' && first) return toolUse('submit_result', { answer: 'not a number' });
  if (mode === 'tool-error-first' && first) return toolUse('broken', {});
  if (mode === 'tool-twice' && replies <= 2) return toolUse('broken', {});
  return toolUse('submit_result', { answer: 42 });
};
let blocked = false;
const respond = async (context, options, _state, model) => {
  faux.appendResponses([respond]); // every call re-queues itself: unlimited scripted replies
  let text = JSON.stringify(context.messages);
  if (anthropic) {
    const messages = context.messages.map(m => ({ role: m.role === 'toolResult' ? 'user' : m.role, content: [{ type: 'text', text: JSON.stringify(m.content) }] }));
    const params = { model: model.id, messages };
    text = JSON.stringify(((await options?.onPayload?.(params, model)) ?? params).messages);
  }
  if (text.includes("You are reviewing the main assistant's work")) {
    record({ event: 'head-call' });
    return headReply();
  }
  record({ event: 'model-call' });
  if (process.env.FLUE_FIXTURE_BLOCK && !blocked) {
    blocked = true;
    record({ event: 'model-blocked' });
    await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }));
    record({ event: 'model-aborted' });
  }
  return reply(text);
};
faux.setResponses([respond]);
let fetchCalls = 0;
globalThis.fetch = () => { fetchCalls++; throw new Error('Network forbidden in the fixture'); };
process.env.FLUE_FIXTURE_KEY = 'not-a-credential';

registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/lib/provider.mjs') && specifier === `@earendil-works/pi-ai/providers/${anthropic ? 'anthropic' : 'openai'}`) return { url: 'flue-fixture:provider', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'flue-fixture:provider') return { format: 'module', source: `export const ${anthropic ? 'anthropicProvider' : 'openaiProvider'} = () => globalThis.__flueFixtureProvider;`, shortCircuit: true };
    return next(url, context);
  },
});
globalThis.__flueFixtureProvider = faux.provider;

const { cli } = await import('../../lib/cli.mjs');
await cli(workspace, mode === 'run'
  ? ['run', program, '--id', 'fixture', '--cwd', dirname(program), '--model', `${anthropic ? 'anthropic' : 'openai'}/flue-fixture`, '--auth', 'env:FLUE_FIXTURE_KEY',
    '--access', 'unrestricted', '--effort', 'off', '--concurrency', process.env.FLUE_FIXTURE_CONCURRENCY ?? '2', '--max-jobs', '5']
  : ['resume', 'fixture']);
record({ event: 'finished', exitCode: process.exitCode ?? 0, modelCalls: faux.state.callCount, fetchCalls, syntaxChecks });
