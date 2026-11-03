import { it, expect, vi, afterEach } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { authenticate } from '../../worker/src/auth';
import type { Env } from '../../worker/src/types';
afterEach(() => vi.unstubAllGlobals());
it('verifica assinatura, audience e expiração com JWKS controlado', async () => {
 const { publicKey, privateKey } = await generateKeyPair('ES256');
 const jwk = { ...await exportJWK(publicKey), kid: 'demo', alg: 'ES256', use: 'sig' };
 const issuer = 'https://auth.example.test/auth/v1';
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ keys: [jwk] })));
 const env = { AUTH_MODE: 'jwt', AUTH_ISSUER: issuer, AUTH_AUDIENCE: 'authenticated' } as Env;
 const sign = (aud: string, exp: string) => new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'demo' })
   .setIssuer(issuer).setAudience(aud).setSubject('user-123').setIssuedAt().setExpirationTime(exp).sign(privateKey);
 const request = (token: string) => new Request('https://fio.example.test/classify', { headers: { Authorization: 'Bearer ' + token } });
 expect(await authenticate(request(await sign('authenticated', '5m')), env)).toBe('user-123');
 await expect(authenticate(request(await sign('wrong-audience', '5m')), env)).rejects.toThrow();
 await expect(authenticate(request(await sign('authenticated', '-1m')), env)).rejects.toThrow();
});
