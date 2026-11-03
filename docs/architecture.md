# Arquitetura

~~~mermaid
flowchart TD
  UI[Popup / opções React] -->|mensagens validadas| BG[Service worker MV3]
  BG --> LOCAL[Preferências em storage.local]
  BG --> SESSION[Estado e cache em storage.session]
  EVENTS[Abas / janelas / idle / alarmes] --> BG
  BG --> POLICY[Consentimento + acesso HTTP/HTTPS + exclusões]
  POLICY -->|somente página elegível após ativação| EXTRACT[Injeção isolada / extrator limitado]
  EXTRACT --> HASH[Hash SHA-256 + cache TTL]
  HASH -->|sem cache e dentro da cota| API[Worker HTTPS]
  API --> AUTH[JWT + Durable Object de cotas]
  AUTH --> LLM[OpenAI Responses / Structured Outputs]
  LLM --> CONTRACT[Contrato validado]
  CONTRACT --> ENGINE[Motor local de tempo e decisão]
  ENGINE --> ALERT[Notificação silenciosa / overlay]
  ALERT --> FEEDBACK[Correção / adiar / ignorar / pausa]
  FEEDBACK --> BG
~~~

## Fronteiras

A IA classifica. O código local decide se pode coletar e se deve alertar. O modelo não recebe ferramentas. Instruções ficam separadas dos dados de página. O backend valida novamente o contrato e não armazena trechos.

O service worker serializa eventos e persistência. Chamadas externas ocorrem fora da fila; uma revisão monotônica invalida resultados atrasados após troca de página, pausa, feedback ou revogação. Antes de aplicar uma classificação, são conferidos foco, aba, URL, idle e permissão novamente.

## Tempo

O contador avança com timestamps quando a sessão está ativa, a janela ou a própria página confirma foco, a página está visível, o sistema está ativo e a classe é off_topic com confiança >= 0,8. A espera pela IA não conta. Abas diferentes e conteúdo relevante zeram o desvio contínuo; totais agregados podem permanecer na sessão.

A cada 30 segundos um alarme reconcilia o estado. SetTimeout é apenas otimização para a estabilização; existe também um alarme persistente. Ao iniciar uma nova instância do worker, o intervalo anterior é descartado por segurança e o contexto é reavaliado. Lacunas acima de 45 segundos não são somadas.

Sessões fixas congelam o prazo durante pausa. Sessões indefinidas terminam somente por ação explícita, exclusão de dados ou fechamento do navegador (storage.session).

## Cache e economia

Chave: SHA-256 de objetivo, temas e contexto. Valor: classe, confiança, justificativa e expiração de 10 minutos. Máximo de 100 entradas, só na sessão. Ao terminar, o cache é limpo. Nenhuma URL completa é enviada ao backend. Falhas provocam backoff exponencial de 30s até 5min. Cotas locais reduzem chamadas acidentais; Durable Objects serializam limites do servidor.

## SPA

O observador é injetado apenas após autorização. Eventos de histórico, título e mudanças significativas no conteúdo principal provocam nova estabilização. A análise permanece na aba ativa. Um hash igual evita nova chamada; observadores não transmitem trechos por mensagem.

## Autenticação e disponibilidade

Supabase OTP fornece JWT assimétrico. O Worker verifica JWKS do issuer configurado, audience e expiração. Falhas produzem uncertain, nunca off_topic por falta de rede. Limites atômicos no Durable Object contam tentativas, inclusive falhas do provedor, para proteger custos.

WXT gera o manifesto a partir de entrypoints e wxt.config.ts. Não há content script registrado em todos os sites; a extração e o overlay usam scripting.executeScript em origens cobertas pela autorização inicial e aprovadas pelas exclusões.

## Ativação única

O popup solicita as permissões HTTP/HTTPS opcionais diretamente no gesto de ativação, depois do consentimento. O backend local do navegador revalida o acesso global antes de iniciar e antes de cada coleta. Não há lista de domínios a liberar durante a navegação. A interface oferece desativação global e exclusões por domínio. O classificador continua interpretando o conteúdo, não regras de domínio para relevância.
