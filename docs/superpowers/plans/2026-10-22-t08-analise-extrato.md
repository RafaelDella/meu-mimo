# T08 — plano de implementação

> Orquestração do Vibe Coding Toolkit solicitada pelo idealizador. Usar as
> ferramentas nativas descobertas; subskills de execução não estão disponíveis.
> Um escritor por arquivo, root nos recursos mutáveis e no commit final.

**Objetivo:** decisões auditáveis, compensações únicas e extrato real.
**Arquitetura:** mesma transação PostgreSQL para decisão, ledger, retenção e
outbox; foto READY processada antes. Snapshot e ledger antigos imutáveis.
**Stack:** Node 24/Next 16.4.2/React 19.3.1/TS 6/Prisma 7.10.1/PostgreSQL 17;
Auth/Storage existentes, sem dependência nova.
**Desenho aprovado:** [T08](../specs/2026-10-22-t08-analise-extrato-design.md).
**Base:** 09fc5c4; branch codex/t08-analise-extrato. D05 e limites confirmados.

## Restrições globais

- Motivo obrigatório CONTEST/VOID/REOPEN até 500 Unicode; APPROVE dispensa.
- RESPOND tem texto até 500 ou foto READY; uma resposta por solicitação.
- Reabrir volta a PENDING sem dinheiro; aprovar recompõe se estornado. Ciclos
  repetidos preservam +P/−P/+P e a ocorrência original.
- PAUSED permite revisão/complemento real; CLOSED/participação encerrada só
  consulta. Comentários preservam T05/T07. D08 protege todas as versões.
- Inteiros acumulados e projeções em strings/BigInt; nunca converter para Number.
- Base/protótipo preservados. Código/testes até 350 linhas, UI 320/390/200%/teclado.
- Root serializa geração/build/DB/Next4310/mídia4311; T08 tem bancos
  meumimo_t08/dev/shadow e namespaces t08-development/t08-integration.
- Sem gasto/ticket artificial. Prova integral de gastar→anular é T09; T08
  prova ledger real, aritmética assinada identificada e UI negativa controlada.

## Contratos fixados

DTOs em `web/src/contracts/activities.ts`: estados CONTESTED/VOIDED e REVERSED,
SubmissionView.analysis (null em DRAFT), versão própria, ações/capacidades,
solicitação/revisão atual, aprovação/autor e impacts por ação. ReviewImpact
tem available/delta/resulting em strings. `review` de T07 não muda significado.
ReviewEventView registra origem/destino, motivo/texto/foto, versão, autor/data,
delta e movimento. ReviewMutation tem event/submission/appliedVersion.
PointsKind: ACTIVITY_CREDIT, ACTIVITY_REVERSAL, ACTIVITY_RESTORE; extrato inclui
reviewEventId/compensatesEntryId. today.adjusted separa ajustes dos ganhos iniciais.

Após `/api/lojas/:storeId`:

| Recurso | Contrato |
| --- | --- |
| GET /registros/:id | SubmissionView com analysis calculada pelo servidor |
| POST /registros/:id/analise | ReviewBody: operationId,expectedVersion,action,reason,expectedBalance → ReviewMutation |
| POST /registros/:id/resposta | ResponseBody: operationId,expectedVersion,requestId,evidenceRevision,text,evidenceAssetId → ReviewMutation |
| GET /registros/:id/operacoes/:operationId | ReviewMutation aplicado com estado atual,404 se ausente |
| GET /registros/:id/historico | SubmissionHistory page/pageSize; recebimento/auto + revisões |
| GET /pontos/movimentos | PageResult<PointsEntryView>, kind/from/to/membershipId/page/pageSize |

Funções para o escritor domínio, Identity/storeId/string IDs/body Record/query:

```ts
reviewSubmission(identity,storeId,id,body):Promise<ReviewMutation>
respondToSubmission(identity,storeId,id,body):Promise<ReviewMutation>
readReviewOperation(identity,storeId,id,operationId):Promise<ReviewMutation>
listSubmissionHistory(identity,storeId,id,query?):Promise<SubmissionHistory>
```

Preservar/exportar readPoints/listPointsEntries; creditSubmission mantém chamada
T07, e novos auxiliares financeiros recebem StoreScope/ReviewEvent. Compartilhar
queries internas entre views e revisão sem chamar serviços HTTP/rate limit em TX.
Root fornece `enqueueSubmissionReview(tx,eventId):Promise<void>`.

Schema root: ActivitySubmission.analysisVersion default0; SubmissionReviewEvent
com id=operationId, storeId/submissionId/actor/version/action/fromStatus/toStatus,
reason/text/requestDigest/evidenceAssetId/evidenceRevision/requestId/delta/date.
requestId é único (somente RESPOND), ligado ao CONTEST original; cada CONTEST
abre nova revisão. Em CONTESTED, novo CONTEST só após resposta à solicitação atual.
PointsEntry acrescenta reviewEventId único e compensatesEntryId único. Um evento
pode ter zero ou um movimento; delta0 não cria lançamento. Chaves:
`submission.credit:{id}`, `submission.reverse:{eventId}`, `submission.restore:{eventId}`.
Crédito inicial manual mantém ACTIVITY_CREDIT e a unicidade T07, com ator lojista.

Conflitos 409: review_changed (versão/estado/solicitação), balance_changed
(saldo diferente da prévia), media_not_ready, operation_conflict. Replay validado
antecede versão/estado/saldo. Fechamento usa store_closed/membership_closed.
IDs inválidos de recurso404, campos inválidos400 conforme contrato existente.
Uma UUID global de revisão não troca origem, autor, ação ou corpo.

## Ondas e arquivos exclusivos

| Onda | Dono | Escrita permitida | Recursos |
| --- | --- | --- | --- |
| 0 | root | DTO/schema/migração/plano/docs | desenho aprovado; DB/Prisma em série |
| 1 | domínio | server/{submissions,points}/**; app/api/lojas/[storeId]/registros/**; app/api/lojas/[storeId]/pontos/** | só fonte, sem checks/build/DB |
| 1 | UI | components/{submissions,points,activities}/**; app/lojas/[storeId]/{registros,extrato}/**; navigation/store-navigation.tsx; stores/store-workspace.tsx; tests/e2e/points/** | só fonte; DTO pronto |
| 1 | testes | tests/integration/points/** | só fonte; contratos prontos |
| 1 | root | scripts,sharedfixtures,tests/e2e/activities/helpers.ts; server/{media,outbox,notifications,stores}/**; components/media/**; contratos notifications; docs/CI | DB/build/processos sempre root |
| 2 | root | integrar fontes congeladas | check, migrações, HTTP e browser em série |
| 3 | revisores novos | somente leitura diff+novos arquivos+chamadores | painel segurança/transações e UI/tipos |
| 4 | escritor focal/root | achados confirmados e checks afetados | sem colisão; commit root ao concluir |

## Tarefas e verificações

### A — banco e contratos (root)

- [x] Reconhecimento em três assentos e builder check; desenho/D05/limites aprovados.
- [x] Fixar schema/DTO e preparar T08 separado; gerar/revisar migração aditiva.
- [x] Preservar FKs manuais, snapshot/auditorias imutáveis, RLS/grants restritos.
  Crédito exige origem/valor/status; compensação exige cadeia/oposto/contexto,
  unicidade e evento com delta correspondente, inclusive validação no commit.
- [x] Prova vazia/evolutiva com dados T07, crédito antigo e privilégios efetivos.
  Aplicar cadeia às bases anteriores para as regressões, sem reset.

### B — domínio/API (escritor domínio)

- [x] RED aprovação ausente → GREEN manual+15; duas UUIDs na mesma versão
  deixam só um crédito/evento, sem segunda aprovação inicial.
- [x] Matriz de estados completa e ciclos; snapshot/ocorrência preservados;
  contestar mantém crédito; anular sem crédito0; reabrir0; nova aprovação+P.
- [x] Replays antigos retornam ação aplicada/estado atual; outro corpo/ator/origem
 409, outra relação404. Saldo alterado em outra conquista exige revisão409.
- [x] Resposta única por CONTEST, foto da revisão/autor certa, READY; fechar
  uploads, publicar/proteger na TX e notificar. Decidir×responder sem parcial.
- [x] Histórico paginado e GET operação para navegação de decisão antiga.
  Extrato com filtros por data local/tipo, sinais e autoria/contexto reais.
- [x] Pending sem crédito vigente, reversão separada, ganhos/primeiras aprovações
  distintos de ajustes diários; fonte financeira total0 ouP por registro.

### C — UI (escritor UI)

- [x] Análise e pontos separados em cards/detalhe, ações autorizadas do DTO.
  Confirmar anulação com saldo/delta/projeção exatos; motivo500 e foco/erro.
- [x] 409 preserva motivo e exige atualizar;503/429/resposta perdida preserva UUID
  e corpo, consulta operação antes do retry.401 revalida sessão;404 limpa contexto.
- [x] Complemento só solicitação aberta; texto ou foto; pronta/seleção corrente,
  históricos preservados. Ação concorrente fecha sem anexação/publicação falsa.
- [x] Timeline paginada, destino `?evento=UUID` consulta operação e destaca a
  decisão, mesmo antiga. Extrato em URL com filtros preservados e link ao potinho;
  não criar Meus mimos fictício antes de T09/T12.
- [x] E2E320/390, teclado/foco/dialog/Escape/44px/200%/reduzido; negativo exato,
  acimaMAXSAFE, perda de resposta, conflito e descarte de conta/loja.

### D — HTTP real (escritor testes; root executa)

- [x] Aprovar/contestar/manter/anular/reabrir e múltiplos ciclos com ledger exato.
- [x] Concorrência de decisões/respostas e rollback forçado em ledger/outbox;
  repetir recupera sem crédito/evento/publicação duplicados.
- [x] Audiência, CSRF, no-store, suspensão/revogação/replay/destino, conta/loja/admin.
- [x] Mídia real sintética: foto anterior, versão nova privada/READY/publicada,
  fora de contexto404, seleção inválida409, D08/expurgo/hold/órfãos24h.
- [x] Pausa permite revisão e complemento real; encerramento bloqueia nova análise;
  fechar×contestar/reabrir serializa. Recorrência nunca se libera pela anulação.
- [x] Filtros/paginação/origem/histórico, nomes antigos, reconciliação, ajustes
  não são novas conquistas; SQL 5−15=−10 identificado sem débito fictício.

### E — integrações e encerramento (root)

- [x] Outbox origem ReviewEvent e destino real; pausa real em upload de complemento;
  callback seleção só revisão atual; lifecycle inclui CONTESTED.
- [x] T08 scripts/CLI/env/bancos/Storage/CI; credenciais admin fora do Next.
- [x] `npm run check`, prova migrações, `test:integration:t08`, `web:test:e2e`;
  examinar capturas. Preservar todas as regressões e rodar em série.
- [x] Congelar manifesto de fontes, revisão independente, reproduzir achados e
  corrigir confirmados; checks afetados. Não ampliar revisões sem risco pendente.
- [x] Atualizar canônicos, fontes/evidências/limites, scan segredos e diff; capturar
  HEAD atual e preparar o commit final autorizado. O Git registra seu identificador;
  conferir a árvore após criá-lo.

## Foco da revisão

1. Dois ciclos anular/reabrir/aprovar não duplicam crédito ou compensação.
2. Replay antigo após nova decisão não reaplica saldo e revalida acesso.
3. Saldo muda após prévia: nenhuma anulação com impacto não revisado.
4. Foto nova e anterior durante resposta×decisão/expurgo: publicação/proteção
  atômicas, sem reescrever snapshot ou ressuscitar mídia.
5. Encerrar×contestar/reabrir e pausa: nenhum estado pendente em relação fechada.

## Evidências e limites

Base09fc5c4: check7+9/build verificados antes da aprovação; não é prova de T08.
Desenho aprovado inclui a limitação do gasto/tickets até T09. Aparelhos físicos,
leitor de tela, CI remoto e infraestrutura publicada permanecem não observados.
Registrar abaixo somente checks realmente executados nesta entrega.

### Execução e revisão concluídas

O desenho, D05 e os limites foram confirmados antes de editar o produto. As
ondas usaram escritores exclusivos para domínio/API, UI/E2E e HTTP. O root
integrou contratos, schema, migrações, serviços compartilhados, scripts e docs;
controlou comandos, banco, builds e servidores. Uma atribuição focal adicional
escreveu `check-reviews-migration.mjs`, sem executar banco. Revisores novos de
segurança/transações e UI trabalharam somente em leitura e confirmaram as
correções finais, sem achados concretos remanescentes.

Foram acrescentadas duas migrações, preservando checksums anteriores. A primeira
cria análise e compensações; a segunda exige no commit a correspondência de
evento→origem e estado→financiamento. A prova cria um crédito sob T07 antes
da evolução, aplica T08 e verifica ciclo, snapshot, primeira aprovação, FKs,
RLS e privilégios. A cadeia foi aplicada aos bancos locais de desenvolvimento
e integração de T02/T04/T05/T06/T07/T08, sem reset. São 22 tabelas com RLS.

Falhas reproduzidas e corrigidas:

- O teste focal de aprovação recebeu 404 no build T07 e passou após implementar
  T08. Aprovação com motivo preenchido recebia 503; a entrada agora recebe 400
  sem efeitos, comprovada no HTTP real.
- O primeiro rascunho SQL falhou por sintaxe de CASE e por montagem de texto
  na ferramenta de geração. A transação foi revertida; os registros de migração
  falha foram marcados como revertidos antes da aplicação correta. Nenhuma
  migração já aplicada foi reescrita.
- A prova SQL aceitou evento sem alteração de origem. A migração aditiva passou
  a rejeitar também VOID sem estorno e APPROVE sem crédito, com rollback.
- Lint identificou atualização de estado por efeito; os callbacks de confirmação
  e as chaves de remontagem passaram a controlar os resets. Foco permanece um
  efeito de DOM após fechar o diálogo. Tipos exigiram indexação compatível com
  a configuração existente, preservada.
- A revisão encontrou a 51ª foto fora da página inicial, extrato residual após
  perda de acesso e foco perdido ao remover o acionador. Oito regressões em
  320 falharam antes; a correção passou nas duas larguras, incluindo 403.
  Evidências agora começam pela revisão atual, com histórico sob demanda e
  reautorização das páginas abertas.
- A suíte nova encontrou um seletor de “Próximos” ambíguo entre histórico e
  comentários. O teste foi restringido à região do histórico; as assertivas de
  página, destaque e foco foram mantidas.

Verificação final local em 22/10/2026:

| Prova | Resultado |
| --- | --- |
| `npm run check` | Regras/lint sem warnings, 7 testes do protótipo, 9 da fundação, tipos e build |
| `npm --prefix web run db:migrate:check` | Banco vazio, evolução T07→T08, compensações e privilégios efetivos |
| `npm --prefix web run test:integration:t08` | 175/175 HTTP reais; 37 T08 e 138 regressões |
| HTTP focal de autorização/mídia após ordenar evidências | 5/5, com a revisão mais recente primeiro |
| `npm run web:test:e2e` | 270/270 Chromium; 104 T08 e 166 regressões em 320/390 |

Capturas de anulação, complemento e extrato normal/200% foram examinadas em
`web/.artifacts/t08-*.png`, ignoradas. Incluem saldo negativo controlado e
inteiros acima de MAX_SAFE_INTEGER. O HTTP prova movimentos reais; não prova
gasto/ticket antes de T09. Os processos iniciados para testes foram encerrados.
O workflow foi atualizado, mas não há execução remota observada. A próxima
entrega é T09, dependente de D06; aparelhos físicos e leitor de tela seguem
pendentes nos aceites de T03/T14.

O scan de 462 arquivos versionáveis/estáticos não encontrou segredos locais ou
chaves privadas. Links locais dos documentos alterados e diff conferidos;
base anterior `09fc5c4`. O commit é preparado na branch
`codex/t08-analise-extrato`, com fontes e configurações necessárias à entrega.
