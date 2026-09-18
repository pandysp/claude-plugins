// Runs the real CLI, runtime, Flue and SQLite. Only the model transport is
// scripted (pi-ai's faux provider) and the network is forbidden.
//
//   node native-worker-child.mjs WORKSPACE run|resume PROGRAM TRACE
//
// FLUE_FIXTURE_RESPONSE   structured (default) | text
// FLUE_FIXTURE_BLOCK      hold the first model call open until the process is
//                         signalled or killed (cancel/crash tests)
import { registerHooks } from 'node:module';
import { appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';

const [workspace, mode, program, trace] = process.argv.slice(2);
const record = value => appendFileSync(trace, JSON.stringify(value) + '\n');
const faux = fauxProvider({ provider: 'openai', api: 'flue-fixture', models: [{ id: 'flue-fixture' }] });
const reply = () => process.env.FLUE_FIXTURE_RESPONSE === 'text'
  ? fauxAssistantMessage('checked text')
  : fauxAssistantMessage(fauxToolCall('submit_result', { answer: 42 }), { stopReason: 'toolUse' });
let blocked = false;
const respond = async (_context, options) => {
  faux.appendResponses([respond]); // every call re-queues itself: unlimited scripted replies
  record({ event: 'model-call' });
  if (process.env.FLUE_FIXTURE_BLOCK && !blocked) {
    blocked = true;
    record({ event: 'model-blocked' });
    await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }));
    record({ event: 'model-aborted' });
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
record({ event: 'finished', exitCode: process.exitCode ?? 0, modelCalls: faux.state.callCount, fetchCalls });
