# Convites por código — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Execução:** T1–T7 concluídos e verificados, incluindo recuperação com dois ingressos reais. Aplicação local ligada e health ready.

**Goal:** acrescentar convites reutilizáveis por código gerado, validade/cota
configuráveis, busca e aceite explícito no Visor segmentado aprovado.

**Architecture:** evoluir Invitation e separar InvitationUse. Gestão e aceite
reaproveitam as transações de loja; código e link identificam a mesma política.
A busca combina somente lojas autorizadas com prévia mínima por código exato.

**Tech Stack:** Node 24.12+, Next 16.4.2, React 19.3.1, TypeScript 6.0.3,
Prisma 7.10.1, PostgreSQL, Supabase Auth e node:test/Playwright existentes.

**Spec:** [desenho aprovado](../specs/2026-10-23-convites-por-codigo-design.md).

**Autorização:** inicialmente somente planejamento; em seguida o idealizador
pediu implementar todas as fases depois de finalizar o plano. Execução local,
sem publicação, contratação, mensagens externas ou alterações em produção.
As subskills de execução citadas no cabeçalho não estão descobertas neste
cliente; usar o equivalente nativo já registrado em `docs/setup.md`: integrador,
escritores com arquivos exclusivos, revisão somente leitura e checks reais.
Não instalar skills ou dependências como consequência desta referência.

## Global Constraints

- O sistema gera o código curto; o lojista não escolhe seu texto.
- Cada convite tem seu código. Uma lojinha pode ter vários convites independentes.
- A confirmação da pessoa é o aceite; não se acrescenta uma fila de aprovação posterior pelo lojista.
- Padrão: sete dias/uma nova participação; opções sem vencimento e usos ilimitados independentes.
- Dez símbolos `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, exibidos em dois grupos de cinco.
- Não criar dez inputs nem usar `type=number`. A barra de busca continua sendo uma busca.
- Não enviar o código por query string nem guardar o conteúdo em `localStorage`.
- Criar migração aditiva; não editar SQL já aplicado.
- Convite não reativa participação encerrada nem contorna retirada de acesso.
- Preservar os sete testes de domínio, Prisma, Auth, credenciais restritas e alterações locais alheias.
- Next/build/typegen/integração/mídia são serializados; todas as portas ficam em loopback.
- Nenhum serviço ou pacote novo é necessário.

## Review Focus

1. Código também pode ser nome: preservar pesquisa de nomes autorizados, Unicode, filtros e paginação (T4/T6).
2. Resposta tardia, troca de sessão e confirmação após expiração: descartar contexto antigo e revalidar na transação (T4/T6).
3. Mesma conta em dois códigos e várias contas na última vaga: um vínculo/consumo por ingresso, sem ultrapassar cota (T4).
4. Horário civil inexistente/duplicado e cliente em outro fuso: resolução explícita no fuso da loja, nunca ajuste silencioso (T1/T3/T5).
5. Recuperação troca a chave HMAC: revogar códigos apenas na cópia, conservar usos/vínculos e exigir novo convite (T7).

## Mapa dos arquivos e interfaces

Os caminhos desta seção são relativos à raiz; mudanças finais preservam
responsabilidades e o limite de 350 linhas dos módulos JS/TS.

| Fronteira | Criar | Adaptar |
| --- | --- | --- |
| Contratos e formato compartilhado | `web/src/contracts/invitations.ts`, `web/src/lib/invitation-code.ts` | DTO legado em `contracts/stores.ts` permanece compatível |
| Política e credenciais | `web/src/server/invitations/{code,validation,policy,limits,expiration}.ts` | `token.ts`, `preview.ts`, `service.ts` |
| Gestão e ingresso | `web/src/server/invitations/{management,acceptance,resolve}.ts`, `web/src/server/stores/search.ts` | transações/autorização existentes, sem reescrever o domínio |
| Banco e notificações | `web/prisma/migrations/20261023010000_invitation_codes/migration.sql`, `web/scripts/check-invitation-codes-migration.mjs` | schema, verificador de migrações, outbox e notificações |
| APIs | `api/lojas/buscar/route.ts`, `api/convites/aceitar-codigo/route.ts`, `api/lojas/[storeId]/convites/[invitationId]/credencial/route.ts`, `api/lojas/[storeId]/convites/prazo/route.ts` sob `web/src/app/` | rotas de convites existentes |
| Gestão visual | `web/src/components/stores/{invitation-code-display,invitation-policy-form,invitation-code-card}.tsx`, `invitation-codes.module.css` | `store-invitations.tsx`, transporte `store-api.ts` |
| Busca e confirmação | `web/src/components/stores/{use-store-search,invitation-join-dialog}.tsx` | `stores-hub.tsx`, `invitation-screen.tsx`, mocks E2E |
| Direitos/recuperação | teste HTTP de direitos de convites e prova de recuperação | exportação, restore, fixtures e documentação canônica |

Contratos públicos novos (sem importar Prisma no cliente):

```ts
type ExpirationInput = { kind: 'AFTER_DAYS'; days: 7 } | { kind: 'NEVER' } |
  { kind: 'AT'; at: string }; // ISO com offset explícito, precisão de minuto
type CodeInvitationInput = { operationId: string; kind: 'CODE'; expiration: ExpirationInput; maxUses: number | null };
type CodeInvitationStatus = 'PENDING' | 'EXPIRED' | 'REVOKED' | 'EXHAUSTED' | 'PAUSED' | 'CLOSED';
type CodeInvitationView = { id: string; kind: 'CODE'; expiresAt: string | null;
  revokedAt: string | null; maxUses: number | null; useCount: number; status: CodeInvitationStatus };
type InvitationCredential = { id: string; code: string; url: string };
type CodeInvitationCreated = CodeInvitationView & InvitationCredential;
type CodeInvitationPreview = { status: CodeInvitationStatus;
  store: { id: string; name: string | null; presentation: string };
  inviter: { displayName: string | null } };
type ResolvedCodeInvitation = CodeInvitationPreview & {
  viewerAction: 'JOIN' | 'OPEN' | 'MANAGE' | 'HISTORY' | 'UNAVAILABLE' };
type StoreSearchInput = { q: string; role?: 'MERCHANT' | 'PARTICIPANT';
  state?: 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'ALL'; page?: number;
  pageSize?: number; resolveInvitation?: boolean };
type StoreSearchResult = { stores: PageResult<StoreView>; invitation: ResolvedCodeInvitation | null };
type ExpirationCandidate = { at: string; offset: string };
```

`InvitationView`, `InvitationPreview` e `InvitationResult` legados conservam seus
campos/erros. `POST` de geração com somente `operationId` continua criando link
legado; a interface nova envia explicitamente `kind: CODE`. A listagem retorna
união de InvitationView/CodeInvitationView; somente o novo membro tem `kind`.
Não acrescentar metadados a objetos legados cujo contrato exato já é testado.
Prévia de um link CODE pode acrescentar EXHAUSTED; manter os demais retornos
legados, sem contagens ou código na apresentação pública.

## Dependências e responsáveis

```text
T1 → T2 → T3 → T4 ─┐
          └→ T5 ───┴→ T6 → T7
```

Integrador: T1/T2, schema/migração, outbox, fixtures/direitos/restore e checks.
Backend: T3/T4, somente `server/invitations`, `server/stores/search.ts`, novas
rotas e testes HTTP de códigos. Interface lojista: T5 e seus componentes/testes.
Interface participante: T6, busca/diálogo e seus testes. `store-api.ts` pertence
ao escritor T5; o restante usa a assinatura acordada. Revisão final independente
é somente leitura. Não executar build enquanto outros escritores alteram fontes.

### T1 — Fixar contratos, formato e regras puras

**Arquivos:** contratos/lib acima; `server/invitations/{code,validation,policy}.ts`;
`web/tests/invitation-codes.test.ts` novo.

**Consome:** Identity, InvitationView e StoreView existentes.
**Produz:** tipos acima; `normalizeInvitationCode(value: string): string | null`,
`displayInvitationCode(normalized: string): string`,
`deriveInvitationCode(id: string, storeId: string, actorId: string, nonce: number): string`,
`invitationCodeHash(normalized: string): string`; validação e estado centralizados.

- [x] Escrever teste de normalização: `7kq9m-4tx2p`/espaços externos/compacto →
  `7KQ9M4TX2P`; `0`, `1`, `I`, `O`, prefixos, hífen fora da posição e controles → null.
- [x] Rodar `node --test tests/invitation-codes.test.ts` em `web/`; confirmar falha relevante.
- [x] Implementar formato puro compartilhado e HMAC server-only. Domínios
  `meumimo:invitation-code:v1` e `meumimo:invitation-code-lookup:v1`, contexto
  separado por NUL com id/loja/criador/nonce; primeiros 50 bits codificados em
  dez símbolos, sem módulo enviesado. Hash de consulta HMAC-SHA256 hexadecimal.
- [x] Fixar validação: `maxUses` null ou inteiro 1..1.000.000; desconhecidos,
  decimal, booleano e zero falham; duração padrão calculada somente na criação,
  após conferir repetição; digest inclui política solicitada normalizada.
- [x] Rodar o teste puro e `npm run web:test`; zero falhas.

### T2 — Evoluir dados e preservar o aceite legado

**Arquivos:** schema/migração/verificador novos; `web/scripts/check-migrations.mjs`,
`web/src/server/invitations/service.ts`, `web/tests/integration/helpers/fixtures.mjs`.
**Consome:** T1 e `withStoreTransaction`, `databaseNow` existentes.
**Produz:** modelo e invariantes abaixo, sem quebrar os endpoints legados.

- [x] Escrever prova SQL de evolução com convites pendente/aceito/revogado e
  outbox anterior. Verificar hashes, datas, vínculos e eventos preservados;
  `InvitationUse` contém exatamente um registro por aceite antigo.
- Prova inicial prevista, não executada isoladamente: Rodar `npm --prefix web run db:migrate:check`; falha deve apontar o modelo ausente.
- [x] Acrescentar `Invitation.kind` String default LEGACY_LINK (CHECK),
  `codeHash` nullable unique, `codeNonce` nullable, `creationDigest` nullable,
  `maxUses` nullable default 1, `useCount` default 0 e expiresAt anulável.
  CODE exige nonce 0..4/hash/digest e campos singulares de aceite nulos;
  LEGACY_LINK exige prazo, maxUses=1 e ausência de credencial curta.
- [x] Criar `InvitationUse(id UUID, invitationId, storeId, profileId,
  membershipId UNIQUE, createdAt)`, FKs compostas loja/convite e
  loja/vínculo/perfil, índices por convite/data/id; backfill com id=invitationId,
  sem novos avisos. Preservar colunas singulares para legado.
- [x] Adicionar `OutboxEvent.invitationUseId` opcional, FK e unicidade; evento
  CODE exige uso e consistência de loja/perfil/vínculo. Eventos legados podem
  continuar com referência nula e chave antiga. RLS e grants mínimos; impedir
  UPDATE/DELETE de usos no runtime. Guardas diferidas conferem contador versus
  usos e cota ao commit; não conceder alteração da política ou codeHash.
- [x] Adaptar aceite legado para gravar uso e contador na mesma transação;
  continuar usando produtor/chave legados. Ajustar limpeza administrativa das
  fixtures: apagar usos e convite na mesma transação após remover outbox.
- [x] Fechar intervalo das ilustrações em `<20261023010000`, acrescentar fase
  exclusiva dos códigos e snapshots anteriores; não fixar contagem de migrações.
- [x] Gerar SQL pelo diff Prisma, revisar complementos e executar db:generate,
  db:migrate:check e suíte focal legada. Não alterar migrações aplicadas.

### T3 — Gerar, revelar e revogar códigos com política configurável

**Arquivos:** `server/invitations/{management,expiration,limits}.ts`, fachada
`service.ts`, rotas de gestão/prazo/credencial; testes HTTP novos em
`web/tests/integration/stores/code-management.test.mjs` e `code-expiration.test.mjs`.
**Consome:** T1/T2. **Produz:** `createCodeInvitation(identity, storeId, body)` →
CodeInvitationCreated; `readInvitationCredential(identity,storeId,id)` →
InvitationCredential; `expirationCandidates(identity,storeId,localDateTime)` →
`{ timezone: string; candidates: ExpirationCandidate[] }`.

- [x] Escrever HTTP: dois códigos diferentes; repetição recupera mesmos
  id/code/url/prazo; política diferente com mesmo operationId → 409;
  participante/outra loja → 404; ilimitado/sem data combinados funcionam.
- Prova inicial prevista, não executada isoladamente: Executar os dois arquivos via driver focal T14; confirmar falhas relevantes.
- [x] Sob advisory lock da operação, tentar nonce 0..4 com insert
  `createMany(skipDuplicates:true)` e conferir registro por id. Colisão tenta
  outro nonce sem abortar a transação PostgreSQL; cinco colisões → 503 sem
  convite parcial. Repetição compara loja/criador/digest antes de recalcular prazo.
- [x] Implementar revelação autorizada no endpoint GET de credencial, com
  no-store e limite de leitura. Reconstituir pelo nonce e conferir digest;
  nunca retornar credencial em listagem, erro, auditoria ou evento.
- [x] Implementar prazo com PostgreSQL no fuso da loja, seguindo a estratégia
  de candidatos/offsets em `activities/periods.ts`; datas civis inválidas têm
  zero candidatos, ambíguas têm duas opções. Endpoint de pré-validação não
  cria convite; AT aceita somente ISO com offset consistente com a loja.
  Rejeitar passado no relógio do banco; igualdade ao vencimento já expirou.
- [x] Revogar CODE mesmo após usos e durante pausa; preservar vínculos/usos.
  Legado mantém o erro invitation_accepted já contratado.
- [x] Rodar HTTP focal, incluindo DST Havana, datas inválidas e criação
  recuperada depois do prazo. Conferir que nenhuma resposta vaza segredo alheio.

### T4 — Aceitar código/link, notificar cada ingresso e compor a busca

**Arquivos:** `server/invitations/{acceptance,resolve,limits}.ts`, fachada/preview,
`server/stores/search.ts`, APIs novas, outbox/notificações; testes
`code-acceptance.test.mjs`, `code-concurrency.test.mjs`, `code-search.test.mjs`,
`code-security.test.mjs` em `web/tests/integration/stores/`.
**Consome:** T1–T3. **Produz:** `acceptInvitationCode(identity,code)` →
InvitationResult; `resolveCodeInvitation(identity,code)` → ResolvedCodeInvitation|null;
`searchStores(identity,body)` → StoreSearchResult;
`enqueueInvitationUseAccepted(tx,useId): Promise<void>`.

- [x] Escrever HTTP: 6 contas/últimas 2 vagas → exatamente 2 novos usos;
  mesma conta/dois códigos → um vínculo/uso/evento; repetição, dono e membro
  existente → zero usos adicionais. Falha de outbox desfaz todos os efeitos.
- Prova inicial prevista, não executada isoladamente: Rodar os arquivos focais antes do código; confirmar falhas pelo contrato ausente.
- [x] Resolver hash sem revelar lista; revalidar identidade e acesso dentro da
  transação. Reutilizar ordem de locks perfil/sessão→loja→vínculo/convite.
  Criar uso/contador/vínculo/auditoria/outbox atomicamente. Novos usos têm
  chave `invitation.use.accepted:<useId>`; eventos antigos não são reescritos.
- [x] Reutilizar aceite comum no token longo de CODE; para legado conservar
  DTO/erros e produtor antigo. Prévia pública de CODE mantém supressão por
  autoria, inclui EXHAUSTED e nunca códigos/contadores/perfis alheios.
- [x] Implementar orçamento atômico de 10/minuto/conta compartilhado entre
  resolução curta e aceite curto, inclusive código inválido; aceite mantém
  limite 30/minuto. 429 devolve Retry-After. Consultas de nomes que não tentam
  código usam somente leitura 120/minuto. Não confiar em IP enviado pelo cliente.
- [x] Implementar busca POST validando q Unicode80, page20/max50, papel/estado;
  reaproveitar listStores. `resolveInvitation:false` permite paginação/filtro
  sem repetir resolução ou reabrir modal. Formato válido não oculta nomes
  iguais ao código; filtros da lista não impedem resolução do convite.
- [x] Rodar os quatro HTTP focais e notificações existentes. Testar expiração,
  revogação/pausas concorrentes, bloqueios/supressão, isolamento e conta encerrada.

### T5 — Configuração do lojista e Visor segmentado compartilhado

**Arquivos:** componentes de gestão/CSS novos, `store-invitations.tsx`,
`store-api.ts`; E2E `web/tests/e2e/stores/invitation-codes-management.spec.ts`.
**Consome:** T1/T3. **Produz:** `InvitationCodeDisplay({code:string})`;
`InvitationPolicyForm({store:StoreView,onCreated:(value:CodeInvitationCreated)=>void})`;
transporte compatível com quinto argumento `options?: {notifyChange?:boolean}`.

- [x] Escrever E2E de geração/recuperação, configuração finita/ilimitada,
  prazo sem data/ambíguo/inexistente, revelação e revogação após usos.
- [x] Rodar E2E focal no build anterior; confirmar falha por UI ausente.
- [x] Exibir dez casas em dois grupos de cinco, código selecionável e rótulo
  acessível único. Configuração antes de gerar; política depois é somente
  leitura. Preservar cartões legados e paginação. Copiar/compartilhar com
  fallback e foco; conexão incerta conserva operationId e corpo original.
- [x] No transporte, manter comportamento padrão e permitir notifyChange=false
  para busca/pré-validação por POST. Preservar Retry-After em StoreRequestError
  para apresentar espera. Testar que leitura não emite relationship-changed.
- [x] Rodar E2E 320/390 + desktop explícito, 200% e movimento reduzido. Verificar
  campo único, teclado, erro associado, colagem e ausência de rotação simulada.

### T6 — Busca e confirmação do participante

**Arquivos:** `stores-hub.tsx`, `use-store-search.tsx`, `invitation-join-dialog.tsx`,
`invitation-screen.tsx`; mocks/helpers E2E e novos
`invitation-codes-join.spec.ts`, `invitation-codes-races.spec.ts`.
**Consome:** T4/T5. **Produz:** busca POST e confirmação explícita, sem ingresso
automático; destinos de navegação e papéis permanecem os existentes.

- [x] Escrever E2E: buscar não aceita, cancelar não aceita, confirmação aceita
  uma vez; nome igual ao código continua na lista; nunca há código na URL.
- Prova inicial prevista, não executada isoladamente: Rodar E2E focal antes da mudança e confirmar falha relevante.
- [x] Implementar hook identificado por sessão, pedido e filtros; abortar
  respostas antigas, ocultar durante revalidação e limpar ao perder acesso.
  Enter/Buscar resolve código; paginação/filtro não reabre convite recusado.
- [x] Abrir Dialog existente com conta, apresentação, visor e ações aprovadas.
  Vínculo existente oferece abrir/gerenciar/consultar; bloqueio não reabre.
  Conexão incerta consulta vínculo antes de repetir. Sucesso invalida o contexto
  e navega à loja correta. Reaproveitar apresentação na tela de link CODE.
- [x] Atualizar mocks comuns para POST de busca, mantendo GET e contratos legados;
  não substituir a prova HTTP real por mocks de autorização.
- [x] Rodar os novos E2E e regressões stores/relationship. Testar foco/Tab/
  Shift+Tab/Escape, busca tardia, troca de conta, expiração com modal aberto,
  teclado móvel/200% e desktop sem duplicar controles.

### T7 — Direitos, recuperação, regressões e documentação

**Arquivos:** `scripts/pilot/rights-export-data.mjs`, `restore-state.mjs`,
`recovery-fixture-{source,evidence,verify}.mjs`; teste novo
`web/tests/integration/pilot/invitation-rights.test.mjs`; documentos canônicos.
**Consome:** T1–T6. **Produz:** entrega local íntegra, com evidência e limitações.

- [x] Escrever teste real: exportação do lojista contém usos autorizados; a
  da pessoa contém só seu ingresso, sem demais aceitantes/codeHash/code/url.
  Supressão por autoria continua funcionando, sem apagar histórico financeiro.
- Prova inicial prevista, não executada isoladamente: Rodar o arquivo focal T14; confirmar falha relevante antes da projeção nova.
- [x] Exportar explicitamente metadados e InvitationUse por audiência, sem
  segredo nem contagem global a participante. Incluir nova tabela nas provas
  de recuperação. Após verificar fingerprints restaurados e antes de servir
  cópia com authRate novo, revogar CODE ainda ativos somente na cópia; conservar
  usos/vínculos e não alterar dados da origem. Revelar código com digest
  incompatível devolve estado orientando gerar outro, sem trocar silenciosamente.
- [x] Atualizar `requisitos.md` D03/RF04, `arquitetura.md`, `design.md` §16.2,
  `docs/stores-local.md`, `docs/quality.md`, setup e recuperação com o comportamento
  efetivamente verificado; preservar alterações desktop concorrentes.
- [x] Executar, em série, `npm run check`, db:migrate:check, integração T14
  completa, E2E afetados e ensaio de restore autorizado. Não marcar resultados
  sem saída fresca; falha exige reprodução/correção e repetição afetada.
- [x] Revisão independente somente leitura dos arquivos finais; tratar achados
  antes de concluir. Não publicar, fazer push, instalar hooks ou executar
  limpeza destrutiva de cópia sem UUID de posse e autorização correspondente.

## Comandos e ambiente da execução

Reutilizar domínio T14 reservado; não criar outra família de recursos. Dev,
shadow e integração já são separados: meumimo_t14_dev/meumimo_t14_shadow/
meumimo_t14; mídia t14-development/t14-integration. Nenhuma credencial no Next
além do runtime. Ensaios nunca reutilizam servidor já iniciado.

Após conferir processos e parar a web local pelo supervisor, na raiz:

```sh
npm --prefix web run local:stop
npm --prefix web run local:prepare:t14
npm --prefix web run db:migrate:dev:t14
npm --prefix web run db:migrate:integration:t14
npm --prefix web run db:generate
npm run check
npm --prefix web run db:migrate:check
npm --prefix web run test:integration:t14
npm run web:test:e2e -- tests/e2e/stores tests/e2e/relationship
npm --prefix web run local:restore:check
```

Integração focal, dentro de web: `node scripts/integration.mjs t14
tests/integration/stores/code-management.test.mjs` (até oito arquivos por chamada).
O driver exige build atualizado e migração aplicada. E2E focal dentro de web:
`npm run test:e2e -- tests/e2e/stores/invitation-codes-management.spec.ts`.
Regenerar/buildar apenas quando fontes novas justificarem, sempre em série.

Commits são checkpoints possíveis depois de gates, com seleção explícita dos
arquivos deste plano; não incluir trabalho alheio nem fazer commit/push apenas
para cumprir a receita. O estado do plano será atualizado com evidências reais.

## Autorrevisão e limites iniciais

Cobertura: configuração/formato T1/T3/T5; legado/migração T2; concorrência,
notificação, abuso e busca T4; experiência e respostas antigas T5/T6; direitos,
restauração e documentação T7. As cinco classes de Review Focus têm provas nas
tarefas indicadas. Interfaces são compartilhadas por tipos únicos, não por
cópias entre agentes. Leituras locais e Context7 foram consultados; Context7
misturou v6/v7, então os tipos instalados e os guias Next shipped prevalecem.
Nenhum teste de implementação havia sido executado ao escrever este plano.

## Evidências da execução local

O plano foi finalizado antes da divisão dos escritores. O integrador manteve
schema/SQL/outbox/direitos/restore; três agentes escreveram backend, gestão e
participante em arquivos exclusivos. Um revisor novo, sem histórico herdado,
examinou somente leitura os arquivos explícitos, sem intervalo Git inventado.
Todos os ajustes de produto ocorreram antes do check completo registrado abaixo.

| Prova | Resultado observado |
| --- | --- |
| Baseline do protótipo | 7/7, antes da implementação |
| Schema/cliente Prisma | validate e generate passaram, versão 7.10.1 |
| Migração | banco descartável/evolução/RLS/grants passaram; aplicada T14 dev e integração |
| Prova vermelha da gestão | build anterior falhou pela ausência do campo de validade |
| Normalização | teste detectou controle externo removido pelo trim; guarda corrigida; puros 2/2 |
| Check completo | exit 0 após a guarda Unicode: regras/lint, 7 domínio, 64 nativos, tipos e build; log `.artifacts/convites-check-final.log` |
| Check final compartilhado | exit 0 após as fontes finais de UX e o probe de grants do restore; 7 domínio, 64 nativos, lint/tipos/build; `.artifacts/resumo-pessoas-check.log` |
| Revisão independente | sem achados importantes restantes após corrigir import do restore e recuperação de prazo vencido |
| HTTP focal | 18/18, gestão/prazo/aceite/concorrência/busca/segurança/direitos; `.artifacts/convites-http-focal-final.log` |
| E2E de lojas | 104/104 em 320/390, incluindo os convites novos e legados; `.artifacts/convites-e2e-stores-final.log` |
| E2E de relação | 138/138 em 320/390, com composições desktop explícitas; `.artifacts/convites-e2e-relationship.log` |
| E2E no build final compartilhado | 210/210, incluindo os três arquivos novos de convites; log `.artifacts/resumo-pessoas-regression.log`, lista `.artifacts/resumo-pessoas-regression-files.txt`; mais 20/20 da UX desktop no mesmo build |
| Integração completa T14 | 383/383, sem falha/pulo; `.artifacts/convites-integration-t14.log` |
| Ciclo web real | 1/1, 5,9 minutos, Auth/banco/mídia/outbox reais; `.artifacts/convites-real-cycle-verified.log` |
| Recuperação inicial | exit 0, WEB_RECOVERY_VERIFIED, seis fases, CODE revogado somente na cópia; `.artifacts/convites-restore.log`. Massa vazia, complementada pelo ensaio preenchido abaixo |
| Recuperação com usos reais | exit 0, WEB_RECOVERY_VERIFIED, dois InvitationUse preservados e um CODE revogado; `.artifacts/convites-restore-with-uses.log` |
| Retomada local | LOCAL_READY em 4301; health exit 0, status ready e seis componentes ready em 23:33:10.740Z; `.artifacts/convites-health-final.log` |

A revisão confirmou que recuperar uma operação AT já criada precede a
validação temporal. Assim, `invitation_expiration_past` após falha incerta
confirma ausência e permite corrigir a política com novo UUID. A regressão
503→400→nova data foi acrescentada; os demais erros incertos preservam o corpo.
As janelas de build/servidores foram coordenadas com a tarefa de UX desktop;
seus componentes e testes não pertencem ao escopo de convites.

A primeira rodada HTTP mostrou que URLSearchParams substituía um surrogate
isolado antes da validação. A busca agora recusa o texto inválido antes da
conversão e conserva emojis válidos. A rodada E2E encontrou seletores de label
exato que incluíam as opções do select; os testes usam agora o papel combobox
e o nome acessível. Não houve mudança de produto para resolver esse seletor.
As duas suítes E2E acima passaram após a correção. Capturas do visor com texto
200% foram inspecionadas e preservadas em `.artifacts/convites-ui/`.

O ciclo web real foi ampliado em `web/tests/pilot-browser/{helpers,cycle.spec}.ts`:
uma pessoa entra pela busca CODE, cancela a primeira confirmação e aceita a
segunda; outra entra pelo link. O teste confere exatamente dois InvitationUse
no banco. O ciclo inteiro passou, incluindo resgates, devolução e álbum.

A primeira tentativa do ciclo encontrou o seletor antigo do recadinho no
artigo principal do ticket. `helper-cycle.ts` agora confere o snapshot na região
Conteúdo da ocasião, mantendo a ausência da nota nova após editar o catálogo.
A segunda tentativa registrou ERR_NETWORK_IO_SUSPENDED: Kernel-Power 42/107
confirmou suspensão/retorno do Windows às 19:58:37/19:58:39. Nenhuma mudança de
produto foi feita para essa ocorrência; a repetição completa passou. Evidências
de falha ficam no diretório privado de relatórios, com metadados de energia em
`.artifacts/convites-cycle-power-events.log`.

Os itens de prova inicial sem execução isolada estão identificados no próprio
roteiro. Não constituem resultados alegados. A prova vermelha do build anterior
e a falha de normalização observada estão documentadas; o aceite final usa as
suítes efetivamente executadas depois da implementação.

O restore usou o backup `42c7d717-30ef-4331-907f-a032458b9ed7`, corte em
23/10/2026 23:16:56.575Z, com a web recuperada em 23:22:32.073Z. O intervalo
medido desde a declaração simulada até a web verificada foi 146,596 segundos.
A cópia teve um CODE explicitamente revogado; os fingerprints permaneceram
iguais, mas InvitationUse estava vazia nessa massa inicial. O ensaio preservou o marcador dev,
confirmou novo AAL2 com o fator original, rejeitou contextos anteriores e
removeu a cópia pela posse. Os tempos descrevem somente essa carga local.

A conferência da massa revelou que relationshipFixture insere participantes
diretamente. A prova foi fortalecida antes da conclusão: somente os dois vínculos
sintéticos ainda vazios são substituídos por aceites reais do mesmo CODE. Seus
objetos são atualizados em lugar para preservar as referências dos helpers.
A captura, a origem reiniciada e a cópia passam a exigir exatamente dois usos;
a origem conserva revogação nula e a cópia exige revogação explícita. O segundo
ensaio passou com exatamente dois registros preservados; a primeira aprovação
não é usada como prova de histórico preenchido.

O segundo backup foi `a3a3e1ee-395d-42db-b878-d7e41cab03c0`, corte em
23/10/2026 23:26:47.972Z e web recuperada em 23:31:22.418Z. A origem manteve
o CODE ativo com useCount=2; a cópia teve revogação explícita, useCount=2 e os
dois InvitationUse conferidos por contagem e fingerprints. Novo ciclo web e
limpeza da cópia passaram. O intervalo entre a declaração simulada e a web
verificada foi 130,284 segundos nesta execução.
