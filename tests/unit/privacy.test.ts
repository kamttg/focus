import { it, expect } from 'vitest';
import { allowedPage, originPattern, validEndpoint } from '../../extension/lib/privacy';
import { requestSchema, classificationSchema } from '../../shared/contracts';
it.each(['chrome://settings', 'file:///private', 'https://mail.google.com/inbox', 'https://public.test/login', 'https://public.test/checkout',
 'https://web.whatsapp.com/', 'https://docs.google.com/document/1', 'https://bank.example.test/', 'https://public.test/messages/1',
 'https://name:password@public.test'])('exclui %s', url => expect(allowedPage(url)).toBe(false));
it('permite conteúdos diferentes no mesmo domínio sem classificar por URL', () => {
 expect(allowedPage('https://www.youtube.com/watch?v=pandas')).toBe(true);
 expect(allowedPage('https://www.youtube.com/watch?v=humor')).toBe(true);
});
it('exclui subdomínios e não confunde domínios parecidos', () => {
 expect(allowedPage('https://sub.example.com', ['example.com'])).toBe(false);
 expect(allowedPage('https://notexample.com', ['example.com'])).toBe(true);
});
it('permissão não inclui caminho nem parâmetros', () => expect(originPattern('https://public.test/a?secret=123')).toBe('https://public.test/*'));
it.each(['http://remote.test', 'https://user:secret@remote.test', 'https://remote.test?token=secret'])('rejeita endpoint %s', endpoint => expect(validEndpoint(endpoint)).toBe(false));
it('aceita TLS e localhost de desenvolvimento', () => {
 expect(validEndpoint('https://fio.example.test')).toBe(true); expect(validEndpoint('http://localhost:8787')).toBe(true);
});
const input = { goal: 'Estudar Pandas', topics: ['Python'], page: { domain: 'youtube.com', title: 'Pandas', description: '', headings: [], excerpt: 'Dados' } };
it('limita contexto e rejeita campos extras', () => {
 expect(requestSchema.safeParse(input).success).toBe(true);
 expect(requestSchema.safeParse({ ...input, url: 'https://private' }).success).toBe(false);
 expect(requestSchema.safeParse({ ...input, page: { ...input.page, excerpt: 'a'.repeat(1500) } }).success).toBe(false);
 expect(requestSchema.safeParse({ ...input, page: { ...input.page, html: '<form>secret</form>' } }).success).toBe(false);
});
it.each([{ label: 'distracted', confidence: .9, reason: 'x' }, { label: 'off_topic', confidence: 2, reason: 'x' },
 { label: 'off_topic', confidence: .9, reason: 'x'.repeat(181) }, { label: 'relevant', confidence: .9, reason: 'x', script: 'alert()' }])('rejeita resultado fora do contrato', result => {
 expect(classificationSchema.safeParse(result).success).toBe(false);
});
it.each(['https://chatgpt.com/c/123', 'https://chat.openai.com/', 'https://claude.ai/chat/123',
 'https://gemini.google.com/app', 'http://localhost:8787', 'http://127.0.0.1:3000', 'http://10.1.2.3',
 'http://192.168.1.1', 'http://172.16.0.1', 'http://169.254.1.1', 'http://[::1]', 'https://app.internal/', 'http://intranet/', 'http://host.local/'])('acesso amplo não libera a leitura de %s', url => {
 expect(allowedPage(url)).toBe(false);
});
