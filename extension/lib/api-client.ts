import { classificationSchema, type ClassifyRequest } from '../../shared/contracts';
import type { Preferences } from './session';
export async function classify(input: ClassifyRequest, prefs: Preferences, signal?: AbortSignal) {
  const auth = (await chrome.storage.session.get('auth')).auth as { access_token: string; expires_at: number; refresh_token: string } | undefined;
  let token = auth?.access_token;
  if (auth && auth.expires_at <= Date.now() + 30_000 && prefs.authUrl) {
    const r = await fetch(prefs.authUrl + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: prefs.publicAuthKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: auth.refresh_token }), signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) { await chrome.storage.session.remove('auth'); throw new Error('Entre novamente.'); }
    const data = await r.json();
    token = data.access_token;
    await chrome.storage.session.set({ auth: { access_token: token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 } });
  }
  const r = await fetch(prefs.endpoint.replace(/\/$/, '') + '/classify', {
    method: 'POST', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error(r.status === 401 ? 'Entre na sua conta nas configurações.' : 'API indisponível ou limite atingido.');
  return classificationSchema.parse(await r.json());
}
