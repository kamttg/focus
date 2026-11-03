import { describe, it, expect } from 'vitest';
import { accrue, shouldAlert, resetContinuous } from '../../extension/lib/decision-engine';
import { cached, hashContext, type CacheEntry } from '../../extension/lib/session';
const clock = { lastAt: 1000, offTopicMs: 0, totalOffTopicMs: 0, cooldownUntil: 0, snoozeUntil: 0 };
const off = { label: 'off_topic' as const, confidence: .9, reason: 'Outro tema.' };
describe('tempo e decisão', () => {
  it('soma somente intervalos elegíveis', () => {
    let c = accrue(clock, 31000, true);
    expect(c.offTopicMs).toBe(30000);
    c = accrue(c, 61000, false); expect(c.offTopicMs).toBe(30000);
    c = accrue(c, 91000, true); expect(c.totalOffTopicMs).toBe(60000);
  });
  it('descarta lacunas longas e relógio regressivo', () => {
    expect(accrue(clock, 100000, true).offTopicMs).toBe(0);
    expect(accrue(clock, 500, true).offTopicMs).toBe(0);
  });
  it('respeita limiar, tempo, cooldown e adiamento', () => {
    const c = { ...clock, offTopicMs: 60000 };
    expect(shouldAlert(off, c, 100000, 60000, true)).toBe(true);
    expect(shouldAlert(off, c, 100000, 60001, true)).toBe(false);
    expect(shouldAlert(off, { ...c, cooldownUntil: 100001 }, 100000, 0, true)).toBe(false);
    expect(shouldAlert(off, { ...c, snoozeUntil: 100001 }, 100000, 0, true)).toBe(false);
    expect(shouldAlert(off, c, 100000, 0, false)).toBe(false);
  });
  it.each(['relevant', 'uncertain'] as const)('não alerta %s mesmo com tempo acumulado', label => {
    expect(shouldAlert({ ...off, label }, { ...clock, offTopicMs: 999999 }, 999999, 0, true)).toBe(false);
  });
  it('sem espera ainda exige confirmação e confiança', () => {
    expect(shouldAlert(null, clock, 2000, 0, true)).toBe(false);
    expect(shouldAlert({ ...off, confidence: .79 }, clock, 2000, 0, true)).toBe(false);
    expect(shouldAlert(off, clock, 2000, 0, true)).toBe(true);
  });
  it('reseta desvio contínuo e preserva agregado', () => {
    expect(resetContinuous({ ...clock, offTopicMs: 30, totalOffTopicMs: 90 }, 20))
      .toEqual({ ...clock, lastAt: 20, offTopicMs: 0, totalOffTopicMs: 90 });
  });
});
describe('cache de sessão', () => {
  it('expira sem armazenar texto bruto', () => {
    const c: Record<string, CacheEntry> = { hash: { result: off, expiresAt: 500 } };
    expect(cached(c, 'hash', 499)).toEqual(off);
    expect(cached(c, 'hash', 500)).toBeNull();
    expect(cached(c, 'outro', 0)).toBeNull();
  });
  it('inclui objetivo, temas e contexto na chave', async () => {
    const a = await hashContext('Pandas', ['Python'], { title: 'Dados' });
    expect(a).toHaveLength(64);
    expect(a).toBe(await hashContext('Pandas', ['Python'], { title: 'Dados' }));
    expect(a).not.toBe(await hashContext('Design', ['Python'], { title: 'Dados' }));
    expect(a).not.toBe(await hashContext('Pandas', ['Python'], { title: 'Humor' }));
  });
});
