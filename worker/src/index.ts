import { requestSchema, uncertain } from '../../shared/contracts';
import { allowedPage } from '../../extension/lib/privacy';
import { authenticate } from './auth';
import { consumeQuota } from './limits';
import { OpenAIProvider } from './openai';
import type { Env } from './types';
import { safeAnalysisError } from '../../shared/analysis-errors';
export { Quota } from './limits';

async function boundedBody(request: Request): Promise<string> {
  if (Number(request.headers.get('content-length')) > 12_000) throw new Error('size');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength;
    if (size > 12_000) { await reader.cancel(); throw new Error('size'); }
    chunks.push(part.value);
  }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(all);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET')
      return Response.json({ ok: true, enabled: env.ENABLED === 'true' });
    const origin = request.headers.get('Origin') || '';
    const origins = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!origin || !origins.includes(origin)) return new Response('Origin denied', { status: 403 });
    const headers = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Cache-Control': 'no-store',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' };
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
    if (url.pathname !== '/classify') return reply({ error: 'not_found' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    if (env.ENABLED !== 'true') return reply({ error: 'disabled' }, 503);
    let user: string;
    try { user = await authenticate(request, env); } catch { return reply({ error: 'unauthorized' }, 401); }
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'invalid_type' }, 415);
    let input;
    try { input = requestSchema.parse(JSON.parse(await boundedBody(request))); }
    catch { return reply({ error: 'invalid_request' }, 400); }
    if (!allowedPage('https://' + input.page.domain)) return reply({ error: 'excluded' }, 400);
    try {
      const quota = await consumeQuota(user, env);
      if (!quota.ok) return reply({ error: 'quota_exceeded' }, 429);
      return reply(await new OpenAIProvider(env).classify(input));
    } catch (error) {
      // Nunca logar payloads, exceções do provedor ou dados pessoais.
      const failure = safeAnalysisError(error, 'server_internal');
      return reply({ ...uncertain(failure.message), error: failure.code, retryAfterSeconds: Math.ceil(failure.retryAfterMs / 1000) }, 502);
    }
  }
};
