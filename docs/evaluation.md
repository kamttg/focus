# Avaliação reproduzível

## O que cada camada comprova

Vitest verifica contratos, extração e redação, exclusões, tempo ativo, suspensão/lacunas, limiares, cache, payload mínimo, Responses API, fallback e bloqueio remoto do modo local. Playwright carrega a extensão compilada no Chromium e verifica consentimento, sessões, privacidade do extrator em DOM real e ausência de análise em origem não autorizada.

Esses testes usam respostas de IA simuladas. Eles não demonstram precisão semântica, resistência real do modelo a prompt injection ou eficácia no foco.

## Corpus inicial

scenarios.json contém 48 cenários sintéticos para quatro objetivos. referenceLabel é uma expectativa de projeto, não anotação humana nem resultado do modelo. Antes de medir, peça que pessoas rotulem os casos independentemente e resolvam divergências. Use páginas públicas consentidas ou fixtures próprias. Não mande páginas privadas à API.

Inclua: dois conteúdos no mesmo domínio; relação indireta; página curta; prompt injection; vídeos sem descrição; documentação; páginas sensíveis; permissão negada; rede offline; 429; mudança SPA; troca de janela; idle; suspensão; feedback durante requisição; término durante requisição; revogação durante requisição.

## Demonstração com IA real

1. Habilite Worker local e forneça uma chave válida.
2. Configure um modelo disponível e registre seu identificador, data e nível de reasoning.
3. Inicie “Estudar Python e Pandas”. Autorize um domínio público.
4. Abra um tutorial de DataFrame; registre classe e justificativa.
5. Abra conteúdo claramente de entretenimento no mesmo domínio; registre classe e aguarde o lembrete.
6. Teste “Faz parte da tarefa” e confirme que futuras análises não anulam a correção.
7. Registre tempo entre início da chamada e resposta (visível nas configurações), quantidade de análises e uso da API no painel do provedor.
8. Não publique screenshots que contenham dados privados.

## Métricas a preencher

| Métrica | Resultado atual |
| --- | --- |
| Precisão de alertas / falso positivo | Não medida com modelo real |
| Latência p50/p95 | Não medida em produção |
| Custo por sessão | Depende do modelo, tokens e cache; não medido |
| Usabilidade com participantes | Não realizada |
| Testes automatizados | Ver execução do GitHub Actions |

Calcule precisão de alertas = TP/(TP+FP), separando uncertain de erros. Não trate confidence como probabilidade calibrada. Custo = tokens de entrada × tarifa de entrada + tokens de saída × tarifa de saída. Tarifas devem ser consultadas na data de execução.

## Verificação manual adicional

- Reiniciar Chrome deve encerrar a sessão temporária e pedir login novamente.
- Suspender worker deve preservar estado e cache, sem creditar a lacuna anterior na retomada.
- Sem rede, nenhum novo alerta de distração pode surgir por erro de classificação.
- Revogar a origem deve impedir nova extração e invalidar resultado pendente.
- SPA deve estabilizar novamente após mudança significativa.
- O build do cliente não pode conter chave OpenAI, service_role ou .dev.vars.
