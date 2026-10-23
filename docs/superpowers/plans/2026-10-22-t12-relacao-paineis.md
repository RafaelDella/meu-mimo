# T12 Relationship and Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** entregar bilhetes individuais, reações, mural, novidades/preferências e L02/P01 com dados privados reais.

**Architecture:** versões/eventos imutáveis e projeções pequenas usam a transação de loja existente; leitura exata de bilhete pertence só ao destinatário. Agrupamento preserva Notification por evento. Feed e dashboards consultam as fontes autorizadas sem duplicar ledger ou conversa.

**Tech Stack:** Next.js/React/TypeScript, Prisma/PostgreSQL, Supabase Auth/Storage locais, node:test e Playwright existentes.

**Spec:** [desenho T12 confirmado integralmente](../specs/2026-10-22-t12-relacao-paineis-design.md), incluindo D04 de bilhete2.000, seis reações e agrupamento/preferências. Método Toolkit e execução até T15 já autorizados; não há nova escolha de método pendente.

## Global Constraints

- Pré-condição: T11 implementada, revisada, verificada e commitada antes de executar este plano; esta preparação só altera documentos.
- Bilhete simples obrigatório até2.000 caracteres Unicode; um atual por relação, versões preservadas. Pausa permite envio; encerramento permite só consulta/leitura.
- Reações exatas ❤️, 👏, 🥹, 🔥, 😂 e 🌷; uma por pessoa/item, trocar/remover; escrita segue Conversation.writable. Comentários500Unicode imutáveis permanecem T05.
- Janelas sociais de cinco minutos; silenciar por loja afeta só contador, conserva central/mural/leitura. Aviso automático começa ligado; nenhuma preferência oculta decisão financeira ou configura push inexistente.
- Uma novidade T11 por publicação, sem desmembrar fotos/vídeos. Preservar D03/D08 e contratos de álbum; nenhuma ação social altera pontos/estoque/ticket.
- Paginação20/50, limites120leituras/30mutações por minuto/conta, CSRF/no-store e audiência atual inclusive replay. Sem dados demonstrativos, ranking, chat coletivo ou recibo ao lojista.
- Sem dependência/serviço novo. JS/TS<350linhas. Um escritor por arquivo; root serializa Git/build/typegen/bancos/serviços. Não editar migração aplicada; preservar bytes T09.
- Consulta visível a cada30s sem sobreposição; consulta autorizada recupera offline/perda de eventos. Não declarar Realtime, aparelhos físicos, leitor de tela ou CI testados sem evidência.

## Review Focus

- Ler v1 enquanto v2 chega: só v1 recebe NoteRead; nenhum payload do lojista revela leitura (tarefas2/5).
- Grupo cresce após abrir ou recebe evento antigo atrasado: leitura até versão observada não lê o novo (tarefas3/5).
- Trocar/remover reação com resposta perdida: replay não vira toggle nem gera segundo aviso (tarefas2/5).
- Preferência muda após entregar: fonte e readAt ficam intactos; reativar recompõe contador dos não lidos (tarefas3/5).
- Painel com saldo negativo/devolução, participação encerrada e troca de papel: contagens e dados pertencem ao contexto correto (tarefas4/5).

## Arquivos e escritores

Todos os caminhos de código abaixo são relativos a `web/`. Contratos são
fixados pelo root antes dos despachos. Reutilizar padrões de acesso/transação,
transporte, Dialog e fixtures das etapas anteriores.

| Onda | Escritor | Arquivos exclusivos |
| --- | --- | --- |
| 0 | Root | `src/contracts/{notes,reactions,feed,dashboards}.ts`, extensão `notifications.ts`, plano/docs, harness/runtime da tarefa5 |
| 1 | Dados | `prisma/schema.prisma`, nova `prisma/migrations/20261023002000_relationship/migration.sql`, `scripts/check-migrations.mjs`, `scripts/check-relationship-migration*.mjs` |
| 1 | Relação | `src/server/notes/**`, `src/server/reactions/**`, `src/server/outbox/events.ts`, rotas de notas/reações da tarefa2 |
| 1 | UI | `src/components/{notes,reactions}/**`, integrações nos detalhes de registros/tickets e `tests/e2e/relationship/{notes,reactions,helpers}*` |
| 2 | Dados, após tarefa1 | `src/server/notifications/{groups,group-projection,preferences,queries}.ts`, `src/server/outbox/worker.ts`, rotas da tarefa3; divisão adicional em arquivos focados se necessário |
| 2 | Relação, após tarefa2 | `src/server/{feed,dashboards}/**`, `src/server/points/{service,balance}.ts`, rotas de mural/resumo/pessoa da tarefa4 |
| 2 | UI, após tarefa2 | `src/components/{feed,notifications,dashboards}/**`, `stores/store-{workspace,people}.tsx`, `navigation/store-navigation.tsx`, página `/notificacoes`, rotas visuais da tarefa4 e demais `tests/e2e/relationship/**` |
| 1–3 | Root | `tests/integration/relationship/**`, helpers de integração, scripts restantes/package/workflow, integração final de Minha conta; coordena qualquer troca de escritor |
| 3 | Revisores novos | Somente leitura de SQL/segurança e UI/qualidade, sem bancos/builds; root integra correções com o escritor responsável |

Equivalente nativo ao executor de subagentes indisponível como skill separada.
Nenhum implementador faz commit parcial; root faz um commit da etapa após
checagens e revisão, conforme autorização existente.

## Contratos exatos entre tarefas

Usar importações dos DTOs atuais para StoreView, PersonView, PointsBalance,
ActivityView, RewardView, TicketSummary, ConversationView e PageResult.
`Identity`, `StoreScope` e `StoreTransaction` são os existentes do servidor.

```ts
// contracts/notes.ts
type NoteVersion = { id:string; storeId:string; participantMembershipId:string;
  version:number; text:string; createdAt:string; author:{displayName:string|null} };
type NoteCurrent = { current:NoteVersion|null; writable:boolean };
type ParticipantNoteCurrent = NoteCurrent & { unread:boolean };
type NoteBody = { operationId:string; expectedVersion:number; text:string };
type NoteMutation = { applied:NoteVersion; current:NoteVersion; appliedVersion:number };
type NoteLookup = { operation:NoteMutation|null };
// contracts/reactions.ts
type ReactionEmoji = '❤️'|'👏'|'🥹'|'🔥'|'😂'|'🌷';
type ReactionState = { conversationId:string; version:number; mine:ReactionEmoji|null;
  writable:boolean; reactions:{emoji:ReactionEmoji; author:{id:string;displayName:string|null}}[] };
type ReactionBody = { operationId:string; expectedVersion:number; emoji:ReactionEmoji|null };
type ReactionMutation = { state:ReactionState; appliedVersion:number;
  event:{id:string;from:ReactionEmoji|null;to:ReactionEmoji|null;createdAt:string} };
// contracts/feed.ts
type FeedItem = { id:string; subjectType:'SUBMISSION'|'TICKET'; subjectId:string;
  storeId:string; participantMembershipId:string; participant:{displayName:string|null};
  name:string; status:Exclude<SubmissionStatus,'DRAFT'>|TicketStatus;
  occurredAt:string; path:string; conversationId:string;
  summary:string; publishedMediaCount:number;
  preview:{assetId:string;mediaType:'PHOTO'|'VIDEO'}|null; reactions:ReactionState };
type FeedPage = PageResult<FeedItem>;
// contracts/notifications.ts — conservar contratos individuais T05/T11
type NotificationCategory = 'NOTES'|'ACTIVITIES'|'REWARDS'|'SOCIAL';
type NotificationGroupView = { id:string; version:number; storeId:string; storeName:string|null;
  category:NotificationCategory; count:number; unreadCount:number; attentionActive:boolean;
  latest:NotificationView; firstOccurredAt:string; lastOccurredAt:string; lastDeliveredAt:string };
type NotificationGroupPage = PageResult<NotificationGroupView> & { attentionUnreadCount:number };
type NotificationPreferences = { storeId:string; version:number;
  socialMuted:boolean; automaticApprovalNotices:boolean };
type PreferencesBody = Pick<NotificationPreferences,'socialMuted'|'automaticApprovalNotices'> &
  { operationId:string; expectedVersion:number };
type PreferencesMutation = { preferences:NotificationPreferences; appliedVersion:number };
```

`PreferencesBody` não contém `storeId` ou `version`; o contexto vem da rota
autorizada. Não permitir que o cliente escolha destinatário/ator. `expectedVersion`
aceita zero apenas para projeção ainda inexistente. ReactionState.version é
somente a versão da reação do ator atual; mudar a outra pessoa não a substitui.
Noop de reação ainda registra intenção/versionamento, mas não cria aviso.

Dashboards em `contracts/dashboards.ts`:

- `DashboardEvent={id:string,kind:NotificationKind,occurredAt:string,path:string,author:{displayName:string|null},participant:{displayName:string|null}}`; não contém recibo de leitura nem texto de bilhete.
- `MerchantDashboard={store:StoreView,counts:{pendingSubmissions:number,outstandingTickets:number,activeParticipants:number},checklist:{key:'PRESENTATION'|'ACTIVITY'|'REWARD'|'INVITATION',done:boolean,path:string}[],pending:{id:string,name:string,participantName:string|null,status:'PENDING'|'CONTESTED',path:string}[],tickets:{id:string,name:string,participantName:string|null,status:TicketStatus,path:string}[],recent:DashboardEvent[]}`.
- `ParticipantDashboard={store:StoreView,person:{displayName:string|null},merchant:{displayName:string|null},points:PointsBalance,activities:ActivityView[],rewards:RewardView[],categories:string[],note:ParticipantNoteCurrent,tickets:TicketSummary}`.
- `PersonDashboard={person:PersonView,points:PointsBalance,pendingSubmissions:number,outstandingTickets:number,recent:FeedItem[],note:NoteCurrent}`; sem qualquer leitura do destinatário.

Limitar `activities/rewards` do início a seis; `pending/tickets` a três e
`recent` a cinco. Links “ver todos” abrem listas paginadas existentes. Todas as
quantias de pontos permanecem string.

### Tarefa1: persistência e prova de evolução

**Files:** escritor Dados, conforme mapa. **Produces:** modelos abaixo e grants/guardas; root gera Prisma após schema pronto.

- `PersonalNote(id,storeId,participantMembershipId unique,version)`; `NoteVersion(id=operationUUID,noteId,storeId,participantMembershipId,version,text,actorProfileId,requestDigest,createdAt)`, unique(noteId,version); `NoteRead(noteVersionId,readerMembershipId,actorProfileId,readAt)`, unique(noteVersionId,readerMembershipId).
- `Reaction(id,storeId,conversationId,actorProfileId,version,emoji?)`, unique(conversationId,actorProfileId); `ReactionEvent(id=operationUUID,reactionId,storeId,conversationId,actorProfileId,version,fromEmoji?,toEmoji?,requestDigest,createdAt)`, unique(reactionId,version). Remoção conserva projeção com emoji null.
- `NotificationGroup(id,key unique,storeId,recipientMembershipId,actorProfileId,category,version,lastDeliveredAt)`; Notification acrescenta `groupId?`/`groupVersion?`, unique(groupId,groupVersion), sem trocar ID/eventId/readAt antigos.
- `NotificationPreference(membershipId PK,storeId,version,socialMuted=false,automaticApprovalNotices=true)` e `NotificationPreferenceEvent(id=operationUUID,membershipId,storeId,actorProfileId,version,requestDigest,socialMuted,automaticApprovalNotices,createdAt)`.
- NotificationKind acrescenta `NOTE_SENT`/`REACTION_CHANGED`; OutboxEvent acrescenta `noteVersionId?`/`reactionEventId?`, fontes mutuamente exclusivas, FKs compostas e destinatário derivado. Preservar `ALBUM_PUBLISHED` e `albumEventId` T11.

- [x] Acrescentar provas SQL `note_version_requires_projection_outbox`, `read_requires_exact_recipient`, `reaction_requires_event`, `group_cannot_mix_audience` e `preference_requires_audit`; cada uma tenta contexto/autor/versão trocados e espera erro23514/23503/23505, conforme a proteção aplicável.
- [x] Root executa `npm --prefix web run db:migrate:check` com provas novas e confirma falhas das invariantes ainda não implementadas, sem aceitar falha de conexão como reprodução.
- [x] Implementar migração aditiva uniformeLF antes da primeira aplicação, RLS/grants mínimos, checks explícitos contra NULL/Unicode inválido e guardas diferidas; projeção exige evento correspondente e bilhete enviado exige uma outbox para o participante, evento real de reação exige aviso só quando toEmoji não null e diferente.
- [x] Separar estágio T11 antes de T12 no verificador; snapshot T07–T11 conserva IDs, ledger, tickets, álbuns, mídias e avisos/readAt existentes. Backfill agrupa notificações antigas sem apagá-las ou torná-las lidas.
- [x] Root repete `db:migrate:check`: todas migrações/invariantes/preservação passam, grants não concedem UPDATE/DELETE de versões/eventos/NoteRead nem Data API pública.

### Tarefa2: bilhete e reação idempotentes

**Files:** escritor Relação e UI, mapa onda1. API sob `/api/lojas/:storeId`.

| Rota | Corpo/resultado | Função em `server/notes/service.ts` ou `server/reactions/service.ts` |
| --- | --- | --- |
| GET `/bilhete` | ParticipantNoteCurrent, somente próprio vínculo | `readOwnNote(identity,storeId)` |
| GET `/participacoes/:membershipId/bilhete` | NoteCurrent sem recibo, lojista | `readParticipantNote(identity,storeId,membershipId)` |
| PATCH mesma | NoteBody → NoteMutation | `sendNote(identity,storeId,membershipId,body)` |
| GET mesma`/operacoes/:operationId` | NoteLookup, só ator da intenção | `lookupNoteOperation(identity,storeId,membershipId,operationId)` |
| GET `/bilhetes/versoes/:versionId` | NoteVersion da audiência atual | `readNoteVersion(identity,storeId,versionId)` |
| POST mesma`/lida` | `{}` → `{versionId,readAt}`; só destinatário | `markNoteVersionRead(identity,storeId,versionId)` |
| GET `/conversas/:conversationId/reacao` | ReactionState | `readReactions(identity,storeId,conversationId)` |
| PUT mesma | ReactionBody → ReactionMutation | `changeReaction(identity,storeId,conversationId,body)` |
| GET mesma`/operacoes/:operationId` | `{operation:ReactionMutation|null}` | `lookupReactionOperation(identity,storeId,conversationId,operationId)` |

Assinaturas recebem Identity e strings, body Record<string,unknown>, retornam
Promise dos DTOs indicados. Outbox produz `enqueueNoteSent(tx,versionId)` e
`enqueueReactionChanged(tx,eventId)`, Promise<void>, keys `note.sent:{id}` e
`reaction.changed:{id}`. `NotificationTarget` acrescenta type`note`,subjectId
da versão e path`/lojas/:storeId?bilhete=:versionId`; jamais corpo do bilhete.
Views também exportam `noteCurrent(scope:StoreScope,membershipId:string):
Promise<NoteCurrent|ParticipantNoteCurrent>` e `reactionState(scope:StoreScope,
conversation:Conversation):Promise<ReactionState>` para composições da tarefa4,
com audiência revalidada e sem iniciar outra transação ou consumir limite de rota.

- [x] Root escreve `notes.test.mjs`/`reactions.test.mjs`: `read_v1_does_not_read_v2`, `merchant_never_sees_receipt`, `unicode_2000_2001`, `reaction_replay_after_replace_remove`, `social_actions_preserve_economy`; fixa contagens antes/depois, dois destinatários e outra loja.
- [ ] Root executa `npm --prefix web run test:integration:t12` para observar falha das rotas novas; log registra teste/asserção, sem credenciais.
- [x] Implementar serviços/validação/operação/views focados, transação/replay antes de validar versão antiga, fechamentos e autorização atual; reação recebe estado desejado, nunca toggle. NoteRead só confirma versão específica; não cria outbox.
- [x] UI cria editor/prévia/painel e coração/cartão, reação contextual reutilizada em registro/ticket. Limite Unicode, primeiro erro focado, UUID/corpo em memória, lookup antes de repetir, nova versão aberta só por ação explícita; 401/403/404 descarta privados e troca de contexto aborta respostas.
- [x] E2E `relationship/notes.spec.ts` e `reactions.spec.ts` cobrem envio/leitura concorrentes, seis emojis, remoção/noop, retry/reload/409/429/503, teclado/Escape/foco320/390/200%/movimento reduzido. Root verifica os testes HTTP e Chromium em série após integração das fontes.

### Tarefa3: grupos, preferências e central C04

**Files:** escritor Dados e UI, mapa onda2. Preservar rotas individuais T05.

- `projectNotificationGroup(tx:StoreTransaction,notificationId:string):Promise<void>` em `group-projection.ts`, chamado na mesma transação da entrega do worker; chave social usa destinatário+loja+ator+conversa+floor(occurredAt/300s), demais eventos usam ID da Notification. ALBUM_PUBLISHED nunca entra no grupo SOCIAL.
- `listNotificationGroups(identity,query?):Promise<NotificationGroupPage>`, `markNotificationGroupRead(identity,groupId,throughVersion):Promise<NotificationGroupView>`, `resolveNotificationGroupTarget(identity,groupId):Promise<NotificationTarget>` em `groups.ts`.
- `readNotificationPreferences(identity,storeId):Promise<NotificationPreferences>`, `updateNotificationPreferences(identity,storeId,body):Promise<PreferencesMutation>`, `lookupPreferenceOperation(identity,storeId,operationId):Promise<{operation:PreferencesMutation|null}>` em `preferences.ts`.
- Rotas GET `/api/notificacoes/grupos?storeId&category&page&pageSize`; POST `/:groupId/lida` com `{throughVersion}` e GET `/:groupId/destino`. Preferências GET/PATCH `/api/lojas/:storeId/preferencias/notificacoes` e GET mesma`/operacoes/:operationId`.
- Categorias NOTE_SENT→NOTES, submissão/análise→ACTIVITIES, ticket/álbum→REWARDS, comentário/reação→SOCIAL. INVITATION_ACCEPTED usa ACTIVITIES como acontecimento da relação; preservar nome específico do evento no card.

- [x] Root escreve `notifications.test.mjs` e `preferences.test.mjs`: interação grupo v1→leitura v1 enquanto v2 entrega deixa v2 não lida; fronteira300s, evento tardio, concorrência de consumidores, leitura individual/grupo, mute/unmute sem mudar readAt, automático separado de manual, publicação T11 indivisível e revogação/destino cruzado.
- [x] Implementar projeção com lock do grupo e versão por membro, preservando Notification única por evento. Leitura aceita versão observada<=atual e marca somente membros até ela; rejeita futuro. Preference defaults são virtuais versão0 até primeira escrita, com evento imutável/replay. `attentionUnreadCount` conta grupos não lidos com aviso ativo, não soma arquivos/eventos de um grupo.
- [x] UI entrega `/notificacoes`, filtros, leitura, sino e preferências em Minha conta/loja. Identificar silenciados, renderizar loja/papel antes de navegar para contexto resolvido. Ler aviso não lê bilhete. Destino sem audiência limpa a prévia e reconsulta a lista autorizada.
- [x] E2E `notifications.spec.ts`/`preferences.spec.ts` verificam versão observada, filtros, outra loja/papel, mute em outro dispositivo, falha de consulta/destino e resposta antiga após logout. Root roda suites HTTP/Chromium afetadas sem concorrência com builds/typegen.

### Tarefa4: mural, detalhe de pessoa e painéis

**Files:** escritor Relação em `server/feed/{service,queries,views}.ts`, `server/dashboards/{service,queries,views}.ts`; UI em diretórios do mapa.

**Produces:** `listFeed(identity,storeId,query?):Promise<FeedPage>`,
`readMerchantDashboard(identity,storeId):Promise<MerchantDashboard>`,
`readParticipantDashboard(identity,storeId):Promise<ParticipantDashboard>`,
`readPersonDashboard(identity,storeId,membershipId):Promise<PersonDashboard>`,
`listDashboardEvents(identity,storeId,query?):Promise<PageResult<DashboardEvent>>`.
Queries de feed exportam `feedPage(scope:StoreScope,query:URLSearchParams):
Promise<FeedPage>`; `server/points/balance.ts` extrai a consulta atual de
readPoints em `pointsBalance(scope:StoreScope,membershipId:string):Promise<PointsBalance>`,
reutilizada por readPoints e painéis sem mudar cálculos/filtros.

Rotas GET `/api/lojas/:storeId/mural`, `/resumo`, `/lojinha`,
`/participacoes/:membershipId/resumo`, `/resumo/acontecimentos`. Feed aceita
`type=SUBMISSION|TICKET`, `status` da união correspondente, `from/to` datas civis,
`participantMembershipId` apenas lojista e paginação. UI `/lojas/:storeId/mural`,
`/resumo`, `/pessoas/:membershipId`; home escolhe P01/L02 pelo papel real.

- [x] Root escreve `feed.test.mjs`/`dashboards.test.mjs`: vazio/em uso, filtros, duas pessoas, draft excluído, preview só publicado com retenção atual, saldo15→resgate10→anulação−15→cancelamento+10=0 sem ganho diário extra; tickets fechados pendentes entram no trabalho, participantes fechados não entram em ativos.
- [x] Implementar consultas autorizadas no servidor; feed um card/origem por receivedAt/createdAt desc+ID. Preview consulta origem real, AlbumItem/AlbumEventPUBLISH e removedAt/prazo/hold T11, nunca URL persistida ou mídia não publicada. Reutilizar views/helpers com StoreScope; não chamar serviço público que abre transação enquanto já mantém lock da loja. Reutilizar ReactionState/Conversation, sem segunda conversa.
- [x] Implementar checklist derivado de apresentação não vazia, atividade ativa, mimo não arquivado e convite/participação existente; PENDING/CONTESTED recebidos e três estados abertos de ticket definidos no desenho. Recentes usam eventos confirmados/entregues com audiência, não texto de bilhete/recibo.
- [x] UI substitui home parcial por P01/L02, adiciona detalhe da pessoa/mural; contexto e ações reais, contador/saldo compartilhados, erro não vira zero. Centralizar invalidação e consulta visível30s por conta/sessão/loja; focus/online/visibilidade retomam consulta, respostas sobrepostas/antigas são descartadas.
- [x] Ajustar navegação principal exatamente participante3/lojista4 do desenho, acessos auxiliares para extrato/convites/configurações e layout lateral desktop. E2E `feed.spec.ts`/`dashboards.spec.ts` cobre troca de papel/loja, isolamento, offline/retomada, contadores atualizados,320/390/200% e foco sem roubo por polling.

### Tarefa5: runtime, verificação, revisão e commit

**Files:** Root em `scripts/{local-runtime,prepare-local,prepare-media,media-environment,media-fixtures,media-local,prisma-local,outbox-local,integration,run-tests}.mjs`, `src/server/media-worker/config.ts`, package/workflow, `tests/integration/helpers/{environment,fixtures}.mjs`, `tests/integration/media/helpers.mjs`, `tests/integration/relationship/helpers.mjs`, suites `{notes,reactions,notifications,preferences,feed,dashboards,authorization,concurrency}.test.mjs` nessa pasta, novos docs e canônicos.

- [x] Preparar T12 como estágio posterior a T11 nas allowlists/regex, bancos `meumimo_t12`/`meumimo_t12_dev`/`meumimo_t12_shadow`, namespaces `t12-integration`/`t12-development`, estado ignorado `.artifacts/t12-runtime`; Next4310/mídia4311 em loopback. Reusar Auth e fixtures reais de álbum/crédito/resgate sem resetar bancos anteriores ou passar fixture/service-role ao Next.
- [x] Acrescentar comandos `local:prepare:t12`, `db:migrate:dev:t12`, `db:migrate:integration:t12`, `media:fixtures:t12`, `media:dev:t12`, `media:once:t12`, `media:purge:t12`, `outbox:dev:t12`, `outbox:once:t12`, `test:integration:t12` no padrão T11, incluindo todas as regressões anteriores. Cleanup respeita novas FKs; não deixar NoteRead/eventos órfãos nem alterar testes econômicos para aceitar regressão.
- [x] Completar autorização/CSRF/read120/write30, sessão suspensa/revogada, admin sem relação, IDs/períodos/paginação cruzados, reply perdido, corridas de versão/reads/groupdelivery e rollback em projeção/evento/outbox. Provar SQL+HTTP, não usar mocks Chromium como persistência.
- [x] Root executa checks, migrações, HTTP e Chromium em série; verifica todos os casos atuais sem skips e registra falhas/correções/repetições focais abaixo. Examina capturas de notas, central e dashboards em320/390/200% e comportamento de teclado/movimento reduzido, sem apresentar os grupos como uma execução única sem falhas.
- [x] Registrar snapshot e despachar duas revisões independentes somente leitura de SQL/privacidade e UI/qualidade; reproduzir achados, corrigir com escritor exclusivo e repetir somente checks afetados. Reler cada um dos cinco Review Focus com sua evidência das tarefas2–4.
- [x] Atualizar `docs/relationship-local.md`, `requisitos.md`, `arquitetura.md`, `design.md`, `AGENTS.md`, `docs/{onboarding,setup,quality}.md`, roadmap/fundação e este plano com comportamento implementado/evidências/limites. Diferenciar polling testado de Realtime/aparelho/CI não observados.
- [x] Fazer scan de segredos/links e diff, conferir migrações aplicadas intactas e preservar alterações locais preexistentes. Consolidar o conjunto verificado no commit `feat(relationship): implementa bilhetes reacoes novidades e paineis de T12`, identificado no histórico Git; continuar T13 conforme autorização vigente.

## Self-review e estado

Cobertura conferida contra o desenho confirmado: bilhetes/leitura/reações na
tarefa2; central/grupos/preferências na3; mural/pessoas/painéis/navegação na4;
persistência/retrocessos na1 e runtime/revisão/limites na5. Cada Review Focus
tem teste nomeado; funções/DTOs/rotas definidos acima, sem segunda fonte de
verdade econômica ou quebra dos avisos T11.

Plano preparado com writing-plans e auto-revisado, sem corpo de programa.
Execução iniciada em 23/10/2026 após o commit T11 `0bd7f35`. PostgreSQL local
foi preparado em bancos separados e a migração14 passou pela prova de evolução,
RLS37, grants e preservação antes de ser aplicada a desenvolvimento/integração.
Validação funcional e correções foram verificadas. A caixa de RED inicial HTTP
permanece aberta por não ter sido observada nessa ordem; a limitação está abaixo.
O commit desta etapa será identificado pelo histórico Git após a conferência final.

## Evidências da execução local

A prova SQL começou com as treze migrações anteriores passando e falhou pela
ausência de PersonalNote. Antes da primeira aplicação persistente, foram
corrigidos um CASE em PL/pgSQL e o acesso a campos de NEW de tabelas distintas.
A execução seguinte passou pelas quatorze migrações, preservação/backfill,
37 tabelas com RLS e privilégios efetivos. A migração T12 aplicada tem SHA256
`a285e093db6ffa762bf16f6be9677342176ab4611f84ff7caf5f128e2681cb3c`.
Os bytes das migrações anteriores, inclusive T09, foram preservados.

A integração HTTP executou 319 casos reais, sem skip: 317 passaram e dois
falharam por expectativas dos testes. O mural devolve caminho de interface,
sem `/api`, e um identificador inválido de recurso segue a política 404
existente. Corrigidas somente essas expectativas, os dois casos passaram
na repetição focal. São 319 casos distintos cobertos, incluindo 43 novos;
não houve uma execução integral 319/319 sem falhas. PostgreSQL, Auth, Storage,
Next e processo de mídia foram reais. As credenciais privilegiadas ficaram
fora do processo Next.

As revisões somente leitura de dados/privacidade e interface usaram snapshots
de arquivos. A revisão de dados não encontrou P1/P2. Os achados de interface
levaram a provas RED/GREEN de versão-base do rascunho, reabertura do coração,
retorno filtrado ao mural, seletor paginado, indicador da versão não lida,
foco da paginação, contexto após retomada e consultas de reações sem N+1.
Comentários passaram a acompanhar retomada e consulta de trinta segundos;
a revalidação de sessão devolve foco somente à mesma árvore autorizada.

A revisão final reproduziu perda do campo durante 503, ausência de retirada
do restante do mural no caminho de consulta direto após envio e chamadas à
API na prévia de conversa. As correções preservam dados confirmados durante
erro temporário, propagam 401/403/404 à fronteira privada e mantêm a prévia
inteiramente em memória. Os 32 casos focais da conversa antiga e dessas
correções passaram, seguidos pelos 112 casos novos da relação. Das regressões
anteriores, 256 passaram no primeiro grupo e 280 no segundo. Os 22 casos da
prévia falharam pelo acesso indevido à API e passaram após a correção. Quatro
expectativas antigas ainda procuravam os endpoints separados de saldo/vitrine
na home. Foram consolidadas no contrato `/lojinha`; os oito casos atuais de
navegação passaram, incluindo 200→503 com dados preservados e 403 retirando
toda a área. A suíte atual reúne 672 cenários distintos cobertos, sem skips,
por grupos e repetições focais; não houve execução única integral sem falhas.

Limite do método: a ordem inicial RED de rotas HTTP prevista na tarefa2 não
foi observada antes da implementação; sua caixa permanece aberta. As falhas
SQL e os RED/GREEN dos achados foram observados. Uma chamada inicial do
Playwright fora da configuração web falhou por URL inválida e não foi aceita
como RED. A cobertura Chromium usa respostas controladas para interface;
ela não substitui a integração real acima nem a validação física adiada.

Os sete testes do protótipo, nove testes web, lint/regras, tipos e build foram
verificados por `npm run check`. Após os últimos ajustes de interface,
`npm run web:check` repetiu lint, tipos, nove testes e build com sucesso.
As capturas de bilhete, mural, novidades e painel em 320/390 e texto 200%
foram inspecionadas; teclado, foco, Escape e movimento reduzido têm provas
Chromium. Os 54 arquivos de dados/servidor permaneceram iguais ao snapshot
da revisão. CI remoto, transporte Realtime, leitor de tela e aparelhos físicos
não foram observados; provedores/publicação permanecem adiados.
