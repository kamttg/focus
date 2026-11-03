# Fio — AI Focus Companion

Extensão de foco contextual: você define uma intenção, ativa a leitura automática uma vez e recebe lembretes gentis quando a IA identifica conteúdo provavelmente fora do tema. Dois vídeos do mesmo domínio podem ter classificações distintas. Não bloqueia páginas, não mede atenção e não faz diagnósticos.

[![Validate Fio](https://github.com/kamttg/focus/actions/workflows/ci.yml/badge.svg)](https://github.com/kamttg/focus/actions/workflows/ci.yml)

## O que está implementado

- Chrome Manifest V3 com WXT, React, TypeScript e Tailwind.
- Sessões de estudo, trabalho ou atividade personalizada; duração indefinida ou 25/50/90 minutos; pausa, retomada e término.
- Consentimento informado e uma autorização inicial de acesso HTTP/HTTPS; leitura automática, desativação, exclusões e exclusão de dados.
- Extração de até 1.500 caracteres, sem formulários, áreas editáveis e regiões privadas conhecidas.
- Worker com Responses API, saída estruturada, validação, fallback uncertain, autenticação JWT e cotas atômicas por usuário.
- Cache temporário por hash de objetivo/contexto, estabilização, backoff e limites locais.
- Tempo de desvio apenas com aba ativa, janela em foco e usuário ativo; eventos, timestamps e alarmes MV3.
- Notificações silenciosas e overlay acessível; correções por domínio válidas na sessão, adiar e ignorar.
- Testes Vitest e Playwright com uma extensão real no Chromium; CI gera pacote instalável, screenshots e relatório.

## Interface

Screenshots gerados no Chromium com páginas sintéticas e API simulada:

Baixe o artefato **fio-validation** na execução bem-sucedida do [GitHub Actions](https://github.com/kamttg/focus/actions). Ele inclui popup, sessão, lembrete e configurações, além do relatório de testes e do lockfile usado no build.

## Executar localmente

Requisitos: Node.js 22.12+ (linha 22), 24 ou 26+, npm, Chrome/Chromium e conta OpenAI com acesso ao modelo configurado.

~~~sh
git clone https://github.com/kamttg/focus.git
cd focus
npm ci
cp worker/.dev.vars.example worker/.dev.vars
npm run dev:worker
# Em outro terminal:
npm run dev
~~~

1. Coloque a chave real somente em worker/.dev.vars; nunca a publique.
2. Abra chrome://extensions, ative o modo de desenvolvedor e carregue extension/.output/chrome-mv3-dev. Para build estável, use npm run build e carregue extension/.output/chrome-mv3.
3. Copie o ID da extensão para ALLOWED_ORIGINS em worker/.dev.vars (chrome-extension://ID). Reinicie o Wrangler.
4. Nas configurações do Fio, mantenha http://localhost:8787 como backend, aceite o consentimento e salve. Essa ação solicita acesso ao endpoint.
5. Abra uma página pública, inicie a sessão, confirme a leitura automática e aceite o acesso aos sites uma única vez. Depois navegue entre páginas e domínios sem liberações individuais. A análise depende também de o Worker estar habilitado.

O modo AUTH_MODE=local funciona exclusivamente em URLs localhost/127.0.0.1. Um deploy remoto nesse modo rejeita autenticação.

**Modelo:** gpt-6-luna, com Responses API e Structured Outputs, conforme a [documentação oficial da OpenAI](https://developers.openai.com/api/docs/models/gpt-6-luna). O identificador é configurável em OPENAI_MODEL. A disponibilidade para a sua chave, os créditos e uma inferência real ainda precisam ser confirmados na sua conta; os testes automatizados usam respostas simuladas. Falha da IA nunca é substituída por heurística de domínio.

## Backend público autenticado

O código está pronto para configuração; publicar o repositório não provisiona Cloudflare, Supabase ou créditos da OpenAI.

1. Crie um projeto Supabase e contas de demonstração. Ative assinatura JWT assimétrica ES256 ou RS256. Tokens legados HS256 não são aceitos.
2. No template de e-mail OTP, exponha o código com a variável Token do Supabase. A interface usa código por e-mail, não redirecionamento OAuth.
3. Em worker/wrangler.jsonc configure AUTH_MODE=jwt, AUTH_ISSUER=https://SEU-PROJETO.supabase.co/auth/v1, AUTH_AUDIENCE=authenticated e ALLOWED_ORIGINS=chrome-extension://ID. Liste origens exatas separadas por vírgula.
4. Execute npx wrangler secret put OPENAI_API_KEY dentro de worker/. Configure cotas e ENABLED=true apenas quando estiver pronto.
5. Execute npm run deploy -w worker. O Durable Object mantém somente contadores por identidade.
6. Na extensão, informe o endpoint HTTPS, a URL do Supabase e a chave pública publishable/anon. Salve, entre com uma conta previamente criada e ative a leitura automática. Gerencie exceções na lista de sites excluídos.
7. Configure orçamento e alertas de gasto no provedor. ENABLED=false é a desativação emergencial. O limite diário aplica-se por usuário; o orçamento global depende do provedor.

JWT é verificado por assinatura, issuer, audience, sub e exp. CORS sozinho não autentica. A chave OpenAI nunca entra na extensão. JWT e refresh token ficam em chrome.storage.session, restrito aos contextos confiáveis. Reiniciar o navegador exige novo login.

## Testes e build

~~~sh
npm run audit
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
# Linux com interface virtual:
xvfb-run --auto-servernum npm run test:e2e
# macOS/Windows com ambiente gráfico:
npm run test:e2e
~~~

O [workflow](.github/workflows/ci.yml) executa essas etapas e publica fio-chrome-mv3 e fio-validation como artefatos. Os testes não precisam de chave OpenAI e não fazem inferências pagas. O CI tem acesso somente de leitura ao repositório. O package-lock.json está versionado na raiz. Use npm ci para instalar as mesmas versões verificadas; o CI também executa npm audit incluindo ferramentas de desenvolvimento. Resultados reais estão em [Actions](https://github.com/kamttg/focus/actions); os testes de contrato usam respostas simuladas, sem alegar validação semântica do modelo.

## Comportamentos e limites conhecidos

- “Sem espera” significa após estabilização e confirmação da IA. Alarmes podem acrescentar cerca de 30 segundos ao prazo.
- O estado da sessão fica em storage.session e sobrevive à suspensão do service worker, mas não ao fechamento do navegador. Um reinício começa sem sessão para evitar monitoramento inesperado.
- Lacunas maiores que 45 segundos não são creditadas. Essa regra favorece subcontagem em vez de tempo artificial após sleep.
- Pausar congela a duração fixa; tempo de espera da IA não entra no desvio.
- O Chrome oferece no máximo dois botões por notificação: Faz parte e Adiar. Clique no corpo para abrir o popup; o overlay oferece também Voltar, Ignorar e Pausar.
- Voltar ao foco só ativa a aba indicada explicitamente ao iniciar a sessão. Se ela tiver sido fechada, a extensão não navega por conta própria.
- Permissões e filtros reduzem exposição; não detectam todo conteúdo sensível. Use exclusões ou pause a sessão ao acessar páginas privadas que os filtros não reconheçam.
- Não há publicação na Chrome Web Store, site público, vídeo gravado ou resultados de pesquisa com participantes.
- Não há sincronização nem telemetria. A cota local não é mecanismo de segurança; a cota do Worker é.

## Documentação

- [Arquitetura e decisões](docs/architecture.md)
- [Privacidade e ameaças](docs/privacy.md)
- [Avaliação e cenários](docs/evaluation.md)
- [Case de portfólio](docs/portfolio-case-study.md)
- [Roteiro de demonstração](docs/demo.md)
- [Protótipo navegável em HTML](docs/prototype.html)

Projeto de engenharia e portfólio. A validação clínica e a inferência de estado cognitivo estão fora do escopo.

## Windows / PowerShell

Abra no VS Code a pasta que contém este README, package.json, extension e worker. Em Terminal → Novo Terminal:

~~~powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run audit
~~~

npm.cmd evita bloqueios de scripts do PowerShell, sem alterar a política de execução do Windows. Para iniciar o servidor local depois de configurar worker/.dev.vars, use npm.cmd run dev:worker.

Se você baixou uma versão anterior por ZIP, baixe o código atualizado em uma nova pasta e abra essa pasta no VS Code. Preserve seu worker/.dev.vars, caso já tenha sido criado, sem enviá-lo ao GitHub. O ZIP extraído pode conter outra pasta focus-main: o comando deve ser executado onde está package.json, não na pasta acima.

Não use npm audit fix --force para resolver diferenças de versão automaticamente. As atualizações de WXT, Vite, Vitest e Zod foram coordenadas e validadas em conjunto; futuras auditorias podem detectar novos avisos e devem ser avaliadas antes de alterar o lockfile.

## Atualização 0.1.1 — identificação da aba

O monitor consulta a aba ativa da última janela selecionada e verifica o foco diretamente na janela dessa aba. Não depende de uma lista de janelas com tipo normal. Quando o Chrome perde foco, mantém o domínio identificável na interface, sem coletar ou contar tempo em segundo plano.

Ao fechar o popup da barra, a extensão verifica novamente a aba imediatamente, sem depender de o Chrome emitir um evento de foco ou de aguardar o alarme periódico.

O popup agora diferencia falta de consentimento, permissão por origem, inatividade, janela em segundo plano, página excluída e falha de extração. O botão de autorização aparece somente quando a permissão da origem está faltando. A versão instalada aparece no rodapé.

Para aplicar sobre uma instalação local existente, preserve a pasta da extensão e o arquivo privado worker/.dev.vars. Depois de atualizar o código e executar npm.cmd ci e npm.cmd run build, clique em Recarregar no cartão do Fio em chrome://extensions. Atualizar na mesma pasta preserva o ID da extensão; carregar uma pasta diferente pode mudar o ID e exigir atualizar ALLOWED_ORIGINS no servidor.

## Atualização 0.1.2 — foco independente e diagnóstico

Em origens consentidas, autorizadas e não sensíveis, a extensão verifica document.hasFocus() e visibilityState no mundo isolado. Esses dois sinais permitem confirmar uma página ativa quando o sinal da janela do Chrome fica desatualizado. Visibilidade sozinha não autoriza análise. Janela minimizada, página sem foco e sistema idle continuam sem contagem. Observadores de foco e visibilidade enviam apenas eventos sem texto e são removidos ao pausar, encerrar ou revogar a origem.

O popup mantém visível o último resultado recebido durante pausas de foco, mostra erros seguros de autenticação, crédito, modelo, quota e conexão, e oferece um diagnóstico sem prompts nem chaves. O botão Testar aviso (sem IA) exibe uma prévia explicitamente rotulada, sem chamada ao provedor, sem alterar classificação e sem consumir cooldown. Ele não comprova classificação semântica.

O servidor reserva até 1500 tokens quando reasoning low está configurado (500 com none), incluindo o orçamento de raciocínio. Respostas incompletas ou recusadas continuam sem alertas. Nenhuma mensagem bruta do provedor é refletida no cliente ou registrada em logs.

## Versão 0.2.0 — leitura automática durante a sessão

Na primeira ativação, a pessoa confirma o envio limitado de contexto e o Chrome solicita acesso HTTP/HTTPS uma única vez. A permissão é opcional na instalação e só é solicitada em um clique explícito. Depois disso, iniciar ou retomar uma sessão não exige autorizar cada domínio; o Fio observa a aba ativa, aplica exclusões, estabiliza o conteúdo e consulta a IA quando necessário.

Permissões individuais antigas não são convertidas silenciosamente em acesso global. Instalações anteriores exibem Ativar leitura automática e pedem a nova autorização. Recusar mantém a leitura desativada. Nas configurações, Desativar leitura automática pausa a sessão e remove o acesso amplo. Revogação no Chrome também interrompe novas análises.

E-mails, bancos, conversas (inclusive ChatGPT, Claude e Gemini), páginas de login, campos privados, rede local, origens excluídas e navegação anônima ficam fora da coleta. Os filtros não detectam todo conteúdo privado da web. Uma autorização ampla é uma capacidade técnica maior que os dados efetivamente extraídos; a interface explica essa diferença antes da ativação.

## Correção do Worker — receiver de fetch

No runtime workerd, guardar fetch nativo como propriedade e chamar this.transport(...) provoca Illegal invocation antes de a chamada chegar à OpenAI. O transporte padrão agora invoca fetch no escopo global e trata também exceções síncronas. Falhas internas do servidor não são mais anunciadas como falta de conexão com o próprio servidor.

Após npm run build, npm run test:worker-runtime executa o bundle em Miniflare/workerd, com Durable Object e SQLite reais e uma resposta OpenAI simulada na fronteira de rede. O teste verifica a saída estruturada e a cota, sem API key real nem tráfego externo. Reintroduzir o receiver antigo faz esse teste falhar com HTTP 502.

Para aplicar apenas esta correção a uma instalação 0.2.0, atualize worker/src/openai.ts, worker/src/index.ts e shared/analysis-errors.ts e reinicie o Worker. Não é necessário reconstruir ou reinstalar a extensão; preserve worker/.dev.vars e seu ID atual.
