# T13 Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** entregar A01–A04 com metadados autorizados, pausa da plataforma por loja, bloqueio de segurança da conta e auditoria atômica, sem acesso administrativo ao conteúdo das relações.

**Architecture:** consultas administrativas usam seleções explícitas e autorização própria; não reutilizam DTOs de participante nem relaxam `requireMembership`. Uma função SQL restrita aplica a mudança e sua auditoria na mesma transação, preservando o grant externo e a verificação AAL2 pelo Auth. A pausa da plataforma acrescenta uma causa independente de bloqueio de novas origens, conservando o tratamento das obrigações existentes.

**Tech Stack:** Next.js 16.4.2, React 19.3.1, TypeScript 6.0.3, Prisma 7.10.1, PostgreSQL 17.11, Supabase Auth/Storage locais, node:test e Playwright 1.64.1 existentes; Node 24 e npm.

**Spec:** [desenho T13 confirmado](../specs/2026-10-22-t13-administracao-design.md). Alcance, limites, método Toolkit, execução após T12 e commit foram autorizados pelo idealizador. Esta preparação não executa a implementação nem pede nova aprovação do plano.

## Global Constraints

- **Pré-condição:** T12 concluída, revisada, verificada e consolidada antes de executar qualquer tarefa deste plano. Registrar seu estado real; aprovação do desenho não significa implementação concluída.
- “Não acrescenta serviço, dependência ou credencial administrativa ao Next.” Preservar cliente, versões, modelo e permissões; Prisma permanece responsável pelas migrações.
- “Bloquear acesso por segurança” usa `Profile.suspendedAt`; bloqueia todas as respostas privadas da própria conta, inclusive leitura, mídia, notificações, replay e administração. Não criar pausa operacional de conta.
- `Store.platformPausedAt` independe de `Store.state`; retomar uma causa não remove a outra. CLOSED, participação encerrada e revogação nunca são desfeitos por ação administrativa.
- Pausa da plataforma bloqueia criar/aceitar convite, novo registro/resgate e upload para nova evidência; análise/complemento, tickets, conversa, bilhete e álbum existentes conservam seus contratos de origem.
- Motivo obrigatório: “texto simples de 1–500 caracteres Unicode após normalização; rejeitar espaços e Unicode inválido”. Busca até 80 Unicode; UUID válido é comparado exatamente.
- “Página padrão 20, máximo 50; ordenação estável, total e filtros explícitos.” Preservar os limites de página existentes quando mais restritivos.
- “Leitura 120/minuto e mutação 10/minuto por conta”; replay consome limite. Visão geral usa sete dias UTC identificados, sem produtividade de participantes.
- Não bloquear a própria conta administrativa nem conta com grant ativo pela interface/API de T13. Provisionamento/revogação de grants e operações excepcionais permanecem no procedimento separado do operador.
- Não incluir saldo, movimentos, legenda, foto/vídeo, assinatura/endereço de mídia, bilhete, recadinho, comentário, reação, motivo de análise, combinado, código de ticket ou destino privado em DTO administrativo.
- Diagnóstico aceita apenas código de operação/rota, resultado, status, duração e correlação aleatória. Motivo fica na auditoria administrativa; não entra em log técnico, URL ou persistência do navegador.
- D08 conservadora, sem expurgo automático; T14 define marco da auditoria/logs e exclusão antes do piloto. T13 não promete suporte, prazo, e-mail, push, Realtime, publicação, restauração ou aparelhos físicos comprovados.
- Um escritor por arquivo; root serializa Git, banco, serviços, generate/typegen, builds e testes com recursos compartilhados. Revisores somente leitura; JS/TS até 350 linhas por arquivo; preservar os sete testes do protótipo.

## Review Focus

- Grant revogado, conta bloqueada ou sessão em recuperação entre autenticação e commit: negar sem mudança nem auditoria de sucesso, inclusive no lookup/replay (tarefas 1/2/5).
- Loja PAUSED pelo lojista e pela plataforma, seguida de duas retomadas concorrentes: cada ação altera apenas sua causa/revisão; CLOSED permanece CLOSED (tarefas 1/3/5).
- Rascunho/URL/parte de mídia criado antes da pausa: bloquear nova origem e sua continuação; complemento CONTESTED, álbum e GET/Range autorizados conservam as exceções de origem (tarefas 3/5).
- Busca ou motivo com aspas, emoji, Unicode inválido e marcador privado, seguidos de falha SQL: rejeitar conforme limite e nunca registrar valores/SQL/headers; responder 503 genérico para erro desconhecido (tarefas 2/5).
- Resposta antiga de administrador chega depois de trocar a conta, perder grant ou trocar alvo: descartar dados, motivo e confirmação; UUID de operação não recupera ato de outro autor (tarefas 2/4/5).

## Fronteiras de arquivos e ondas

Caminhos desta tabela são relativos a `web/`, exceto documentos e workflow.
Nomes futuros são decisões deste plano; root reconcilia chamadores com o contrato final de T12 antes do despacho, sem reescrever funcionalidades aprovadas.

| Onda | Tarefa / escritor | Arquivos exclusivos e resultado |
| --- | --- | --- |
| 0 | Root | Registrar baseline T12; fixar `src/contracts/admin.ts`, acréscimos em `src/contracts/{stores,activities,rewards}.ts` e contratos abaixo; conferir scripts e ordem da nova migração |
| 1 | Tarefa 1 / Dados | `prisma/schema.prisma`; nova `prisma/migrations/20261023003000_platform_administration/migration.sql`; `scripts/check-admin-migration.mjs`, `scripts/check-admin-migration-helpers.mjs`; integração em `scripts/check-migrations.mjs` |
| 2, após 1 | Tarefa 2 / Administração | `src/server/admin/{access,validation,limits,queries,views,commands,service,http}.ts`; `src/server/audit/diagnostics.ts`; `src/server/authorization/admin.ts`; novas rotas `src/app/api/admin/**`, preservando sessão existente |
| 2, após 1 | Tarefa 3 / Fronteira operacional | `src/server/stores/{transaction,views}.ts`; `src/server/invitations/{service,preview}.ts`; `src/server/{submissions,activities,rewards}/views.ts` e `src/server/submissions/service.ts`, `src/server/redemptions/service.ts`; `src/server/media/access.ts`; ajustes de guardas de T11/T12 só se um chamador ainda testar ACTIVE diretamente |
| 2, após contratos | Tarefa 4 / UI | `src/app/admin/**`; `src/components/admin/**`; `src/app/conta/account-panel.tsx`; `src/components/stores/{store-workspace,store-invitations}.tsx`; componentes de atividades/mimos que calcularem permissão a partir de StoreView; `tests/e2e/admin/**` e fixtures DTO e2e afetados |
| 3, após 2 | Tarefa 5 / Root | Runtime/scripts/package/workflow; fixtures compartilhadas e `tests/integration/admin/**`; `tests/admin-diagnostics.test.mjs`; documentos canônicos e `docs/admin-local.md`; executar todos os checks em série |
| 4 | Tarefa 6 / Revisores e root | Revisão independente somente leitura de segurança/dados e UI/qualidade; root corrige, verifica achados e faz commit do conjunto autorizado |

Onda 2 têm arquivos disjuntos; implementadores editam e relatam, sem iniciar processos nem executar checks compartilhados. Se T12 tiver movido um arquivo listado, root registra o novo caminho e mantém um único escritor. `src/server/auth/{session,sessions}.ts` e `src/server/authorization/store.ts` são fontes preservadas; nenhum bypass administrativo entra nelas.

Colaboração nativa é o equivalente descoberto do método Toolkit; as referências a executores superpowers no cabeçalho não autorizam instalar ferramentas ausentes. Cada entrega informa arquivos, interfaces e pendências; root revisa antes da onda dependente. Recursos sem isolamento explícito ficam serializados.

## Contratos fixados na onda 0

### Persistência e comando SQL

- `Profile.securityVersion Int default 0`; `Store.platformPausedAt DateTime? @db.Timestamptz(6)` e `Store.platformVersion Int default 0`. Não reutilizar revisão da loja, catálogo, bilhete ou análise. Registros anteriores conservam estado, inclusive contas já suspensas; não fabricar auditorias retroativas.
- `AdminAction`: `id UUID @id` = operação; `actorProfileId UUID`; `targetProfileId UUID?`; `targetStoreId UUID?`; `kind String`; `expectedVersion Int`; `version Int`; `reason String`; `requestDigest String`; `previousRestrictedAt timestamptz?`; `restrictedAt timestamptz?`; `createdAt timestamptz`. FKs Restrict, XOR de alvo, kind compatível (`BLOCK_ACCOUNT|UNBLOCK_ACCOUNT|PAUSE_STORE|RESUME_STORE`), `version=expectedVersion+1`, versões não negativas e motivo validado também no SQL. Unicidades `(targetProfileId,version)` e `(targetStoreId,version)`; índices alvo/data/id e ator/data/id.
- Runtime recebe SELECT de AdminAction sob RLS, sem INSERT/UPDATE/DELETE e sem UPDATE dos três novos campos ou de `Profile.suspendedAt`. `anon`/`authenticated` não recebem schema/tabela/função. Não alterar grants já usados por perfil/catálogo/loja.
- Criar papel SQL `meumimo_admin_executor`, NOLOGIN, sem superuser/bypass de RLS, sem CREATE no schema e sem associação ao runtime. Somente ele possui as funções e os direitos mínimos de SELECT em Profile/AuthSession/AdminGrant/Store, INSERT/SELECT em AdminAction e UPDATE das colunas administrativas. Para locks de linha, recebe também UPDATE somente de AuthSession.id e AdminGrant.profileId, com triggers que negam efetivamente UPDATE pelo executor nessas duas tabelas. Esses direitos não passam ao runtime. Políticas RLS explícitas permitem os locks; nenhum acesso a ledger, tickets ou conteúdo, nem alteração efetiva de sessão/grant pelo executor.
- Função `app.apply_admin_action(p_actor uuid,p_session uuid,p_operation uuid,p_target_kind text,p_target_id uuid,p_kind text,p_expected_version integer,p_reason text,p_digest text) RETURNS uuid`: argumentos de ator/sessão vêm somente de Identity verificada no servidor. SQL valida formatos/combinações/motivo, sessão atual sem recuperação/revogação, perfil não suspenso e grant ativo, com locks; aplica projeção e auditoria juntas. O UUID retornado identifica a linha aplicada.
- `SECURITY DEFINER`, SQL estático, objetos qualificados e `SET search_path = pg_catalog, app, pg_temp`, com app não gravável pelo runtime. Criar/revogar EXECUTE de PUBLIC e conceder somente a `meumimo_runtime` na mesma migração transacional. Runtime não pode `SET ROLE meumimo_admin_executor` nem substituir a função. Inspecionar privilégios efetivos, não apenas o texto da migração.
- MFA não é argumento da função. `requireIdentity` obtém AAL2 de claims verificados pelo Auth e `requireAdminAccess` o confere antes da transação; a função revalida sessão/grant/perfil no banco. Não alegar que um booleano, GUC ou UUID valida criptograficamente AAL2 no SQL. Nenhum endpoint aceita ator, sessão, assuranceLevel ou grant no corpo.
- Comandos usam READ COMMITTED: após obter o lock do alvo, devem enxergar um grant recém-inserido antes de esse lock ser liberado. RepeatableRead conservaria um snapshot anterior ao INSERT, pois a FK não atualiza a linha de Profile. `apply_admin_action` rejeita outro isolamento com M1300. Consultas continuam RepeatableRead para manter COUNT e página no mesmo snapshot.
- `app.lock_admin_access(p_actor uuid,p_session uuid) RETURNS void` é função auxiliar SECURITY DEFINER do mesmo executor, estática e com o mesmo search_path/revogação/grant. Bloqueia e revalida perfil→sessão→grant, sem devolver metadados ou executar UPDATE. `apply_admin_action` a reutiliza e `withAdminTransaction` a chama; runtime não recebe UPDATE de AdminGrant para obter o lock. Provar que o executor consegue os locks e que seus UPDATE diretos em sessão/grant falham.
- SQLSTATE constantes: M1300 entrada inválida (400), M1301 sessão inválida (401), M1303 autorização/proteção do alvo (403), M1304 alvo inexistente (404), M1309 conflito/revisão/replay incompatível (409). Mensagens SQL são constantes sem valores; 40001/40P01 continuam erros de repetição, não conflitos de domínio.
- A função compara digest e todos os campos imutáveis de uma operação existente antes de devolver replay. Não aceita mudar ator, alvo, kind, versão esperada ou motivo sob a mesma UUID. Mudança de estado, incremento e INSERT da auditoria pertencem ao mesmo comando; falha de qualquer parte reverte tudo. Histórico não se mistura com SecurityAudit/StoreAudit ou eventos financeiros.

Ordem: Profile do ator SHARE → AuthSession SHARE → AdminGrant do ator SHARE → alvo (Profile ou Store) UPDATE → grant do alvo, se conta → lock de UUID de operação. Reutilizar a ordem perfil/sessão→loja do domínio existente; nenhuma chamada externa acontece dentro dos locks. Não adquirir locks de Store em uma ação de conta. Lock UPDATE do perfil-alvo serializa com o FK do provisionamento de grant; verificar grant ativo novamente sob esse lock. Alvo igual ao ator e alvo com grant ativo negam BLOCK_ACCOUNT no servidor/SQL, além do botão.

Depois da autorização/locks: procurar replay → proteger alvo contra nova suspensão própria/com grant ativo → conferir revisão → rejeitar intenção nova cujo estado já é o desejado → conferir overflow de Int → registrar estado anterior/posterior com relógio do banco → atualizar coluna restrita e revisão → confirmar. A proteção do alvo aplica-se à mudança nova: replay autorizado recupera o ato passado sem reaplicar suspensão, inclusive se depois o alvo ganhou grant. 409 exige nova leitura/revisão; não cria auditoria de mudança fictícia. Replay de ação anterior devolve sua versão aplicada e o estado atual, sem desfazer ações posteriores. Operador privilegiado continua separado da API e das credenciais runtime; não criar flag de fixture/ambiente que relaxe essas regras.

### Tipos em `src/contracts/admin.ts`

```ts
type AdminTargetKind = 'ACCOUNT' | 'STORE';
type AdminActionKind = 'BLOCK_ACCOUNT' | 'UNBLOCK_ACCOUNT' | 'PAUSE_STORE' | 'RESUME_STORE';
type AdminTargetRef = { type: AdminTargetKind; id: string };
type AdminCounts = { open: number; closed: number; revoked: number };
type AdminAccountView = { id: string; displayName: string | null; createdAt: string;
  suspendedAt: string | null; version: number; createdStores: number;
  participations: AdminCounts; canBlock: boolean };
type AdminStoreView = { id: string; name: string | null; createdAt: string;
  owner: { id: string; displayName: string | null }; state: StoreState;
  platformPausedAt: string | null; version: number; participants: AdminCounts };
type AdminStoreDetail = AdminStoreView & { timezone: string };
type AdminRelationView = { id: string; storeId: string; storeName: string | null;
  role: StoreRole; closedAt: string | null; accessRevokedAt: string | null };
type AdminActionBody = { operationId: string; target: AdminTargetRef;
  action: AdminActionKind; expectedVersion: number; reason: string };
type AdminActionView = { id: string; target: AdminTargetRef; action: AdminActionKind;
  actor: { id: string; displayName: string | null }; reason: string; createdAt: string;
  version: number; previousRestrictedAt: string | null; restrictedAt: string | null };
type AdminActionResult = { operation: AdminActionView;
  current: AdminAccountView | AdminStoreDetail; appliedVersion: number };
type AdminActionLookup = { operation: AdminActionResult | null };
type AdminOverview = { accounts: { active: number; blocked: number };
  stores: { active: number; paused: number; closed: number; platformPaused: number };
  recent: { accountsCreated: number; storesCreated: number; actions: number };
  window: { from: string; to: string; timezone: 'UTC' } };
type AdminListQuery = { page?: number; pageSize?: number; q?: string;
  id?: string; security?: 'ACTIVE' | 'BLOCKED'; state?: StoreState;
  platformPaused?: boolean };
```

Exportar tipos e importar `StoreState`, `StoreRole`, `PageResult` de stores. Consulta de contas admite apenas security; lojas apenas state/platformPaused. `id` é UUID exata; `q` normalizado busca nome/nome do responsável sem interpolar SQL. UUID em q usa comparação exata por ID, não substring. Consulta de auditoria recebe `{target:AdminTargetRef,page?,pageSize?,action?:AdminActionKind}`; consulta de vínculos `{page?,pageSize?}`. Rejeitar chaves desconhecidas e combinação de filtro incompatível.

Contagens de vínculo são disjuntas: revoked se accessRevokedAt existe, senão closed se closedAt existe, senão open. Considerar somente PARTICIPANT em participants/participations; lojas criadas vêm de Store.createdByProfileId. Ordenar por createdAt DESC/id DESC; relações por criação/id, auditoria por createdAt/id. COUNT e página usam o mesmo filtro/snapshot, sem carregar todas as linhas. Dados de Auth não entram na consulta. Janela é `[agoraDB−7dias,agoraDB)` em UTC, com os dois instantes no DTO; contagens de contas são de Profile, não total do provedor.

`StoreView` normal ganha apenas `platformPausedAt:string|null`; não inclui motivo, histórico, grant ou versão administrativa. Permissões existentes de atividade/vitrine/resgate refletem a nova causa com erro `store_platform_paused`,409. Convite público reutiliza status PAUSED sem motivo; não expor diagnóstico administrativo ao portador do token.
`ActivityAvailability.reason` e `RewardAvailability.reason` acrescentam
`STORE_PLATFORM_PAUSED`. Preservar os outros valores; CLOSED/revogação têm
precedência. Com ambas as pausas, o contexto mostra ambas e a guarda de nova
origem devolve store_platform_paused. `allowPaused=true` conserva as exceções.

### API e interfaces de serviço

Base `/api/admin`; todas as respostas `private,no-store`, sem SSR de conteúdo antes de autorizar. Manter GET `/session` e seu retorno `{actorUserId,assuranceLevel:'aal2'}`.

| Rota | Entrada / resposta | Função de `src/server/admin/service.ts` |
| --- | --- | --- |
| GET `/resumo` | AdminOverview | `readAdminOverview(identity):Promise<AdminOverview>` |
| POST `/contas/consulta` | AdminListQuery → PageResult<AdminAccountView> | `searchAdminAccounts(identity,body)` |
| GET `/contas/:profileId` | AdminAccountView | `readAdminAccount(identity,profileId)` |
| POST `/contas/:profileId/vinculos/consulta` | paginação → PageResult<AdminRelationView> | `readAdminRelations(identity,profileId,body)` |
| POST `/lojas/consulta` | AdminListQuery → PageResult<AdminStoreView> | `searchAdminStores(identity,body)` |
| GET `/lojas/:storeId` | AdminStoreDetail | `readAdminStore(identity,storeId)` |
| POST `/historico/consulta` | alvo/filtros → PageResult<AdminActionView> | `readAdminHistory(identity,body)` |
| POST `/acoes` | AdminActionBody → AdminActionResult | `applyAdminAction(identity,body)` |
| GET `/operacoes/:operationId` | AdminActionLookup | `lookupAdminAction(identity,operationId)` |

`identity:Identity`, IDs:string, corpos:`Record<string,unknown>`; demais retornos são Promise dos tipos da tabela. Consultas POST são leituras sem efeitos, cobram 120/minuto e validam Origin/JSON. Evitam colocar termos pessoais de busca em URLs/logs de acesso. Criar exatamente as pastas correspondentes sob `src/app/api/admin/`, cada `route.ts` só valida transporte, obtém Identity e chama serviço. Mutações cobram 10/minuto, inclusive replay; lookup é leitura. Preservar 400/401/403/404/409/415/429 com Retry-After e 503 genérico; consulta sem entidade não revela conteúdo de outra origem.

- `withAdminTransaction<T>(identity:Identity,operation:(tx:StoreTransaction)=>Promise<T>):Promise<T>` em access.ts: verifica requireAdminAccess, depois inicia transação RepeatableRead com maxWait 5.000 ms/timeout 10.000 ms, assertIdentityInTransaction e lock_admin_access para grant bloqueado/revalidado, com AAL2 da Identity. COUNT/página/resumo compartilham o snapshot. Até duas repetições para 40001/40P01/P2034, refazendo autorização; falha de domínio não recebe retry. Não aninhar withIdentityTransaction.
- `withAdminCommandTransaction` tem os mesmos argumentos, autorização/locks e política de repetição, mas usa ReadCommitted. `applyAdminAction` usa essa variante; funções de consulta e lookup usam withAdminTransaction. Não executar o comando dentro da transação de consulta.
- `consumeAdminLimit(identity:Identity,kind:'read'|'write'):Promise<void>` em limits.ts: bucket HMAC por conta/kind no domínio `meumimo:t13:admin-rate:v1`, relógioDB/janela 60 s, lock da chave; não registrar a chave ou motivo. Autorização antes do limite; consumo fora da transação mutável evita devolver a cota no rollback.
- `parseAdminAction(body:Record<string,unknown>):AdminActionBody` em validation.ts: UUIDs canônicas, enum compatível com alvo, versão inteira 0..2147483646, reason.trim().normalize('NFC'), contagem por pontos de código 1..500, rejeitar surrogates isolados e controles proibidos; SQL repete os invariantes que recebe.
- `commandAdminAction(tx:StoreTransaction,identity:Identity,input:AdminActionBody):Promise<string>` em commands.ts: calcula SHA256 do corpo normalizado com ator e chama função parametrizada via tagged template; sem `$queryRawUnsafe`. Digest não substitui comparação dos campos no SQL.
- `AdminRouteCode` em http.ts é a união `SESSION|OVERVIEW|ACCOUNT_SEARCH|ACCOUNT_DETAIL|ACCOUNT_RELATIONS|STORE_SEARCH|STORE_DETAIL|ACTION_HISTORY|ACTION_APPLY|ACTION_LOOKUP`; `AdminResultCode` é `OK|INVALID_INPUT|UNAUTHENTICATED|FORBIDDEN|NOT_FOUND|CONFLICT|RATE_LIMITED|UNAVAILABLE`. Mapear status/códigos conhecidos para essa lista; nunca usar mensagem de erro como result.
- `handleAdminRoute(route:AdminRouteCode,operation:()=>Promise<Response>):Promise<Response>` em http.ts: envolve handleRoute sem mudar contrato global, mede duração e emite somente `DiagnosticEvent`. RouteCode é enum constante, nunca pathname/request.url.
- `emitDiagnostic(event:{route:AdminRouteCode;result:AdminResultCode;status:number;durationMs:number;correlationId:string}):void` em audit/diagnostics.ts: constrói objeto por allowlist. Não recebe Error, Request, corpo ou contexto de usuário. Provedor/logger externo não entra em T13; preservar audit/events.ts separado.

## Tarefa 1: persistência, função restrita e evolução verificável

**Files:** onda 1. **Depends-on:** baseline T12/onda 0. **Recursos:** só root usa Prisma/banco dev/shadow e banco descartável de prova.
**Interfaces:** consome Profile/Store/AuthSession/AdminGrant existentes; produz campos, AdminAction e apply_admin_action descritos acima para tarefas 2/3.

- [x] Escrever `checkAdminMigration(database,runtime,context):Promise<void>` em scripts/check-admin-migration.mjs e helpers de operações. Provas: dados T12 anteriores mantidos; revisões 0; pausa legada preservada; UPDATE protegido e INSERT/UPDATE/DELETE AdminAction negados ao runtime; EXECUTE negado a anon/authenticated; runtime não é membro do executor e não consegue substituir função/search_path.
- [x] Incluir `action_requires_audit`, `invalid_or_revoked_session_denied`, `revoked_grant_denied`, `self_and_active_admin_block_denied` e `same_uuid_cannot_change_target_reason_actor`. Forçar falha de INSERT da auditoria e provar coluna/revisão inalteradas; reaplicar UUID retorna uma linha; revisão antiga e overflow não alteram nada.

```js
await assert.rejects(runtime.query('UPDATE app."Profile" SET "suspendedAt"=now() WHERE id=$1', [targetId]), { code: '42501' });
assert.equal(after.securityVersion, before.securityVersion);
assert.equal(after.suspendedAt, before.suspendedAt); // após falha forçada da auditoria
assert.equal(actionsForOperation.length, 1); // após replay concorrente
```

- [x] Root executar `npm --prefix web run db:migrate:check` para observar ausência da evolução T13, depois criar schema/migração e função com os grants mínimos. Preservar todas as migrações aplicadas; confirmar que o timestamp reservado vem depois da migração final de T12 antes de gerá-lo.
- [x] Root executar o mesmo check após a evolução. Exigir exit 0, prova em banco vazio e evolução preservando dados, privilégios efetivos/RLS e falhas atômicas previstas; não usar quantidade fixa antiga de tabelas como evidência suficiente. Gerar cliente Prisma em série para liberar tarefas 2/3.

## Tarefa 2: consultas administrativas, ação e diagnóstico sanitizado

**Files:** onda 2 Administração, incluindo cada rota da tabela. **Depends-on:**1 e contratos. **Recursos:** nenhum compartilhado no implementador; root executa testes na tarefa 5.
**Interfaces:** consome Identity verificada/função SQL; produz serviços, DTOs e transporte da tabela, sem novos poderes no domínio privado.

- [x] Escrever casos HTTP em `tests/integration/admin/{authorization,queries,actions,recovery,diagnostics,limits}.test.mjs` (root é o escritor de testes; entregar os cenários antes do código). Fixar assertions: grant sem AAL2 e AAL2 sem grant→403; sem sessão→401; sem grant nos próprios requests de lista/detalhe/histórico/lookup, nunca só na sessão inicial.
- [x] Implementar access/validation/limits, consultas com select explícito e comando/rotas. Motivo com 500 pontos de código aceita; 501 rejeita. Não redefinir nome de pessoa. Rejeitar extras `actorId`, `sessionId`, `aal2`, `grant`, alvo/action incompatíveis, UUID inválida, versão fracionária, Unicode inválido e busca com 81 pontos de código. Reusar nomes/limites canônicos dos perfis, sem alterar seus contratos.
- [x] Em queries/views, produzir A01–A04 e paginação com snapshot consistente. Em detalhe de conta, listar apenas vínculos administrativos; detalhe de loja não abre pessoa, conquistas ou tickets. Verificar listas com mais de 50 resultados, totais/filtros e ausência recursiva dos campos privados proibidos; não expor digest e sessão na auditoria pública administrativa.
- [x] Implementar recuperação: lookup só encontra operações do próprio ator atualmente autorizado; UUID de outro ator retorna null sem conteúdo. Replay recupera operação aplicada e alvo atual, inclusive após ação posterior;409 não cria nova versão. Nunca devolver motivo de uma operação no erro de validação/conflito.
- [x] Implementar handleAdminRoute/emitDiagnostic e `tests/admin-diagnostics.test.mjs` com um objeto contendo chaves extras/erro malicioso: saída precisa conter somente os cinco campos permitidos, sem serializar Error/Request. Forçar falha SQL HTTP com marcador privado em busca/motivo e conferir logs capturados, resposta503 genérica e rollback.
- [x] Root executar testes de diagnóstico pelo runner nativo e cenários HTTP da tarefa 5. Primeiro observar falha pelos contratos ainda ausentes; depois exigir sucesso sem skips. Não afirmar que DTO seguro comprova logs sanitizados: conferir ambas as saídas.

```js
assert.equal(withGrantAtAal1.status, 403);
assert.equal(withAal2WithoutGrant.status, 403);
assert.equal(afterRevocationLookup.status, 403);
assert.equal(JSON.stringify(adminResponse).includes(privateMarker), false);
assert.equal(capturedLogs.includes(privateMarker), false);
```

## Tarefa 3: aplicar pausa independente sem fechar obrigações

**Files:** onda 2 Fronteira operacional. **Depends-on:**1 e StoreView. **Recursos:** nenhum compartilhado no implementador.
**Interfaces:** consome Store.platformPausedAt, produz guardas/DTOs normais corretos; não usa API administrativa para consultar conteúdo de relação.

- [x] Root preparar `tests/integration/admin/platform-pause.test.mjs`: PAUSE_STORE impede convite novo, aceite novo, DRAFT/recebimento, reserva/parte/conclusão de evidência nova e resgate direto; replay de intenção já confirmada continua autorizado. Contas/lojas de terceiros permanecem isoladas. Observar falha antes de mudar guardas.
- [x] Acrescentar platformPausedAt ao storeView e a assertStoreWritable quando `allowPaused=false`. `allowPaused=true` conserva preparação de cadastros/análise/complemento; não bloquear esses caminhos por engano. Aceite de convite verifica nova causa sob lock antes de criar vínculo; participante já vinculado abre a loja sem novo aceite. Preview devolve PAUSED sem motivo.
- [x] Inventariar testes diretos `state==='ACTIVE'` em submissions/activities/rewards/views, redemptions/service e media/access. Atualizar disponibilidade e guardas, preservando a precedência de CLOSED/revogação e o erro de plataforma409. DRAFT não ganha exceção por ter coleção/partes antigas; CONTESTED conserva complemento sob pausa normal ou da plataforma, com origem/autoria atuais.
- [x] Exercitar decisões de registros existentes, combinado/realizar/pedido/recusa/cancelamento, conversa/reação, envio de bilhete e álbum segundo os contratos T10–T12. A nova causa não fecha `commentsClosedAt`, não encerra uploads de MEMORY por si só, não inicia retenção nem toca ledger/outbox/tickets/estoque. CLOSED ou CANCELLED continuam impondo suas restrições próprias.
- [x] Provar corrida PAUSE_STORE contra convite/recebimento/resgate usando o mesmo lock Store: resultado serial válido, sem confirmar origem posterior à pausa. Retomar pelo lojista conserva platformPausedAt e platformVersion; RESUME_STORE conserva Store.state/pausedAt e CLOSED. Retomar conta conserva bloqueios de lojas. Root executa os casos afetados e exige snapshots financeiros/idênticos ao estado autorizado anterior.

## Tarefa 4: A01–A04 e estados privados da interface

**Files:** onda 2 UI. Criar `src/app/admin/{page,layout}.tsx`, `src/app/admin/contas/page.tsx`, `src/app/admin/contas/[profileId]/page.tsx`, `src/app/admin/lojas/page.tsx`, `src/app/admin/lojas/[storeId]/page.tsx`; `src/components/admin/{admin-area,admin-navigation,admin-overview,admin-accounts,admin-stores,admin-detail,admin-history,admin-action-dialog}.tsx`, `src/components/admin/{transport,use-admin-action}.ts` e `src/components/admin/admin.module.css`. **Depends-on:** contratos; integração HTTP após 2/3. **Recursos:** root único executor Playwright/build.
**Interfaces:** `AdminArea({children:(identityKey:string)=>ReactNode})` protege a árvore por userId/sessionId/AAL2; componentes consomem exclusivamente DTOs Admin. Transport aborta requests e descarta gerações antigas. use-admin-action usa UUID/motivo/revisão em memória e lookup antes de nova intenção.

- [x] Escrever `tests/e2e/admin/{access,queries,actions,privacy,a11y}.spec.ts` com respostas controladas, identificadas como provas de UI. Conservar as suítes HTTP como prova de Auth/SQL reais. Casos iniciais: grant+AAL1 orienta TOTP em `/conta` com retorno interno; sem grant nega; nada privilegiado renderiza durante conferência/revalidação.
- [x] Montar navegação própria “Visão geral · Contas · Lojas”, retorno à experiência normal e entrada em Conta baseada em verificação de acesso/mfa_required sem mostrar metadados. Não mudar cadastro, senha, fatores ou provisionamento; não oferecer impersonação nem recuperação MFA.
- [x] Implementar resumo com identificação de Profile/UTC, busca/filtros/paginação em memória, cards320/390 px e detalhe/auditoria. Motivo administrativo só aparece no detalhe/histórico autorizado, nunca no banner normal. Nome/UUID do alvo, ambas as causas da loja e efeito resultante aparecem na confirmação; bloquear autoproteção na interface e deixar servidor decidir novamente.
- [x] Diálogo usa os rótulos “Pausar novas ações da loja”, “Bloquear acesso por segurança” e “Reativar acesso”, conforme alvo/estado; motivo obrigatório, erro associado, preview do alcance e envio explícito. Em409, conservar rascunho da mesma sessão/alvo para revisão; timeout mostra resultado incerto e consultar operação. 500/503 nunca afirma sucesso nem repete comando com UUID nova automaticamente.
- [x] Invalidar todas as projeções do alvo após sucesso e atualizar StoreView/indicadores normais. Exibir “Novas ações pausadas pela plataforma”, suas ações bloqueadas e causas distintas, sem motivo/link de suporte fictício. Botões de nova origem acompanham permissão; análise/tickets existentes continuam alcançáveis.
- [x] Limpar árvore, formulários, busca/histórico e versões ao detectar 401/403, perda de grant, recuperação, suspensão ou troca de sessão/conta/alvo. Ocultar conteúdo enquanto revalida em navegação, foco, pageshow e evento de sessão; descartar respostas tardias. Revalidação ocorre por consulta autorizada, sem prometer detecção remota instantânea por canal inexistente. URL de recuperação guarda só UUID opaca de operação, sem motivo/busca/nome; não usar localStorage/sessionStorage.
- [x] Root executar `npm --prefix web run test:e2e -- tests/e2e/admin` após build. Exigir teclado/Tab/Shift+Tab, foco inicial e retorno ao acionador ou título estável, Escape, erro de campo, 320/390 px, texto 200%, movimento reduzido, lista vazia/busca sem resultado, loading/403/409/429/503 e troca de conta durante resposta. Conferir capturas de lista/diálogo/histórico e ausência de rolagem horizontal da página.

## Tarefa 5: runtime T13, provas reais e documentos de operação

**Files:** root; `web/{package.json,scripts/local-runtime.mjs,scripts/prepare-local.mjs,scripts/prepare-media.mjs,scripts/prisma-local.mjs,scripts/media-environment.mjs,scripts/media-local.mjs,scripts/media-fixtures.mjs,scripts/outbox-local.mjs,scripts/integration.mjs,scripts/run-tests.mjs}`; `web/src/server/media-worker/config.ts`; `web/tests/integration/helpers/{environment,fixtures}.mjs`; `web/tests/integration/admin/helpers.mjs`; `web/tests/integration/admin/{authorization,queries,actions,recovery,diagnostics,limits,platform-pause,security-block,concurrency}.test.mjs`; `web/tests/{admin-diagnostics,local-runtime}.test.mjs`; `.github/workflows/quality.yml`; documentos abaixo. **Depends-on:** 1–4. **Recursos:** stack meumimo-t02, bancos T13 próprios, Next 4310/mídia 4311 em loopback; tudo em série.
**Interfaces:** novo modo t13, não nova stack; suíte cumulativa T02–T13 sem mocks de Auth/PostgreSQL/Storage e sem worker concorrente com falhas determinísticas.

- [x] Acrescentar t13 às allowlists reais presentes após T12, sem apagar t11/t12 nem fazer prefixo por tamanho 3. Bancos `meumimo_t13`, `meumimo_t13_dev`, `meumimo_t13_shadow`; Storage `t13-integration`/`t13-development`; diretórios ignorados `.artifacts/t13-runtime`; preservar arquivo .env personalizado. Credenciais de fixture/migração/Auth admin ficam fora de Next; conferir whitelist/filtragem de env do processo e do gateway.
- [x] Criar scripts package `local:prepare:t13`, `db:migrate:create:t13`, `db:migrate:dev:t13`, `db:migrate:integration:t13`, `test:integration:t13` e modos mídia/outbox seguindo T12. Runner inclui todas as suítes precedentes e admin somente quando o domínio a suporta; diretório vazio/serviço ausente falha em vez de skip. Fixtures registram entidades/AdminAction e limpam só seus IDs, em ordem FK, por conexão privilegiada separada.
- [x] Criar/exportar `adminFixture(t)` em `tests/integration/admin/helpers.mjs` a partir do fixture existente: retorna o fixture acrescido de `admin` (conta logada com client HTTP), `target` (conta comum), `store` e `privateMarker` fictícios. Conta administrativa verificada, grant por conexão separada e enrollment/challenge/verify TOTP pelo Auth real. Nenhuma função de produção aceita `isAdmin`, header/fator falso ou credencial de fixture. Preservar regressão admin-mfa existente e teste de autocadastro/atualização de perfil sem promoção.
- [x] HTTP `queries`: povoar mais de 50 contas/lojas e vínculos abertos/closed/revoked com nomes distintos, validar busca UUID/nome/limites, filtros/totais e janelas UTC nas fronteiras. Popular também saldo/bilhetes/comentários/mídia com marcadores fictícios; DTO/log administrativo não pode conter conteúdo/endereço proibido. Admin sem vínculo continua 404 nas rotas normais de pontos/análise/ticket/álbum/conversa/bilhete; admin com vínculo usa apenas seu papel normal.
- [x] HTTP `actions/recovery/concurrency`: mesma UUID repetida/concorrente, UUID trocando corpo/autor/alvo, mesma revisão com duas ações opostas, ação nova já satisfeita, falha forçada da auditoria/projeção e resposta perdida. Observar exatamente uma ação por versão, efeito/appliedVersion versus current, lookup após revogação/grant/AAL1 e rollback total. Corrida de revogação/suspensão do ator contra comando e provisionamento de grant no alvo precisa de resultado serial autorizado.
- [x] HTTP `security-block`: bloquear conta participante/lojista nega sessão privada, relações, bilhete, central, operação e mídia já assinada/Range; outra pessoa da dupla conserva seu acesso. Reativar exige sessão ainda válida, não remove revogação/recuperação/TOTP/grant nem platformPausedAt; não altera pontos/tickets/estoque/vínculos. Alvo com grant ativo/self é 403 sem alteração; chamada SQL restrita também nega, mesmo com botão contornado.
- [x] HTTP `limits/diagnostics`: 121ª leitura/11ª mutação em 60 s→429 com espera, inclusive replay; cota separada por conta e read/write. Verificar controles Origin/JSON e sessão em todas as rotas. Capturar stdout/stderr de Next/gateway e logger com erros previsíveis/SQL desconhecido, marcadores de motivo/busca, tokens, cabeçalhos e nomes; exigir ausência dos valores e só campos permitidos nos eventos. Não imprimir o conteúdo capturado no relatório de falha; relatar apenas categoria/contagem.
- [x] Root executar a sequência abaixo, registrando comando, exit code, contagens e falhas efetivamente observados. Se uma correção surgir, reproduzir e repetir os checks afetados; não ampliar testes depois de sucesso sem nova alteração ou dúvida concreta.

```sh
npm --prefix web run local:prepare:t13
npm --prefix web run db:migrate:dev:t13
npm --prefix web run db:migrate:integration:t13
npm --prefix web run db:migrate:check
npm run check
npm --prefix web run test:integration:t13
npm --prefix web run test:e2e -- tests/e2e/admin
npm run web:test:e2e
git diff --check
```

Os scripts t13 acima são entregas desta tarefa, ainda inexistentes no momento do plano. `check` precisa confirmar os sete testes de domínio, lint/regras, testes web, typecheck e build. Integração exige HTTP/Auth/DB/mídia reais, preservação T12 e falhas atômicas; Chromium completo exige todos os casos presentes, sem skip. Antes da sequência, root verifica processos/portas reais e usa só os que iniciar; não matar servidores alheios nem resetar bancos. Serviços pagos, migração real publicada e deploy continuam fora do escopo.

- [x] Atualizar `requisitos.md`, `arquitetura.md`, `design.md`, `AGENTS.md`, `docs/{onboarding,identity-local,quality,setup}.md` (preservar a alteração local anterior de README.md) e criar `docs/admin-local.md` com o comportamento implementado, comandos, provisionamento externo preservado, separação das duas pausas, bloqueio sem leitura, contrato de log e pendências D08/D09. Não expor consultas privadas nem ensinar service role no Next; não prometer piloto/RPO/RTO/suporte. Anotar evidências reais neste plano e roadmap depois de verificadas, mantendo afirmações de implementação separadas do desenho aprovado.

## Tarefa 6: revisão independente, correções e entrega

**Files:** somente leitura nos revisores; root possui correções e documentos de evidência. **Depends-on:**5 verificada. **Recursos:** revisão sem banco/build; root serializa qualquer reprodução necessária.

- [x] Revisão de segurança/dados: diff e chamadores, função/owner/grants/search_path/RLS, revalidação Auth/grant, proteção do próprio admin, revisão/replay, pausa sobre upload/recebimento e ausência de conteúdo/log privado. Cada achado informa arquivo, cenário, consequência e evidência; não aceitar apenas impressão geral.
- [x] Revisão de UI/qualidade: DTO e fronteiras, guardas e respostas tardias, navegação própria/retorno, nomes das ações, foco/teclado, estados móveis/texto 200%, recuperação e cópias sem promessa de suporte. Revisores não editam, rodam migrações, usam credenciais ou comitam.
- [x] Root confirmar/corrigir os achados, executar regressões afetadas e registrar limitações. Scan local do diff/arquivos novos não pode versionar.env, credenciais, capturas/logs privados, backups ou relatórios sensíveis. Conferir `git diff --check` e todos os arquivos novos, pois untracked não aparecem no diff normal.
- [x] Root registrar HEAD atual, selecionar somente os arquivos T13 revisados e fazer commit autorizado `feat: add private platform administration`. Não incluir alterações locais alheias, instalar hook ou mudar proteção de branch. O commit fecha T13 local; não marca T14/T15 nem publicação como executadas.

## Reconciliação da onda 0 — 23/10/2026

T12 concluída no commit `81b0e13b5427cb1e26c91713edb2a3376bf380e0`, com
quatorze migrações e as verificações registradas no plano próprio. Execução
T13 iniciada na branch `codex/t13-administracao`. Contratos do plano foram
materializados pelo root; mídia também exige ajustar `media/registration.ts`
no escopo operacional, além de access.ts.

A [documentação PostgreSQL17](https://www.postgresql.org/docs/17/sql-select.html)
confirma que FOR SHARE exige UPDATE em alguma coluna. As funções/trigger e
permissões mínimas acima resolvem essa exigência sem tornar grant ou sessão
mutáveis pelo runtime/executor. Isso é uma reconciliação de implementação,
sem novo poder de produto ou aprovação pendente.

Context7 foi descoberto e consultado para Prisma, mas devolveu documentação
da branch main com texto de migração a partir de ORM7, sem confirmação exata
de 7.10.1. Os tipos gerados instalados expõem maxWait/timeout/isolationLevel;
preservar o padrão local e provar RepeatableRead no banco real. Next16.4.2 usa
os guias locais já lidos de Route Handlers/Server and Client Components.
Nenhuma versão ou dependência será alterada por essa limitação documental.

## Autorrevisão e evidência desta preparação

Autorrevisão documental: A01–A04 e metadados→tarefas 2/4/5; estados independentes→1/3/5; segurança de conta/grant/MFA→1/2/5; revisão/auditoria/replay→1/2/5; diagnóstico→2/5; acessibilidade/descarte→4/5; runtime/regressões/documentação→5; revisão/commit→6. Os cinco itens de Review Focus têm cenários nos responsáveis indicados. Tipos, nomes das funções e rotas foram conferidos entre contratos e tarefas.

Fontes locais lidas em 22/10/2026: AGENTS, requisitos/design/arquitetura, desenho T13 confirmado, docs de identidade/relação/qualidade, plano T11 e código atual de requireAdminAccess, AuthSession/Identity, transação/limites de loja, mídia/convite e fixtures de integração. T12 ainda é dependência futura: root reconcilia caminhos/contratos na onda 0; nenhum arquivo de T10–T12 foi alterado nesta preparação.

Context7 foi descoberto e consultado sem código/dados privados. A [documentação PostgreSQL 17 de SECURITY DEFINER](https://www.postgresql.org/docs/17/sql-createfunction.html) confirmou search_path seguro, REVOKE PUBLIC e grants na mesma transação. A consulta Prisma devolveu material rotulado v6 para `$transaction`/`$queryRaw`; não foi tomada como confirmação específica de 7.10.1. O plano usa o padrão já presente no código 7.10.1; root revalida a documentação oficial da versão antes de modificar a integração, sem alterar versão por suposição.

Verificação desta entrega limitada à leitura e conferência do próprio documento/diff. Nenhum código/schema, migração, serviço, build, teste ou commit foi executado. Todas as caixas de implementação permanecem abertas até a execução posterior a T12, sem nova etapa de aprovação do plano.

## Execução local em andamento — 23/10/2026

- Migração SQL15 passou no descartável com preservação e 38 tabelas RLS/grants
  (`.artifacts/t13-migrations-green-4.log`) e foi aplicada a desenvolvimento e
  integração T13. SHA256 congelada:
  `661d8edf6aadf86e794e1b53de1509c17fb32756ffd7780678146d4fafd3ea15`.
  Correções posteriores de SQL exigem migração aditiva.
- Revisão independente SQL encontrou dois P2: INSERT Store poderia informar
  estado administrativo e provisionamento de grant podia usar snapshot anterior
  a bloqueio concorrente. Defaults de Store foram protegidos antes da aplicação;
  procedimento externo e fixture passaram a bloquear Profile antes do INSERT em
  comandos separados sob RC. Revisor conferiu as correções sem novo P1/P2.
- API e UI foram congeladas para revisão no manifest ignorado
  `.artifacts/t13-runtime/review-api-ui.json`, base T12 `81b0e13`. Revisão API
  somente leitura conferiu 26 arquivos centrais e chamadores, sem P1/P2 nesse
  recorte. Guardas normais ainda não integram esse veredito.
- `npm run check`: primeira execução falhou no adaptador de log e import não
  usado. Corrigida a configuração de lint somente para console.info do próprio
  adaptador sanitizado, removido import. Segunda execução passou com sete
  testes de domínio, onze testes web, lint/regras, typecheck e build. Essa
  execução precede o ajuste de schema e as correções de UI abaixo.
- Primeiro teste operacional não chegou ao RED pretendido: login503. Debug com
  Prisma e conexão restrita reproduziu PG42501 no upsert Profile: @default(0)
  fazia o cliente informar securityVersion protegida. Schema passou a usar
  @default(dbgenerated("0")), sem alterar SQL/grants. Generate e reprodução
  confirmaram INSERT somente id/createdAt e upsert válido. A referência oficial
  Prisma v7 foi consultada pelo escritor; Context7 continuou sem resposta exata.
- Chromium administrativo inicial: 52 passaram e oito falharam, em 60 casos.
  Falhas observadas em motivo/409/429 e no teste de rascunho sob pausa. Revisão
  independente de 41 hashes de UI identificou ainda ausência de timeout de
  recuperação e associação acessível do erro. Correções e provas estão em curso;
  T13 não está concluída nem commitada.

### Integração e correções verificadas

- RED operacional válido: adminPAUSE confirmou e convite novo ainda retornou
  201, esperado409. Guardas foram implementadas em sete arquivos e os doze
  casos reais passaram, incluindo upload DRAFT, complemento CONTESTED sob
  ambas as pausas, transições de tickets, álbum/Range e corridas com origens.
- API administrativa: 25/25 casos reais passaram. A suíte cumulativa posterior
  executou 356 testes:355 passaram e um falhou por expectativa antiga do DTO
  StoreView, sem platformPausedAt. Atualizada somente a expectativa, os quatro
  casos de authorization.test.mjs passaram. São356 casos distintos cobertos,
  sem skips, por execução completa e repetição focal; não é alegação de uma
  execução integral356/356 sem falhas.
- Chromium administrativo:52/60 passaram inicialmente. A label implícita com
  textarea controlada deixou de ser localizada de forma exata depois de erros;
  label explícita/id preservou o campo e o motivo. Rascunho pausado agora usa
  readOnly do uploader, mantendo consulta e retirando controles de nova mídia.
  Dois P2 da revisão (timeout e descrição do erro) foram reproduzidos antes da
  correção. Após correções,64/64 cenários passaram nas duas larguras.
- Timeout20s usa controlador interno combinado ao sinal de desmontagem. Ao
  expirar, mantém UUID/corpo e oferece lookup, sem nova intenção automática.
  Motivo vazio recebe aria-invalid, foco e explicação associada. Revisor de UI
  conferiu os cinco hashes desses deltas sem novo achado.
- Revisão operacional independente conferiu os sete hashes e chamadores, sem
  P1/P2. Repetição de parte DRAFT depois da pausa mantém409, como na pausa do
  lojista; replays de operações confirmadas de origem foram preservados.
- Revisão do runtime conferiu17 arquivos. Identificou duplicação de uma chave
  package com valor idêntico; o root removeu somente a repetição e confirmou
  que existe uma chave única e válida. Sem outro defeito funcional confirmado.
- web:check posterior às correções e guardas passou: lint, typecheck, onze
  testes web e build. A base já passou com os sete testes de domínio no check
  completo. A regressão completa Chromium está em execução.
- Auditoria local conferiu732 arquivos sem segredos locais/chaves privadas e
  167 links locais resolvidos. As14 migrações anteriores conservam os bytes do
  manifest T12 e index=HEAD; SQL15 mantém checksum aplicado.

Limites do processo: o diagnóstico unitário foi escrito após o helper; não foi
observado RED específico desses dois testes. O RED HTTP inicial foi a ausência
real da nova rota de resumo. README.md contém alteração local anterior e será
preservado fora do commit; a entrada T13 está nos demais índices canônicos.
Builds, Git, bancos, serviços e testes foram executados somente pelo root,
com recursos compartilhados em série. Revisores não executaram esses recursos.

### Fechamento de T13

Estado local concluído após as correções e conferências registradas acima.
A regressão completa Chromium passou com 736/736, sem falhas ou skips
(`.artifacts/t13-browser-full-1.log`). Capturas de lista, diálogo e histórico
em 320/390 px foram inspecionadas com texto a 200%; teclado/foco e movimento
reduzido foram conferidos. O diálogo conserva rolagem interna em texto ampliado.

SQL15 permanece imutável, assim como as 14 migrações anteriores. O root faz
o commit somente dos arquivos T13, preservando README.md e os documentos
T14–T15 ainda não executados. Não houve push, publicação, serviço pago,
configuração global, hook, validação física ou execução de CI remoto.
