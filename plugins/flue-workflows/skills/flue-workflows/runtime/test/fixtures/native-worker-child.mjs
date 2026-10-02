// Runs the real CLI, runtime, Flue and SQLite. Only the model transport is
// scripted (pi-ai's faux provider) and the network is forbidden.
//
//   node native-worker-child.mjs WORKSPACE run|resume PROGRAM TRACE
//
// FLUE_FIXTURE_RESPONSE   structured (default) | text | invalid-first (an invalid
//                         submit_result, then a valid one) | tool-error-first (a
//                         call to the program's `broken` tool, then a valid result) |
//                         tool-twice (two `broken` calls, then a valid result)
// FLUE_FIXTURE_BLOCK      hold the first model call open until the process is
//                         signalled or killed (cancel/crash tests); `head` holds the
//                         first head check instead, `corrected` the worker's first call
//                         after a head steered it
// FLUE_FIXTURE_HEADS      the model speaks the Anthropic API so heads can review it:
//                         `steer` (the first head check steers, later ones pass),
//                         `always` (every check steers), `pass` (no findings),
//                         `broken` (every head answers with something that is not a finding).
//                         The worker answers 41 until it has read a pi-hydra signal, then 42.
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
const heads = process.env.FLUE_FIXTURE_HEADS;
const faux = fauxProvider({ provider: 'openai', api: heads ? 'anthropic-messages' : 'flue-fixture', models: [{ id: 'flue-fixture' }] });
const toolUse = (name, args) => fauxAssistantMessage(fauxToolCall(name, args), { stopReason: 'toolUse' });
let replies = 0;
const reply = () => {
  const mode = process.env.FLUE_FIXTURE_RESPONSE ?? 'structured';
  const first = replies++ === 0;
  if (mode === 'text') return fauxAssistantMessage('checked text');
  if (mode === 'invalid-first' && first) return toolUse('submit_result', { answer: 'not a number' });
  if (mode === 'tool-error-first' && first) return toolUse('broken', {});
  if (mode === 'tool-twice' && replies <= 2) return toolUse('broken', {});
  return toolUse('submit_result', { answer: 42 });
};
let headChecks = 0;
// A head check: the agent's own request replayed, ending with the head's instructions.
const headReply = () => heads === 'broken' ? fauxAssistantMessage('I could not decide.') : fauxAssistantMessage(JSON.stringify({ findings:
  heads === 'always' || (heads === 'steer' && headChecks++ === 0) ? [{ action: 'steer', reason: 'checked', message: 'The answer is 42.' }] : [] }));
const answer = context => {
  const corrected = JSON.stringify(context.messages).includes('pi-hydra');
  const schema = process.env.FLUE_FIXTURE_RESPONSE !== 'text';
  return schema ? toolUse('submit_result', { answer: corrected ? 42 : 41 }) : fauxAssistantMessage(corrected ? 'answer 42' : 'answer 41');
};
let blocked = false;
const respond = async (context, options, _state, model) => {
  faux.appendResponses([respond]); // every call re-queues itself: unlimited scripted replies
  if (!heads) record({ event: 'model-call' });
  const block = async () => {
    blocked = true;
    record({ event: 'model-blocked' });
    await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }));
    record({ event: 'model-aborted' });
  };
  if (process.env.FLUE_FIXTURE_BLOCK && !['head', 'corrected'].includes(process.env.FLUE_FIXTURE_BLOCK) && !blocked) await block();
  if (heads) {
    // Hand the request body to whoever wraps the provider, as a real provider does.
    const params = { model: model.id, system: [{ type: 'text', text: String(context.systemPrompt ?? '') }],
      messages: context.messages.map(m => ({ role: m.role === 'toolResult' ? 'user' : m.role, content: [{ type: 'text', text: JSON.stringify(m.content) }] })) };
    const sent = (await options?.onPayload?.(params, model)) ?? params;
    const isHead = JSON.stringify(sent).includes("reviewing the main assistant");
    record({ event: isHead ? 'head-call' : 'model-call' });
    if (isHead && process.env.FLUE_FIXTURE_BLOCK === 'head' && !blocked) await block();
    if (!isHead && process.env.FLUE_FIXTURE_BLOCK === 'corrected' && JSON.stringify(context.messages).includes('pi-hydra') && !blocked) await block();
    return isHead ? headReply() : answer(context);
  }
  return reply();
};
faux.setResponses([respond]);
let fetchCalls = 0;
globalThis.fetch = () => { fetchCalls++; throw new Error('Network forbidden in the fixture'); };
process.env.FLUE_FIXTURE_KEY = 'not-a-credential';

registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/lib/provider.mjs') && specifier === '@earendil-works/pi-ai/providers/openai') return { url: 'flue-fixture:provider', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'flue-fixture:provider') return { format: 'module', source: 'export const openaiProvider = () => globalThis.__flueFixtureProvider;', shortCircuit: true };
    return next(url, context);
  },
});
globalThis.__flueFixtureProvider = faux.provider;

const { cli } = await import('../../lib/cli.mjs');
await cli(workspace, mode === 'run'
  ? ['run', program, '--id', 'fixture', '--cwd', dirname(program), '--model', 'openai/flue-fixture', '--auth', 'env:FLUE_FIXTURE_KEY',
    '--access', 'unrestricted', '--effort', 'off', '--concurrency', process.env.FLUE_FIXTURE_CONCURRENCY ?? '2', '--max-jobs', '5']
  : ['resume', 'fixture']);
record({ event: 'finished', exitCode: process.exitCode ?? 0, modelCalls: faux.state.callCount, fetchCalls, syntaxChecks });
