import type { Classification } from '../../shared/contracts';
export interface Clock {
  lastAt: number;
  offTopicMs: number;
  totalOffTopicMs: number;
  cooldownUntil: number;
  snoozeUntil: number;
}
export function accrue(clock: Clock, now: number, counting: boolean): Clock {
  const delta = now - clock.lastAt;
  // Lacunas longas podem ser sleep/reinício; nunca inventar tempo de atividade.
  const elapsed = counting && delta >= 0 && delta <= 45_000 ? delta : 0;
  return { ...clock, lastAt: now, offTopicMs: clock.offTopicMs + elapsed, totalOffTopicMs: clock.totalOffTopicMs + elapsed };
}
export function shouldAlert(c: Classification | null, clock: Clock, now: number, thresholdMs: number, eligible: boolean) {
  return eligible && c?.label === 'off_topic' && c.confidence >= 0.8 &&
    clock.offTopicMs >= thresholdMs && now >= clock.cooldownUntil && now >= clock.snoozeUntil;
}
export const resetContinuous = (c: Clock, now: number): Clock => ({ ...c, offTopicMs: 0, lastAt: now });
