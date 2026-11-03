export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  REASONING_EFFORT: 'none' | 'low';
  AUTH_MODE: string;
  AUTH_ISSUER: string;
  AUTH_AUDIENCE: string;
  ALLOWED_ORIGINS: string;
  ENABLED: string;
  DAILY_LIMIT: string;
  MINUTE_LIMIT: string;
  QUOTAS: DurableObjectNamespace;
}
