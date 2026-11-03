# Privacidade e segurança

## Permissões

- tabs: URL e título da aba ativa para orquestração e exclusões. Capacidade sensível explicada no consentimento.
- scripting: funções isoladas para extrair e exibir overlay.
- optional_host_permissions HTTP/HTTPS: solicitado apenas por gesto explícito para origem individual. Backend e Supabase também exigem acesso.
- idle, windows/tabs, alarms: atividade observável do navegador e temporização.
- storage: preferências persistentes e estado temporário.
- notifications: lembretes silenciosos.
- Não há modo anônimo, cookies, captura de tela, microfone, histórico ou registro de teclas.

## Dados

O cliente envia objetivo, temas e domínio + até 1.500 caracteres combinados de título, descrição derivada de parágrafo visível, cabeçalhos e fragmentos. Não usa metadados invisíveis para descrição. Remoção local de e-mails, URLs e sequências numéricas reduz dados incidentais.

Text nodes são inspecionados individualmente para evitar que o texto de um ancestral inclua formulários ou filhos privados. Elementos ocultos, campos, editáveis, comentários conhecidos, mensagens e áreas privadas são excluídos. Campos de senha ou cartão fazem a página inteira deixar de ser examinada.

Preferências e contadores diários: storage.local. Objetivo, classe, hash, feedback e tokens: storage.session, apenas contextos confiáveis. O Worker guarda somente contadores. Os fragmentos existem em memória durante extração/chamada e em uma prévia local opcional até limpá-la ou fechar a página.

## Limitações assumidas

Uma permissão de origem permite tecnicamente mais leitura do que o extrator utiliza. Bloqueios de domínio e seletores são incompletos: um site arbitrário pode apresentar informações privadas como texto público. Esta versão deve ser usada em páginas públicas controladas. Revogue uma origem se houver dúvida.

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

Configurações permite remover origens, limpar correções e excluir dados locais, encerrando a sessão. Os contadores do servidor permanecem para não permitir bypass de cota. Não há logs de prompts, cabeçalhos Authorization, textos ou tokens no código da aplicação. Configure também logs, observabilidade e retenção da infraestrutura ao implantar.
