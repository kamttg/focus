# Fio — AI Focus Companion

Extensão de foco contextual: você define uma intenção, autoriza uma origem e recebe lembretes gentis quando a IA identifica conteúdo provavelmente fora do tema. Dois vídeos do mesmo domínio podem ter classificações distintas. Não bloqueia páginas, não mede atenção e não faz diagnósticos.

[![Validate Fio](https://github.com/kamttg/focus/actions/workflows/ci.yml/badge.svg)](https://github.com/kamttg/focus/actions/workflows/ci.yml)

## O que está implementado

- Chrome Manifest V3 com WXT, React, TypeScript e Tailwind.
- Sessões de estudo, trabalho ou atividade personalizada; duração indefinida ou 25/50/90 minutos; pausa, retomada e término.
- Consentimento informado e autorização opcional por origem; revogação, exclusões e exclusão de dados.
- Extração de até 1.500 caracteres, sem formulários, áreas editáveis e regiões privadas conhecidas.
- Worker com Responses API, saída estruturada, validação, fallback uncertain, autenticação JWT e cotas atômicas por usuário.
- Cache temporário por hash de objetivo/contexto, estabilização, backoff e limites locais.
- Tempo de desvio apenas com aba ativa, janela em foco e usuário ativo; eventos, timestamps e alarmes MV3.
- Notificações silenciosas e overlay acessível; correções por domínio válidas na sessão, adiar e ignorar.
- Testes Vitest e Playwright com uma extensão real no Chromium; CI gera pacote instalável, screenshots e relatório.

## Executar localmente

Requisitos: Node.js 22+, npm, Chrome/Chromium e conta OpenAI com acesso ao modelo configurado.

~~~sh
git clone https://github.com/kamttg/focus.git
cd focus
npm install
cp worker/.dev.vars.example worker/.dev.vars
npm run dev:worker
# Em outro terminal:
npm run dev
~~~

1. Coloque a chave real somente em worker/.dev.vars; nunca a publique.
2. Abra chrome://extensions, ative o modo de desenvolvedor e carregue extension/.output/chrome-mv3-dev. Para build estável, use npm run build e carregue extension/.output/chrome-mv3.
3. Copie o ID da extensão para ALLOWED_ORIGINS em worker/.dev.vars (chrome-extension://ID). Reinicie o Wrangler.
4. Nas configurações do Fio, mantenha http://localhost:8787 como backend, aceite o consentimento e salve. Essa ação solicita acesso ao endpoint.
5. Abra uma página pública, inicie a sessão e clique em Autorizar site atual. A análise depende também de o Worker estar habilitado.

O modo AUTH_MODE=local funciona exclusivamente em URLs localhost/127.0.0.1. Um deploy remoto nesse modo rejeita autenticação.

**Modelo:** o plano solicita gpt-6-luna. O nome está em OPENAI_MODEL e não foi validado contra uma conta real. Se a API rejeitar o identificador ou reasoning.effort, configure um modelo/nível compatível com Responses e Structured Outputs. A integração nunca substitui falha da IA por heurística de domínio.

## Backend público autenticado

O código está pronto para configuração; publicar o repositório não provisiona Cloudflare, Supabase ou créditos da OpenAI.

1. Crie um projeto Supabase e contas de demonstração. Ative assinatura JWT assimétrica ES256 ou RS256. Tokens legados HS256 não são aceitos.
2. No template de e-mail OTP, exponha o código com a variável Token do Supabase. A interface usa código por e-mail, não redirecionamento OAuth.
3. Em worker/wrangler.jsonc configure AUTH_MODE=jwt, AUTH_ISSUER=https://SEU-PROJETO.supabase.co/auth/v1, AUTH_AUDIENCE=authenticated e ALLOWED_ORIGINS=chrome-extension://ID. Liste origens exatas separadas por vírgula.
4. Execute npx wrangler secret put OPENAI_API_KEY dentro de worker/. Configure cotas e ENABLED=true apenas quando estiver pronto.
5. Execute npm run deploy -w worker. O Durable Object mantém somente contadores por identidade.
6. Na extensão, informe o endpoint HTTPS, a URL do Supabase e a chave pública publishable/anon. Salve, entre com uma conta previamente criada e autorize apenas os sites desejados.
7. Configure orçamento e alertas de gasto no provedor. ENABLED=false é a desativação emergencial. O limite diário aplica-se por usuário; o orçamento global depende do provedor.

JWT é verificado por assinatura, issuer, audience, sub e exp. CORS sozinho não autentica. A chave OpenAI nunca entra na extensão. JWT e refresh token ficam em chrome.storage.session, restrito aos contextos confiáveis. Reiniciar o navegador exige novo login.

## Testes e build

~~~sh
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
# Linux com interface virtual:
xvfb-run --auto-servernum npm run test:e2e
# macOS/Windows com ambiente gráfico:
npm run test:e2e
~~~

O [workflow](.github/workflows/ci.yml) executa essas etapas e publica fio-chrome-mv3 e fio-validation como artefatos. Os testes não precisam de chave OpenAI e não fazem inferências pagas. Resultados reais estão em [Actions](https://github.com/kamttg/focus/actions); os testes de contrato usam respostas simuladas, sem alegar validação semântica do modelo.

## Comportamentos e limites conhecidos

- “Sem espera” significa após estabilização e confirmação da IA. Alarmes podem acrescentar cerca de 30 segundos ao prazo.
- O estado da sessão fica em storage.session e sobrevive à suspensão do service worker, mas não ao fechamento do navegador. Um reinício começa sem sessão para evitar monitoramento inesperado.
- Lacunas maiores que 45 segundos não são creditadas. Essa regra favorece subcontagem em vez de tempo artificial após sleep.
- Pausar congela a duração fixa; tempo de espera da IA não entra no desvio.
- O Chrome oferece no máximo dois botões por notificação: Faz parte e Adiar. Clique no corpo para abrir o popup; o overlay oferece também Voltar, Ignorar e Pausar.
- Voltar ao foco só ativa a aba indicada explicitamente ao iniciar a sessão. Se ela tiver sido fechada, a extensão não navega por conta própria.
- Permissões e filtros reduzem exposição; não detectam todo conteúdo sensível. Não autorize páginas privadas ou serviços com dados pessoais.
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
