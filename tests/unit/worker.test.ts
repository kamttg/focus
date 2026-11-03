import { it, expect, vi, afterEach } from 'vitest';
import api from '../../worker/src/index';
import { authenticate } from '../../worker/src/auth';
import type { Env } from '../../worker/src/types';
const origin = 'chrome-extension://testid';
const input = { goal: 'Estudar Pandas', topics: [], page: { domain: 'youtube.com', title: 'Pandas', description: '', headings: [], excerpt: 'Dados' } };
const env = { AUTH_MODE: 'local', ENABLED: 'true', ALLOWED_ORIGINS: origin, OPENAI_API_KEY: 'fake', OPENAI_MODEL: 'gpt-6-luna',
 QUOTAS: { idFromName: vi.fn().mockReturnValue('id'), get: vi.fn().mockReturnValue({ fetch: vi.fn().mockResolvedValue(new Response('{}')) }) } } as unknown as Env;
function req(body: unknown = input, url = 'http://localhost/classify', headers: Record<string,string> = {}) {
 return new Request(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
afterEach(() => vi.unstubAllGlobals());
it('restringe CORS à origem configurada e não usa CORS como autenticação', async () => {
 expect((await api.fetch(req(input, undefined, { Origin: 'https://attacker.test' }), env)).status).toBe(403);
 expect((await api.fetch(req(input, 'https://public.example.test/classify'), env)).status).toBe(401);
});
it('modo local jamais autentica um endpoint remoto', async () => {
 await expect(authenticate(req(input, 'https://remote.test/classify'), env)).rejects.toThrow();
 expect(await authenticate(req(), env)).toBe('local-developer');
});
it('oferece kill switch antes de chamar provedor', async () => {
 expect((await api.fetch(req(), { ...env, ENABLED: 'false' })).status).toBe(503);
});
it('rejeita payloads grandes e campos extras', async () => {
 expect((await api.fetch(req({ ...input, html: 'private' }), env)).status).toBe(400);
 expect((await api.fetch(req({ extra: 'x'.repeat(13000) }), env)).status).toBe(400);
});
it('falha no provedor retorna uncertain e não reflete texto bruto', async () => {
 vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret raw page')));
 const response = await api.fetch(req(), env);
 expect(response.status).toBe(502);
 const body = await response.json(); expect(body.label).toBe('uncertain'); expect(JSON.stringify(body)).not.toContain('secret');
});
it('429 da cota não chama IA', async () => {
 const transport = vi.fn(); vi.stubGlobal('fetch', transport);
 const limits = { ...env, QUOTAS: { idFromName: () => 'id', get: () => ({ fetch: async () => new Response('{}', { status: 429 }) }) } } as unknown as Env;
 expect((await api.fetch(req(), limits)).status).toBe(429); expect(transport).not.toHaveBeenCalled();
});
it.each(['chatgpt.com', 'claude.ai', 'app.internal', 'host.local'])('o servidor também exclui %s mesmo com corpo válido', async domain => {
 const transport = vi.fn(); vi.stubGlobal('fetch', transport);
 const response = await api.fetch(req({ ...input, page: { ...input.page, domain } }), env);
 expect(response.status).toBe(400); expect((await response.json()).error).toBe('excluded');
 expect(transport).not.toHaveBeenCalled();
});
