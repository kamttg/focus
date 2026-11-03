import { it, expect, vi } from 'vitest';
import { WEB_ORIGINS, hasAutomaticAccess, requestAutomaticAccess, removeAutomaticAccess } from '../../extension/lib/permissions';
it('verificar acesso não pede nem amplia permissões', async () => {
 const api = { contains: vi.fn().mockResolvedValue(false), request: vi.fn() };
 expect(await hasAutomaticAccess(api)).toBe(false);
 expect(api.contains).toHaveBeenCalledWith({ origins: ['http://*/*', 'https://*/*'] });
 expect(api.request).not.toHaveBeenCalled();
});
it('permissões de domínios individuais não são tratadas como consentimento global', async () => {
 const api = { contains: vi.fn(async ({ origins }: { origins: string[] }) => !origins.includes('https://*/*')) };
 expect(await hasAutomaticAccess(api)).toBe(false);
});
it('a ativação solicita todo o escopo uma vez e preserva o gesto do clique', async () => {
 const api = { request: vi.fn().mockResolvedValue(true) };
 const activation = requestAutomaticAccess(api);
 expect(api.request).toHaveBeenCalledTimes(1);
 expect(api.request).toHaveBeenCalledWith({ origins: WEB_ORIGINS });
 await expect(activation).resolves.toBeUndefined();
});
it('recusa do navegador interrompe a ativação', async () => {
 const api = { request: vi.fn().mockResolvedValue(false) };
 await expect(requestAutomaticAccess(api)).rejects.toThrow('não concedeu');
});
it('a desativação remove o acesso amplo sem apagar preferências ou credenciais', async () => {
 const api = { remove: vi.fn().mockResolvedValue(true) };
 expect(await removeAutomaticAccess(api)).toBe(true);
 expect(api.remove).toHaveBeenCalledWith({ origins: WEB_ORIGINS });
});
