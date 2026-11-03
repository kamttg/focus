import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';
export class Quota extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const limits = await request.json() as { day: number; minute: number };
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY, day INTEGER, minute INTEGER, days INTEGER, minutes INTEGER)');
    const now = Date.now();
    const day = Math.floor(now / 86_400_000);
    const minute = Math.floor(now / 60_000);
    const accepted = this.ctx.storage.transactionSync(() => {
      const s = this.ctx.storage;
      const old = s.sql.exec<{day: number; minute: number; days: number; minutes: number}>('SELECT day, minute, days, minutes FROM usage WHERE id=1').toArray()[0];
      const counts = { day, minute, days: old?.day === day ? old.days : 0, minutes: old?.minute === minute ? old.minutes : 0 };
      if (counts.days >= limits.day || counts.minutes >= limits.minute) return false;
      s.sql.exec('INSERT OR REPLACE INTO usage (id, day, minute, days, minutes) VALUES (1, ?, ?, ?, ?)', day, minute, counts.days + 1, counts.minutes + 1);
      return true;
    });
    // Apenas contadores; sem prompts, páginas ou tokens.
    return Response.json({ accepted }, { status: accepted ? 200 : 429 });
  }
}
export async function consumeQuota(user: string, env: Env) {
  const day = Math.max(1, Math.min(Number(env.DAILY_LIMIT) || 100, 1000));
  const minute = Math.max(1, Math.min(Number(env.MINUTE_LIMIT) || 6, 30));
  const id = env.QUOTAS.idFromName(user);
  return env.QUOTAS.get(id).fetch('https://quota/consume', { method: 'POST', body: JSON.stringify({ day, minute }) });
}
