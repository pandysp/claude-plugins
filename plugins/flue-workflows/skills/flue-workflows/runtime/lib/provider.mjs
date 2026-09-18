import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { RunError } from './primitives.mjs';

const factories = { 'openai-codex': openaiCodexProvider, openai: openaiProvider, anthropic: anthropicProvider };

export async function credentials({ model, auth, authFile }) {
  const providerId = model?.split('/')[0];
  if (!factories[providerId]) throw new RunError('Specify a supported provider/model: openai-codex/…, openai/… or anthropic/….');
  const base = factories[providerId]();
  let resolveAuth;
  let source;
  if (auth === 'pi') {
    if (providerId !== 'openai-codex') throw new RunError('--auth pi supports openai-codex models only; no API-key fallback is attempted.');
    const path = resolve(authFile ?? join(homedir(), '.pi/agent/auth.json'));
    source = { kind: 'pi-subscription', path };
    resolveAuth = async () => {
      let stored;
      try { stored = JSON.parse(await readFile(path, 'utf8'))[providerId]; }
      catch (cause) { throw new RunError(`Cannot read existing pi credentials at ${path}. Log in through pi separately, or explicitly choose API-key authentication.`, { cause }); }
      if (stored?.type !== 'oauth' || !Number.isFinite(stored.expires) || stored.expires <= Date.now() + 60_000) {
        throw new RunError(`A valid existing OpenAI OAuth credential is required at ${path}. Refresh/login through pi separately; this runner never modifies credentials or falls back to paid API keys.`);
      }
      return { auth: await base.auth.oauth.toAuth(stored), source: 'explicit existing pi subscription, read-only' };
    };
  } else if (auth?.startsWith('env:') && providerId !== 'openai-codex') {
    const variable = auth.slice(4);
    if (!/^[A-Z_][A-Z0-9_]*$/.test(variable)) throw new RunError('Use --auth env:VARIABLE_NAME, never an API key in a command argument.');
    if (authFile) throw new RunError('--auth-file applies only to --auth pi.');
    source = { kind: 'api-key', variable };
    resolveAuth = async () => {
      const key = process.env[variable];
      if (!key) throw new RunError(`Missing explicitly selected API-key variable ${variable}. No alternative credential source was tried.`);
      return { auth: { apiKey: key }, source: `explicit ${variable} API key` };
    };
  } else throw new RunError('Choose --auth pi (existing OpenAI subscription) or --auth env:VARIABLE (API billing). No implicit authentication.');
  await resolveAuth();
  return { source, provider: { ...base, auth: { apiKey: { name: 'Explicit workflow credentials', resolve: resolveAuth } } } };
}
