import { it, expect } from 'vitest';
import { isTrustedUI } from '../../extension/lib/message-security';
it('autoriza popup e opções mesmo abertos como abas da extensão', () => {
 expect(isTrustedUI({ id: 'abc', url: 'chrome-extension://abc/popup.html', frameId: 0 }, 'abc')).toBe(true);
 expect(isTrustedUI({ id: 'abc', url: 'chrome-extension://abc/options.html' }, 'abc')).toBe(true);
});
it.each([
 { id: 'abc', url: 'https://public.test/options.html' },
 { id: 'other', url: 'chrome-extension://abc/popup.html' },
 { id: 'abc', url: 'chrome-extension://abc/popup.html', frameId: 2 },
 { id: 'abc', url: 'chrome-extension://abc/unknown.html' },
 { id: 'abc' }
])('nega mensagens privilegiadas fora das telas da extensão', sender => {
 expect(isTrustedUI(sender, 'abc')).toBe(false);
});
