import { it, expect } from 'vitest';
import { AnalysisError, retryAfterMilliseconds } from '../../shared/analysis-errors';
import { nextRetry, shouldRetryFailure } from '../../extension/lib/retry-policy';
it('uma resposta incerta válida não vira uma nova chamada periódica', () => {
 expect(shouldRetryFailure({ status: 'uncertain', lastError: '', backoffUntil: 0 }, 600000)).toBe(false);
});
it('429 respeita a espera do provedor mesmo após eventos de foco', () => {
 const retry = nextRetry(new AnalysisError('provider_rate_limit', 180000), 0, 1000);
 expect(shouldRetryFailure({ status: 'uncertain', ...retry }, 180999)).toBe(false);
 expect(shouldRetryFailure({ status: 'uncertain', ...retry }, 181000)).toBe(true);
});
it('429 sem prazo nunca provoca nova tentativa antes de um minuto', () => {
 expect(nextRetry(new AnalysisError('provider_rate_limit'), 0, 1000).backoffUntil).toBe(61000);
});
it('Retry-After aceita segundos e data HTTP sem aceitar valores inválidos', () => {
 expect(retryAfterMilliseconds('120', 0)).toBe(120000);
 expect(retryAfterMilliseconds('Thu, 01 Jan 1970 00:02:00 GMT', 0)).toBe(120000);
 expect(retryAfterMilliseconds('-10', 0)).toBe(0);
 expect(retryAfterMilliseconds('invalid', 0)).toBe(0);
});
