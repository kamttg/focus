export const analysisErrorMessages = {
  origin_denied: 'O servidor não autorizou esta instalação. Confira ALLOWED_ORIGINS e o ID da extensão.',
  unauthorized: 'O servidor exige autenticação. No teste local, confira AUTH_MODE=local e use localhost.',
  disabled: 'A análise está desativada no servidor. Confira ENABLED=true.',
  invalid_request: 'O servidor rejeitou o formato do contexto. Atualize a extensão e o servidor juntos.',
  quota_exceeded: 'O limite de análises do servidor foi atingido. Aguarde a renovação da cota.',
  provider_auth: 'A OpenAI rejeitou a chave da API. Confira a chave salva no servidor.',
  provider_access: 'A chave não tem acesso ao modelo ou projeto configurado na OpenAI.',
  provider_model: 'O modelo configurado não foi encontrado ou não está disponível para esta chave.',
  provider_quota: 'A OpenAI informou falta de créditos ou cota disponível. Confira o faturamento da API.',
  provider_rate_limit: 'A OpenAI pediu uma pausa por excesso de chamadas. O Fio tentará novamente depois.',
  provider_configuration: 'A OpenAI rejeitou os parâmetros da chamada. Confira o modelo e atualize o servidor.',
  provider_timeout: 'A OpenAI não respondeu no prazo. Nenhum alerta foi gerado por essa falha.',
  provider_incomplete: 'A resposta da IA ficou incompleta. Nenhum alerta foi gerado.',
  provider_refusal: 'A IA não forneceu uma classificação para este conteúdo.',
  provider_invalid_response: 'A resposta da IA não passou na validação. Nenhum alerta foi gerado.',
  provider_unavailable: 'A OpenAI está indisponível ou a conexão com ela falhou.',
  server_internal: 'O servidor recebeu a solicitação, mas houve uma falha interna ao processar a análise. Atualize o Worker.',
  backend_unavailable: 'Não foi possível acessar o servidor. Mantenha npm.cmd run dev:worker aberto e confira o endereço do Worker.'
} as const;
export type AnalysisErrorCode = keyof typeof analysisErrorMessages;
export function isAnalysisErrorCode(value: unknown): value is AnalysisErrorCode {
  return typeof value === 'string' && Object.hasOwn(analysisErrorMessages, value);
}
export class AnalysisError extends Error {
  constructor(public readonly code: AnalysisErrorCode) { super(analysisErrorMessages[code]); this.name = 'AnalysisError'; }
}
export function safeAnalysisError(error: unknown, fallback: AnalysisErrorCode = 'backend_unavailable'): AnalysisError {
  return error instanceof AnalysisError ? error : new AnalysisError(fallback);
}
