# T09 — plano de implementação

> Orquestração Vibe Coding Toolkit autorizada. Equivalente nativo no Codex às
> subskills de execução não descobertas: contratos primeiro, escritores com
> arquivos exclusivos e revisão independente somente leitura. Root serializa
> Prisma, serviços, checks e Git. A confirmação do desenho incluiu implementar.

**Objetivo:** catálogo real, resgate atômico e tickets históricos privados.
**Arquitetura:** reusar transação/lock de loja, saldo por soma do ledger e outbox.
Configuração e estoque têm versões separadas; intenção UUID recuperável na URL.
**Stack:** Node 24, Next 16.4.2, React 19.3.1, TypeScript 6, Prisma 7.10.1,
PostgreSQL 17 e Auth/Storage locais existentes; sem dependências novas.
**Desenho aprovado:** [T09](../specs/2026-10-22-t09-catalogo-resgates-design.md).
**Base:** e35356f. Branch: codex/t09-catalogo-resgates.
**Estado:** implementada e verificada localmente, com commit final solicitado.

## Restrições globais

- Custo 1–1.000.000; estoque 0–1.000.000 ou null ilimitado; uma unidade/ticket.
- Nome/categoria 80, descrição/instruções 1.000, recadinho 500 Unicode; texto simples.
- Sticker gift/coffee/takeout/envelope. Sem novo upload de catálogo.
- D06 baixa na emissão; realização/cancelamento/devolução T10, álbum T11.
- Snapshot, ledger e eventos imutáveis; débitos não pertencem a conquistas.
- Inteiros acumulados em strings/BigInt. Paginação 20/máximo50; leitura120/write30.
- Pausa bloqueia emissão; catálogo administrativo pode mudar. Encerramento só
  consulta/replay autorizado, e tickets não bloqueiam encerramento.
- Runtime sem admin/migração; RLS/grants restritos, FKs compostas, sem reset.
- Um escritor por arquivo. JS/TS até350 linhas, UI320/390/200%/teclado/foco.
- T09 usa meumimo_t09/dev/shadow, prefixos t09-development/t09-integration,
  Next4310/mídia4311 em loopback e stack Auth meumimo-t02, em série.

## Foco de revisão

- Reload durante POST: consulta UUID e confirmação renovada nunca cobram duas vezes.
- Formulário de estoque antigo: versão separada impede repor unidade consumida.
- Anular crédito já gasto: saldo negativo, cadeia da conquista e ticket preservados.
- 401/403/404 em qualquer fonte: limpa a área; resposta antiga não cruza conta/loja.
- CHECK com NULL: exatamente uma origem e valores não nulos explícitos.

## Contratos e responsáveis

Root escreve `contracts/rewards.ts`, `contracts/redemptions.ts`, evolução de
`contracts/activities.ts`, schema/migrações, points/outbox/notificações,
check-migrations e documentos. Caminhos sob `web/src/` quando abreviados.

Escritor domínio: somente `server/rewards/`, `server/redemptions/` e rotas API
`app/api/lojas/[storeId]/{mimos,tickets}/`. Escritor UI: somente componentes
rewards/tickets, páginas mimos/tickets, navegação/workspace e extrato UI,
`tests/e2e/redemptions/`. Escritor HTTP/runtime: `tests/integration/redemptions/`,
helpers de integração e scripts locais, exceto check-migrations*. Root coordena
qualquer necessidade fora desses caminhos antes de editar.

DTOs concretos nos arquivos de contratos são a fonte para os três escritores.
RewardFields: name,description,category,sticker,cost,note,instructions,available,
stock (null ou inteiro). RewardView acrescenta id/storeId/version/stockRevision,
createdAt/archivedAt e availability participante com saldo/pending/resulting,
shortfall,eligible,reason. RewardPage inclui categories.
TicketView guarda id/code/storeId/rewardId/participantMembershipId/participant,
status/createdAt/localDate/timezone/snapshot/balanceBefore/balanceAfter,
conversation/events. Mutation é `{ticket}`. Summary é `{total,outstanding}`.
PointsEntryView conserva campos antigos de atividade como nullable, acrescenta
redemptionId/rewardName e origem discriminada, com path autorizado. Espécie nova
REDEMPTION_DEBIT; atividadeName null no gasto, sem fingir conquista.

Após `/api/lojas/:storeId`:

| Recurso | Entrada/saída |
| --- | --- |
| GET /mimos | page/pageSize/q/category/state → RewardPage |
| POST /mimos | operationId + RewardFields → RewardMutation |
| GET /mimos/:id | RewardView, inclui prévia autorizada |
| PATCH /mimos/:id | operationId,expectedVersion,expectedStockRevision + campos → RewardMutation |
| POST /mimos/:id/arquivar | operationId,expectedVersion,expectedStockRevision → RewardMutation |
| POST /mimos/:id/resgatar | operationId,expectedVersion,expectedBalance → RedemptionMutation |
| GET /mimos/:id/operacoes/:UUID | RedemptionLookup: ticket ou null, reautorizado, distingue ausência de acesso negado |
| GET /tickets | from/to/status/membershipId/page/pageSize → TicketPage |
| GET /tickets/resumo | membershipId opcional lojista → TicketSummary |
| GET /tickets/:id | TicketView, também consulta da operação UUID |

Funções domínio com Identity/storeId/string IDs/body Record/query:
`listRewards`, `readReward`, `createReward`, `updateReward`, `archiveReward`;
`redeemReward`, `listTickets`, `readTicket`, `readTicketSummary`.
`lookupRedemption(identity,storeId,rewardId,operationId)` devolve RedemptionLookup;
null significa intenção ainda não confirmada na origem autorizada, não um404.
Corpo CRUD de mimos admite16KiB para os limitesUnicode; demais rotas mantêm8KiB.
Conflitos409: reward_changed,stock_changed,balance_changed,insufficient_points,
reward_unavailable,operation_conflict e estados existentes de loja/vínculo.
POST replay compara corpo normalizado/digest antes das regras mutáveis.
Root fornece `enqueueRedemptionIssued(tx,redemptionId):Promise<void>`.

Schema root: Reward contém campos/versões e criador; RewardEvent tem UUID da
operação, versão/kind/digest/configuração. Redemption.id=operationId e inclui
requestDigest,expectedVersion,expectedBalance, snapshot prefixado reward*,
stockBefore/stockAfter/stockRevision (null para ilimitado), saldos BigInt e
campos de TicketView. RedemptionEvent registra ISSUED e autor/data/contexto.
PointsEntry.submissionId opcional + redemptionId opcional único; chave do débito
`redemption.debit:{id}`, amount=-cost, sem review/compensates. Migração aditiva
depois da última T08; não enfraquecer validate_review_ledger() fortalecido.

## Tarefa 1 — contratos, migração e integrações compartilhadas (root)

- [x] Fixar contratos acima e schema; gerar cliente apenas root.
- [x] Escrever migração aditiva: tabelas/enum/FKs/índices, CHECKs explícitos,
  RLS/grants mínimos, triggers imutáveis e integridade diferida de emissão,
  ledger/evento/estoque. Saldo suficiente protegido também no insert do débito.
- [x] Preservar ramo de validação de atividade; adicionar ramo próprio do débito.
- [x] Ampliar extrato/saldo sem alterar pending/today/compensações da conquista.
- [x] Integrar outbox/destino de ticket e comentário real; remover comentário
  obsoleto que sugere tickets bloqueando encerramento.
- [x] Provar migração vazia e evolução T07→T08→T09 preservando snapshots, cadeia,
  IDs/valores e grants, incluindo rejeição NULL/origem errada/ticket gratuito.

## Tarefa 2 — catálogo e emissão no domínio (escritor domínio)

- [x] Implementar validação Unicode/inteiros/allowlist e DTOs autorizados.
- [x] CRUD com UUID/digest/configversion/stockRevision; replay e arquivo histórico.
- [x] Prévia vem do banco: soma exata disponível e pending separado, motivos
  indisponível/esgotado/arquivado/pausa/encerramento/saldo insuficiente.
- [x] Emissão dentro de withStoreTransaction: acesso, replay, estados, versões,
  saldo esperado/suficiente, estoque, snapshot, reserva, ticket/evento/débito,
  registerConversation(TICKET), outbox e domainStartedAt, uma transação.
- [x] Consulta/lista/summary reautorizados; contador independente da página/filtro.
- [x] Teste pela suíte da tarefa3: crédito15→gasto10→anulação−15=−10; ticket fica,
  reabertura0 e recomposição15 uma vez. Nunca cadastrar ticket/ledger fictício.

## Tarefa 3 — provas HTTP reais e runtime (escritor HTTP/runtime)

- [x] Helper compõe reviewFixture, cria crédito viaAPI, catálogo e resgate.
- [x] Testes: CRUD/Unicode/limites/arquivo/snapshot, estoque0/ilimitado,
  edição antiga após consumo, mudança de preço/saldo, autoria/contexto/CSRF.
- [x] Concorrência: dois mimos com saldo paraum, dois usuários última unidade,
  mesmaUUID simultânea/replay, UUID em autor/loja/mimo/corpo diferentes.
- [x] Falha determinística em cada produtor deixa zero efeitos parciais;
  retry posterior confirma uma vez. Notificação com dois workers deduplica.
- [x] Ciclo: pausa/encerramento/revogação, consulta/replay, tickets não impedem
  fechar; histórico datas/fuso/DST/páginas/contador/isolamento de pessoa.
- [x] Acrescentar taskT09 aos scripts/allowlists/CI; adaptar prefixes/regressões;
  cleanup restrito às fixtures respeita FKs e inclui débitos sem submissionId.
- [x] Root executa `npm --prefix web run test:integration:t09`, sem skips e com
  todas as regressões T02–T08. Falha por implementação ausente primeiro,
  sucesso final é exit0 e totais registrados, não pressupor números novos.

## Tarefa 4 — interface real e Chromium (escritor UI)

- [x] Mimos lojista: catálogo/resgates, filtros/página, novo/editar/arquivar,
  preview, quantidade disponível agora e proteção de edição antiga.
- [x] Lojinha participante: potinho real, entrada/vitrine; detalhe e confirmação
  custo/saldo/restante, falta exata inclusive negativa, atividades acessíveis.
- [x] Meus mimos: Tickets/Extrato, saldo e summary independentes, filtrosURL,
  vale snapshot/evento/conversa. Não oferecer controles T10/T11 inexistentes.
- [x] UUID opaca persiste na URL antes de enviar; consulta primeiro ao reload.
  Incerto preserva UUID/corpo; nova revisão usa mesmaUUID até resolver; nova
  intenção só por ação explícita depois do resultado conhecido.
- [x] Integrar navegação/workspace e extrato com origem ticket, preservando
  /extrato e links existentes. Todos os GETs limpam pai em401/403/404.
- [x] Chromium controlado:320/390,200%,teclado/foco/Escape/44px/reducedmotion,
  CRUD/resgate/extrato/filtros, perda de resposta/reload/toque duplo, conflitos,
  401/403/404 em cada fonte e troca de conta/loja durante resposta atrasada.
- [x] Root executa suíte Chromium inteira após build; examina capturas.

## Tarefa 5 — revisão, documentos e commit (root)

- [x] Atualizar requisitos (D06/D04 confirmados), arquitetura, design/onboarding,
  comandos/roadmap/AGENTS e `docs/rewards-local.md`; separar T09 de T10/T11/T12.
- [x] Revisores novos somente leitura, foco domínio/SQL/segurança e UI/privacidade.
  Corrigir achados reproduzíveis e repetir checks afetados.
- [x] `npm run check`, `npm --prefix web run db:migrate:check`, HTTP T09 completo,
  Chromium completo e revisão de whitespace; registrar limites reais.
- [x] Inspecionar diff staged para segredos/arquivos alheios; root faz commit
  `feat(rewards): implementa catalogo e resgates de T09`; conferir HEAD/status.

## Preparação e evidências

- Builder check independente: sem lacunas materiais. D06/D04/desenho aprovados.
- `npm run check` na base e35356f passou: sete testes do protótipo, nove da
  aplicação, lint/tipos e build. Não prova funcionalidade T09 ainda inexistente.
- Auto-revisão: desenho coberto pelas tarefas1–5; contratos consistentes;
  cinco riscos do foco têm provas nas tarefas1/3/4. Sem novas decisões de produto.
- Context7 retornou Prisma Next; usar API Prisma7 instalada e fonte oficial
  registrada no desenho. Sem código privado ou segredos enviados às consultas.

## Revisão e provas observadas

Os três escritores entregaram domínio/API, UI/E2E e HTTP/runtime em seus
escopos. Root integrou contratos, schema, SQL, ledger/outbox, serviços e docs.
Revisores novos somente leitura avaliaram SQL/segurança, qualidade/TS/API e
React/privacidade. O checkpoint inicial de91 arquivos teve hashes registrados
em artefato ignorado; follow-ups conferiram apenas os deltas das correções.

Achados confirmados e tratados:

- SQL: variável `configuration` ambígua no trigger diferido. A prova de migração
  reproduziu42702; renomear para expected_configuration liberou o CRUD.
- SQL: auditoria administrativa inserida depois do ticket podia disfarçar
  reposição como consumo. Teste reproduziu commit indevido; validação diferida
  passou a rejeitar a revisão compartilhada. O mesmo teste passou após correção.
  A migração ainda não havia sido aplicada aos bancos T09 persistentes.
- UI: pageSize se perdia em filtros/paginação, fazendo página2 de50 repetir
  itens21–40. Corrigido e coberto com51 itens e retorno preservado.
- Busca: nome de80 emojis era válido, mas q.length contava160 UTF-16. HTTP
  reproduziu400; validação e campo de busca agora contam caracteres Unicode.
- Integração: três abas principais, contador na navegação compartilhado com a
  página, boundary por conta/sessão/loja e propagação de negação de fontes.
- Formulário: validação antiga focava Nome mesmo quando Categoria estava
  inválida. Chromium contra o build anterior falhou exatamente nesse foco;
  refs, erros associados e testes de todos os campos foram acrescentados.
- Ilustrações usam os quatro SVGs locais, decorativos, sem dependência nova.

`npm run check` após as correções passou: lint, tipos,7 testes do protótipo,
9 de fronteira/regras e build. Schema validado e cliente gerado pelo root.
`db:migrate:check` passou com10 migrações,26 tabelasRLS, evolução T07→T08→T09,
snapshots/IDs/cadeia anteriores preservados e permissões efetivas. Emissão sem
evento/débito/conversa/outbox, reserva sem ticket, origem nula e auditoria tardia
são rejeitadas. Migrações aplicadas em dev/integração T09, sem reset.

HTTP completo:211/211 (36 novos +175 regressões), zero skips. A primeira
execução teve209/211: a regressão Unicode ainda contra o build anterior e um
timeout de login da fixture. A repetição integral após build passou em219s,
incluindo o caso anterior de timeout; não foram aumentados prazos nem ocultadas
falhas. Crédito15→gasto10→anulação−15 comprova saldo−10 e ticket real preservado.

Chromium completo: 382/382 (112 novos +270 regressões), zero skips, em 320/390.
A primeira rodada teve 370/382: oito expectativas de título singular/plural e
quatro seletores de textarea. Ajustados para o nome acessível real; reexecução
focal 22/22 e nova rodada integral 382/382, em 3,2 minutos. Sem aumentar prazos.
O contador atualiza depois do resgate e separa pendências do total histórico.
Capturas do formulário, confirmação e vale, normais e a 200%, foram examinadas.
Teclado/Tab/Escape/foco, alvos de toque e movimento reduzido foram verificados.

Auditoria local de 495 arquivos não encontrou segredos locais ou chaves privadas;
114 links locais dos documentos e diff foram conferidos. Relatórios, credenciais e
capturas ficam ignorados. Aparelhos físicos, leitor de tela, CI remoto e publicação
continuam não observados. Sem serviço pago, push ou alteração de dependências.

Exceções cosméticas do diff: fins de linha mistos e uma linha vazia no fim da
nova migração, detectados depois de aplicá-la. `.gitattributes` usa `-text`
somente nesse arquivo, preservando os bytes e os checksums dos dois bancos;
as migrações anteriores não mudam. O
[verificador do Prisma](https://github.com/prisma/prisma-engines/blob/main/schema-engine/connectors/schema-connector/src/checksum.rs)
aceita variantes LF/CRLF uniformes, mas não normaliza um script misto aplicado.
As demais classes de whitespace foram verificadas com
`git -c core.whitespace=cr-at-eol,-blank-at-eof diff --cached --check`.
