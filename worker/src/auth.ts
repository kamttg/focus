import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './types';
const sets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function authenticate(request: Request, env: Env): Promise<string> {
  const url = new URL(request.url);
  if (env.AUTH_MODE === 'local' && ['localhost', '127.0.0.1'].includes(url.hostname)) return 'local-developer';
  if (env.AUTH_MODE !== 'jwt' || !env.AUTH_ISSUER?.startsWith('https://')) throw new Error('unauthorized');
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new Error('unauthorized');
  const issuer = env.AUTH_ISSUER.replace(/\/$/, '');
  // Supabase com assinatura assimétrica; endpoint fixado pelo administrador.
  const jwksUrl = issuer + '/.well-known/jwks.json';
  let jwks = sets.get(jwksUrl);
  if (!jwks) { jwks = createRemoteJWKSet(new URL(jwksUrl)); sets.set(jwksUrl, jwks); }
  const { payload } = await jwtVerify(token, jwks, {
    issuer, audience: env.AUTH_AUDIENCE || 'authenticated', algorithms: ['ES256', 'RS256'],
    requiredClaims: ['sub', 'exp', 'iat']
  });
  if (!payload.sub || payload.role === 'anon' || payload.is_anonymous === true) throw new Error('unauthorized');
  return payload.sub;
}
