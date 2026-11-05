import { safeAnalysisError } from '../../shared/analysis-errors';
export function nextRetry(error: unknown, failures: number, now: number) {
  const failure = safeAnalysisError(error);
  const floor = failure.code === 'provider_rate_limit' ? 60_000 : 30_000;
  const delay = Math.max(floor, Math.min(300_000, 30_000 * 2 ** Math.min(4, failures)), failure.retryAfterMs);
  return { failures: failures + 1, backoffUntil: now + delay, lastError: failure.message };
}
export function shouldRetryFailure(state: { status: string; lastError?: string; backoffUntil: number }, now: number) {
  // A legitimate uncertain classification is a result, not a network failure.
  return state.status === 'uncertain' && !!state.lastError && now >= state.backoffUntil;
}
