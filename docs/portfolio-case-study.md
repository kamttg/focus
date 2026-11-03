# Fio: estudo de caso de engenharia

## Problema e hipótese

Um domínio pode conter material útil e entretenimento. Bloqueios fixos não expressam a intenção de uma sessão. A hipótese é que classificação semântica acompanhada de incerteza e correção explícita permita lembretes mais contextuais. A hipótese ainda exige avaliação com pessoas e modelo real.

## Solução implementada

Chrome Extension MV3 com React e Worker serverless. A pessoa define objetivo e temas, escolhe duração, autoriza origens e recebe sinalizações não punitivas. O fluxo observar → interpretar → decidir → lembrar → incorporar feedback combina automação por eventos com IA. Não há autonomia completa nem agente com ferramentas de navegação.

## Decisões

- Terceira classe uncertain para priorizar menos interrupções indevidas.
- Feedback humano supera a IA durante a sessão.
- Separação entre coleta, classificador e motor de decisão.
- Chave apenas no servidor; JWT e cota antes de endpoint público.
- Permissão por origem e extração minimizada, com limites explícitos.
- Subcontagem deliberada em lacunas de atividade para evitar métricas enganosas.
- Sem ranking ou índice de produtividade.

## Evidências disponíveis

Código, testes automatizados, pipeline com artefatos instaláveis e screenshots de fixtures públicas/sintéticas. O protótipo HTML documenta o fluxo navegável. Não foi criada pesquisa com participantes, validação clínica, gravação real ou avaliação de 48 páginas com IA.

## Aprendizados a validar

Taxa de correções após alertas, compreensão de permissões, adequação do cooldown e latência/custo por sessão. Registrar falhas do modelo e discutir limites é parte do case, não um resultado a ocultar.

## Próximos passos

Avaliar o corpus com anotação humana, gravar vídeo de demonstração real, revisar acessibilidade com participantes, validar regras em diferentes sites e preparar a política de distribuição antes de Chrome Web Store.
