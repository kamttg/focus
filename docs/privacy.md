# Privacidade e segurança

## Permissões

- tabs: URL e título da aba ativa para orquestração e exclusões. Capacidade sensível explicada no consentimento.
- scripting: funções isoladas para extrair e exibir overlay.
- optional_host_permissions HTTP/HTTPS: acesso amplo solicitado uma vez por gesto explícito na ativação. Durante a sessão, páginas elegíveis são verificadas automaticamente, sem liberações por domínio.
- idle, windows/tabs, alarms: atividade observável do navegador e temporização.
- storage: preferências persistentes e estado temporário.
- notifications: lembretes silenciosos.
- Não há modo anônimo, cookies, captura de tela, microfone, histórico ou registro de teclas.

## Dados

O cliente envia objetivo, temas e domínio + até 1.500 caracteres combinados de título, descrição derivada de parágrafo visível, cabeçalhos e fragmentos. Não usa metadados invisíveis para descrição. Remoção local de e-mails, URLs e sequências numéricas reduz dados incidentais.

Text nodes são inspecionados individualmente para evitar que o texto de um ancestral inclua formulários ou filhos privados. Elementos ocultos, campos, editáveis, comentários conhecidos, mensagens e áreas privadas são excluídos. Campos de senha ou cartão fazem a página inteira deixar de ser examinada.

Preferências e contadores diários: storage.local. Objetivo, classe, hash, feedback e tokens: storage.session, apenas contextos confiáveis. O Worker guarda somente contadores. Os fragmentos existem em memória durante extração/chamada e em uma prévia local opcional até limpá-la ou fechar a página.

## Limitações assumidas

A autorização HTTP/HTTPS permite tecnicamente acesso amplo aos sites; o extrator e o motor restringem o que de fato é coletado. Bloqueios de domínio e seletores são incompletos: um site arbitrário pode apresentar informações privadas como texto público. Esta versão deve ser usada em páginas públicas controladas. Desative a leitura automática, pause a sessão ou adicione o domínio às exclusões se houver dúvida.

Não há garantia de retenção zero no provedor. store:false desativa persistência recuperável da resposta, e políticas de abuso/contrato do provedor podem aplicar-se. Consulte https://platform.openai.com/docs/guides/your-data antes de distribuir.

## Ameaças

| Ameaça | Tratamento | Limite |
| --- | --- | --- |
| Prompt injection | Dados separados, sem tools, JSON validado | Instrução maliciosa ainda pode afetar classificação; avaliar com modelo real |
| Chave exposta | Somente Secret do Worker / .dev.vars ignorado | Administrador precisa configurar corretamente |
| Abuso de endpoint | JWT assimétrico, origem exata, quotas atômicas, kill switch | Contas múltiplas exigem orçamento global no provedor |
| Resultado atrasado | Revisão + revalidação de aba/foco/permissão | Fragmento já enviado não pode ser retirado retroativamente |
| Sleep/worker suspenso | Checkpoints, reconciliação e descarte de lacunas | Pode subcontar atividade |
| XSS em justificativa | React/textContent, nunca HTML | Página hospedeira pode remover o overlay |
| Cota concorrente | Durable Object por sub | Limites por usuário, não orçamento global |

## Revogação e exclusão

Configurações permite desativar a leitura automática e remover o acesso amplo, limpar correções e excluir dados locais, encerrando a sessão. Os contadores do servidor permanecem para não permitir bypass de cota. Não há logs de prompts, cabeçalhos Authorization, textos ou tokens no código da aplicação. Configure também logs, observabilidade e retenção da infraestrutura ao implantar.

## Escopo automático

A permissão ampla não é obrigatória silenciosamente na instalação. A pessoa confirma o consentimento e aceita o diálogo do Chrome ao iniciar/ativar. Sem esse acesso inicial, o motor rejeita o início da sessão e não lê conteúdo. A revogação invalida classificações pendentes e impede novas extrações, inclusive quando permissões individuais antigas ainda existem. Chats de IA e endereços locais/privados são excluídos por padrão. Histórico completo, outras abas em segundo plano e aplicativos do sistema não são monitorados.
