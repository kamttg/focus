import { it, expect, vi, afterEach, beforeEach } from 'vitest';
import { classify } from '../../extension/lib/api-client';
import { defaults } from '../../extension/lib/session';
const input = { goal: 'Estudar Pandas', topics: [], page: { domain: 'youtube.com', title: 'Dados', description: '', headings: [], excerpt: '' } };
beforeEach(() => vi.stubGlobal('chrome', { storage: { session: { get: async () => ({}) } } }));
afterEach(() => vi.unstubAllGlobals());
it('apresenta o código seguro de falta de créditos em vez de esconder a falha', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'provider_quota', message: 'SEGREDO' }, { status: 502 })));
 await expect(classify(input, defaults)).rejects.toMatchObject({ code: 'provider_quota' });
});
it('não reflete códigos ou mensagens arbitrárias do servidor', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'SEGREDO', message: '<script>SEGREDO</script>' }, { status: 500 })));
 try { await classify(input, defaults); throw new Error('Expected rejection'); }
 catch (e) { expect(String(e)).not.toContain('SEGREDO'); expect((e as any).code).toBe('provider_unavailable'); }
});
it('falha de rede explica que é preciso manter o Worker local aberto', async () => {
 vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('INFORMACAO_PRIVADA')));
 await expect(classify(input, defaults)).rejects.toMatchObject({ code: 'backend_unavailable' });
});
it('preserva a espera transmitida pelo Worker', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'provider_rate_limit', retryAfterSeconds: 180 }, { status: 502 })));
 await expect(classify(input, defaults)).rejects.toMatchObject({ code: 'provider_rate_limit', retryAfterMs: 180000 });
});
