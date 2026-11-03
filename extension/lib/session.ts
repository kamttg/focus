import type { Classification } from '../../shared/contracts';
import type { Clock } from './decision-engine';
export interface Preferences {
  consent: boolean; endpoint: string; authUrl: string; publicAuthKey: string;
  delayMinutes: number; cooldownMinutes: number; stabilitySeconds: number;
  dailyLimit: number; sessionLimit: number; overlay: boolean; notifications: boolean; exclusions: string[];
}
export const defaults: Preferences = {
  consent: false, endpoint: 'http://localhost:8787', authUrl: '', publicAuthKey: '',
  delayMinutes: 3, cooldownMinutes: 10, stabilitySeconds: 5,
  dailyLimit: 100, sessionLimit: 60, overlay: true, notifications: true, exclusions: []
};
export interface Session {
  id: string; status: 'active' | 'paused' | 'finished'; kind: string; goal: string; topics: string[];
  startedAt: number; endsAt: number | null; pausedAt: number | null; focusTabId: number | null;
  feedback: Record<string, 'relevant' | 'ignored'>;
  analyses: number; alerts: number; corrections: number;
}
export interface CacheEntry { result: Classification; expiresAt: number }
export type MonitoringReason = 'consent_required' | 'no_active_tab' | 'window_unfocused' | 'idle' | 'excluded' | 'permission_required' | 'extraction_unavailable';
export interface RuntimeState {
  session: Session | null; clock: Clock; tabId: number | null; url: string; domain: string;
  classification: Classification | null; status: string; revision: number; focused: boolean; idle: boolean;
  cache: Record<string, CacheEntry>; backoffUntil: number; failures: number;
  lastLatencyMs: number;
  monitoringReason: MonitoringReason | null;
  focusSignals?: { window: boolean; page: boolean | null; visible: boolean | null };
  lastAnalysisAt?: number;
  lastError?: string;
}
export const initialState = (): RuntimeState => ({
  session: null, clock: { lastAt: Date.now(), offTopicMs: 0, totalOffTopicMs: 0, cooldownUntil: 0, snoozeUntil: 0 },
  tabId: null, url: '', domain: '', classification: null, status: 'inactive', revision: 0, focused: false, idle: false,
  cache: {}, backoffUntil: 0, failures: 0, lastLatencyMs: 0, monitoringReason: null
});
export async function hashContext(goal: string, topics: string[], page: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify([goal, topics, page]));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
export function cached(cache: Record<string, CacheEntry>, key: string, now: number) {
  const entry = cache[key]; return entry && entry.expiresAt > now ? entry.result : null;
}
