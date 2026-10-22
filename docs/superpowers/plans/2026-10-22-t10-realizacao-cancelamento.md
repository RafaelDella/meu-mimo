# T10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** completar combinado, realização e cancelamento com devolução única e histórico privado.

**Architecture:** transação existente com lock de loja, projeção versionada e eventos imutáveis. Ledger conserva origens distintas; estado, evento, devolução, reposição opcional e outbox confirmam juntos.

**Tech Stack:** Next.js/React/TypeScript, Prisma 7/PostgreSQL, Supabase Auth/Storage locais, node:test e Playwright existentes.

**Spec:** [desenho T10](../specs/2026-10-22-t10-realizacao-cancelamento-design.md), confirmado pelo idealizador em 22/10/2026 com autorização de implementar e fazer commit. O pedido posterior amplia a execução até T15, preservando dependências e decisões ainda necessárias do roadmap.

## Global Constraints

- Textos simples de até 500 caracteres Unicode; data civil opcional YYYY-MM-DD, inclusive passada, no fuso congelado do ticket.
- Combinado revisável; realização de WAITING_AGREEMENT/AGREED. FULFILLED/CANCELLED terminais; solicitação bloqueia combinado/realização.
- D03 permite tratar ticket pausado/encerrado; revogação/suspensão prevalecem.
- Devolução igual ao custo congelado uma vez; reposição desmarcada, somente emissão/catálogo limitados e estoque <1.000.000, inclusive arquivado.
- Nenhuma migração aplicada é editada; especialmente preservar bytes T09. Credenciais e artefatos fora do Git.
- Sem dependências novas. Máximo 350 linhas por JS/TS. Um escritor por arquivo; root serializa Git, builds, typegen, serviços e bancos.
- README.md contém alteração local anterior à execução; preservar e não incluir inadvertidamente no commit.

## Review Focus

- Replay após transições posteriores deve distinguir evento aplicado e estado atual (tarefa 2/4).
- Reposição após edição/arquivamento não reabre catálogo nem usa revisão administrativa para dois efeitos (tarefa 1/4).
- Cancelamento com saldo negativo devolve custo sem virar ganho de atividade (tarefa 2/4).
- Histórico crescente permanece paginado e privado após perda de acesso (tarefa 2/3/4).
- Resposta perdida/reload e troca de conta descartam dados privados sem criar intenção duplicada (tarefa 3).

## Contratos e interfaces compartilhados

Root escreve `web/src/contracts/redemptions.ts` antes dos despachos. Ações:
`AGREE`, `FULFILL`, `REQUEST_CANCELLATION`, `REJECT_CANCELLATION`, `CANCEL`.
Corpo: operationId, expectedVersion, action, text (quando exigido), agreementDate
(AGREE, null remove), expectedBalance (CANCEL), restock (CANCEL, boolean explícito),
expectedStockRevision (somente restock). Rejeitar campos alheios à ação.

TicketView conserva campos T09 e acrescenta version, agreementText,
agreementDate, fulfilledAt, cancelledAt, pendingCancellation, actions,
cancellationImpact. events contém no máximo primeira página de 20, eventsTotal
informa tamanho. GET eventos usa PageResult<TicketEventView> ordenado por versão.
Impacto contém saldo atual/resultante e elegibilidade/revisão/quantidade do estoque.

Evento: id, version, kind (ISSUED ou ação), fromStatus, toStatus, text,
agreementDate, requestId, delta como string, restocked, stockBefore/After/Revision,
createdAt, author. Mutation: {ticket,event,appliedVersion}; lookup: {operation:
TicketTransitionMutation|null}. Leitura de lookup só revela operação do ator
atual daquele ticket; null exige revisão, não repetição automática.

Persistência acordada: Redemption.version=1, agreementText='', agreementDate?,
cancellationFromStatus?, fulfilledAt?, cancelledAt?. RedemptionEvent acrescenta
version=1, fromStatus?, toStatus=WAITING_AGREEMENT, text='', agreementDate?,
requestDigest='', requestId? único, delta=0, restocked=false,
stockBefore/After/Revision? e balanceBefore/After?; kinds novos iguais às ações.
ISSUED antigo mantém ID/horário e defaults compatíveis. Versão única por ticket.
PointsEntry.redemptionEventId? único para refund; compensatesEntryId aponta débito.
OutboxEvent.redemptionEventId? para transições; NotificationKind REDEMPTION_UPDATED.
FKs compostas complementares em SQL. Não criar ciclo de FK da projeção ao evento.

## Ondas e responsáveis

| Onda | IDs | Responsável e arquivos permitidos | Recursos |
| --- | --- | --- | --- |
| 0 | Contrato/plano | root: contratos, documentos | leitura/escrita de fontes |
| 1 | 1, 2, 3 | dados: schema/nova migração/check-migrations/check-tickets-migration; domínio: server/redemptions, server/points, server/outbox/events.ts, server/notifications/queries.ts, API tickets; UI: components/tickets, components/points/statement-area.tsx, tests/e2e/tickets, testes/helpers T09 DTO | somente fontes; checks mutáveis reservados ao root |
| 1 | 4 | root: scripts restantes, package.json/workflow, helpers integração, tests/integration/tickets, contracts/activities e notifications | fontes, depois serviços/checks em série |
| 2 | 5 | revisores independentes somente leitura; root corrige/integrará | snapshot de arquivos e logs, sem disputar bancos/builds |

Os contratos são fixados antes da onda 1; novos tipos gerados são produzidos
pelo root após schema pronto. Nenhum implementador comita. Equivalente nativo
ao executor de subagentes, não disponível como skill separada no catálogo.
O commit final único da etapa é feito pelo root após verificações e revisão,
conforme pedido do idealizador; não haverá commits de partes não verificadas.

### Tarefa 1: evolução e invariantes SQL

**Files:** `web/prisma/schema.prisma`, nova `web/prisma/migrations/20261022235950_ticket_transitions/migration.sql`, `web/scripts/check-migrations.mjs`, `web/scripts/check-tickets-migration.mjs` (helpers adicionais de prova se necessário).

**Interfaces:** produz campos de persistência acima, concessões restritas e guardas de estado/auditoria/refund/reposição. Consome cadeia T07–T09 intacta.

- [x] Separar estágio T09 antes de T10, guardar dados anteriores e acrescentar prova de preservação/novos defaults.
- [x] Acrescentar prova SQL de estado sem evento, cancelamento sem refund, refund sem cancelamento/contexto inválido, snapshots/grants, duas devoluções e reposição sem escolha.
- [x] Implementar migração aditiva com CHECK explícito (sem escapar por NULL), FKs, índices e triggers diferidos; preservar funções fortalecidas de atividade.
- [x] Root confere fins de linha uniformes antes de aplicar; executa `db:migrate:check`: todas migrações, preservação, RLS/grants e invariantes aprovados.

### Tarefa 2: domínio, eventos e API

**Files:** `web/src/server/redemptions/**`, `web/src/server/points/**`, `web/src/server/outbox/events.ts`, `web/src/server/notifications/queries.ts`, novas rotas `tickets/[ticketId]/{transicoes,eventos,operacoes/[operationId]}/route.ts`.

**Interfaces:** `transitionTicket(identity,storeId,ticketId,body):Promise<TicketTransitionMutation>`; `lookupTicketTransition(identity,storeId,ticketId,operationId):Promise<TicketTransitionLookup>`; `listTicketEvents(identity,storeId,ticketId,query):Promise<TicketEventPage>`. Views produzem DTO root; emissão T09 mantém defaults versionados.

- [x] Validar campos por ação, texto/data e versão; calcular ações/impacto no detalhe autorizado.
- [x] Implementar transação/replay, marcos, resolução única, refund e estoque de acordo com contrato, sem assertStoreWritable que bloqueie tickets encerrados.
- [x] Enfileirar REDEMPTION_UPDATED por evento para outra pessoa; destino reautoriza ticket/evento. Extrato acrescenta REDEMPTION_REFUND e conserva filtros de atividade.
- [x] Root executa HTTP da tarefa 4: sem duplicidade/efeitos parciais, leitura paginada e replay atual passam.

### Tarefa 3: interface, acessibilidade e recuperação

**Files:** `web/src/components/tickets/**`, `web/src/components/points/statement-area.tsx`, `web/tests/e2e/tickets/**`, DTOs em `web/tests/e2e/redemptions/helpers.ts` se exigidos pelo contrato.

**Interfaces:** consome TicketView/Transition/Page contratos e rotas acima, RewardAccess, useTicketSummary().reload, Dialog e transporte existentes.

- [x] Implementar formulários/confirmadores de combinado, realização, pedido, recusa e cancelamento; checkbox de reposição desmarcado e impacto real; foco/erros/limites Unicode.
- [x] Renderizar combinado/data/marcos, timeline paginada, extrato de devolução e atualizar contador/saldo; manter snapshot/conversa e retorno com filtros.
- [x] Preservar UUID/corpo, consulta de operação e reload com referência opaca; conflito exige revisão explícita; 401/403/404 limpa fronteira privada; troca de contexto aborta respostas.
- [x] E2E cobre cinco ações, estados terminais, recusa para dois estados, erro/foco, resposta perdida/reload/409/429/503, troca de conta e negações de todas fontes novas.
- [x] Root executa Chromium 320/390, 200%, teclado/Escape/foco/movimento reduzido; examina capturas dos estados críticos.

### Tarefa 4: runtime e prova HTTP real

**Files:** `web/scripts/{local-runtime,prepare-local,prepare-media,media-environment,media-fixtures,media-local,prisma-local,outbox-local,integration,run-tests}.mjs`, `web/src/server/media-worker/config.ts`, `web/package.json`, `.github/workflows/quality.yml`, `web/tests/integration/helpers/{environment,fixtures}.mjs`, `web/tests/integration/media/helpers.mjs`, `web/tests/integration/tickets/**`, `web/src/contracts/{activities,notifications}.ts`.

**Interfaces:** domínio `meumimo_t10`/dev/shadow, prefixos t10-development/integration, Auth existente, Next4310/mídia4311, estado ignorado `.artifacts/t10-runtime/`. Reusa fixtures reais de crédito/resgate T09.

- [x] Ampliar allowlists/regex para t10/T10_ sem vazar credenciais ao Next; preparar local e migrar dev/integração sem resetar outros bancos.
- [x] Acrescentar suites de estados/limites, autorização/CSRF, recuperação/idempotência, corridas e rollback, estoque editado/arquivado/ilimitado/teto, histórico/avisos e pausa/encerramento.
- [x] Fixar teste 15→resgate10→anulação−15→cancelamento+10 =0 e garantir nenhuma devolução nos ganhos/ajustes de atividade.
- [x] `npm run check`, `db:migrate:check`, `test:integration:t10` (todas regressões até T09) e `web:test:e2e`; documentar qualquer falha de infraestrutura e sua reprodução focal.

### Tarefa 5: revisão, documentos e commit

**Files:** canônicos `requisitos.md`, `arquitetura.md`, `design.md`, `AGENTS.md`, `docs/{onboarding,setup,quality}.md`, `docs/tickets-local.md`, este plano, roadmap/fundação; preservar trecho local de README.

- [x] Registrar snapshot revisável e despachar revisão independente de SQL/segurança e UI/qualidade, somente leitura.
- [x] Reproduzir achados confirmados, corrigir e repetir checks afetados; registrar evidências e limites sem alegar aparelho físico/CI/publicação não observados.
- [x] Atualizar decisões D04 confirmadas, contratos/comandos, status e próximo pacote T11. Scan de segredos, links e diff; confirmar migração T09 intacta.
- [x] Capturar HEAD, staged diff e estado; root faz commit `feat(tickets): implementa combinado realizacao e cancelamento de T10`, excluindo alteração local anterior do README.

## Continuidade autorizada até T15

Após T10 verificada e commitada: T11 álbum → T12 relação/novidades/dashboards →
T13 administração → T14 aceite/recuperação local → T15 pacote web local.
Cada etapa usa o aceite canônico e atualiza contratos, evidências e commit.
Os desenhos T11–T15 foram confirmados durante a execução. O idealizador pediu
prioridade à versão web com PostgreSQL local e adiou provedores, custos,
publicação e aparelhos físicos. Esses gates não impedem a entrega local e não
serão apresentados como executados. Cada etapa conserva evidências e commit.

## Execução e evidências

Plano conferido contra o desenho confirmado. Execução autorizada no aceite do
desenho com método Toolkit preservado; dispensada nova pergunta sobre as mesmas
regras. Evidências funcionais observadas constam abaixo.


- Base T09: 753ae367c6619b5736fa39910aa03ab275e8c914, publicada em origin/codex/t09-catalogo-resgates a pedido; execução T10 na branch codex/t10-realizacao-cancelamento.
- Check final: lint/tipos/build e 7 testes do protótipo +9 web aprovados; lint repetido após corrigir seletores dos testes, saída0.
- Prova SQL: doze migrações, banco vazio/evolutivo, dados e privilégios efetivos preservados. Aplicação aditiva aos bancos T10 dev/integração; bytes T09/T10 no índice iguais aos arquivos aplicados.
- HTTP real final: 249/249, sem falhas ou skips, incluindo 38 casos T10 e 211 regressões; duração324.619s. Auth/PostgreSQL/Storage locais; Next4310/mídia4311 encerrados pelo driver.
- Chromium final: 454 executados em320/390; 453 passaram e um caso antigo de convite pausado falhou por chunk JavaScript com net::ERR_NO_BUFFER_SPACE, antes da API. Trace privado preservado. O caso isolado passou nos dois projetos (2/2). Todos72 novos T10 passaram.
- A primeira suíte encontrou seletor ambíguo em três cenários de recuperação (duas larguras); o teste passou a buscar o botão dentro do diálogo. Os oito testes focais de recuperação/extrato passaram. Outro timeout anterior de extrato teve o mesmo erro de buffer no trace e passou isolado. Não houve aumento de timeout ou alteração de aplicação para essas falhas. Não alegar suíte integral sem falhas em uma única execução.
- Revisão independente SQL/segurança: P2 sobre motivos Unicode reproduzido na prova SQL; nova migração aditiva normaliza a mesma borda da API. RED falhou e GREEN passou; revisão focal encerrada sem regressão concreta.
- Revisão independente React/qualidade: P2 sobre foco perdido no histórico reproduzido em três navegações, ambas larguras (6/6 RED). Título estável recebe foco somente na navegação solicitada e carregada; 6/6 GREEN.
- Quatro capturas de pedido/cancelado a200%,320/390 examinadas, com diálogo rolável, texto e ações acessíveis. Testes de teclado/Escape/foco e movimento reduzido passaram. Leitor de tela real e aparelhos físicos não observados.
- Logs/capturas/traces em .artifacts/t10-runtime e web/.artifacts, ignorados. Scan local de537 arquivos sem segredos/chaves privadas; links locais e staged diff conferidos. README local e documentos de etapas futuras excluídos do commit T10. Nenhuma dependência, serviço pago, publicação ou migração real externa. CI remoto não observado.
