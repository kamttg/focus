import type { MonitoringReason } from './session';

export const monitoringMessages: Record<MonitoringReason, { title: string; description: string }> = {
  consent_required: { title: 'Confirme o consentimento', description: 'Abra Sites e configurações, leia a explicação de privacidade, confirme o consentimento e salve as preferências.' },
  no_active_tab: { title: 'Aba ativa não identificada', description: 'Selecione uma página pública no Chrome e tente novamente.' },
  window_unfocused: { title: 'Aguardando confirmação de foco da página', description: 'A página foi identificada, mas ainda não confirmou foco. Feche este popup e clique na página para retomar.' },
  idle: { title: 'Monitoramento pausado por inatividade', description: 'Movimente o mouse ou use o teclado para continuar. Esse intervalo não conta como desvio.' },
  excluded: { title: 'Página fora do monitoramento', description: 'Páginas internas, sensíveis ou excluídas não são analisadas.' },
  permission_required: { title: 'Autorize este site', description: 'Clique em Autorizar site atual para permitir a leitura limitada desta origem.' },
  extraction_unavailable: { title: 'Não foi possível ler esta página', description: 'A página pode ter bloqueado a leitura ou conter áreas sensíveis. Nenhum alerta será gerado por essa falha.' }
};
