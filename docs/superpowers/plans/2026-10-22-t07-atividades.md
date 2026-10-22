# T07 — plano de implementação

> Execução: orquestração do Vibe Coding Toolkit solicitada pelo idealizador.
> Adaptar as ondas aos recursos nativos descobertos, preservando modelo/permissões.
> As subskills de execução Superpowers não estão no inventário; usar equivalente
> nativo com arquivos exclusivos, integração serial e revisão independente.
> Root opera recursos mutáveis e faz o commit final autorizado; demais agentes
> escrevem somente seus arquivos ou revisam somente por leitura.

**Objetivo:** atividades reais e conquistas com crédito automático único.
**Arquitetura:** transação PostgreSQL/Prisma para recebimento/ledger/outbox;
foto pronta por T06 antes de confirmar. Sem carteira materializada paralela.
**Stack:** Node24, Next16.4.2, React19.3.1, TypeScript6, Prisma7.10.1,
PostgreSQL17, Auth/Storage existentes; sem dependências novas.
**Desenho:** [T07](../specs/2026-10-22-t07-atividades-design.md), confirmado com D04.
**Base:** cfdcb25; branch codex/t07-atividades-conquistas.

## Restrições e aceites

- Nome/categoria80, descrição1.000; legenda500 Unicode simples/imutável.
- Pontos1–1.000.000 inteiros; MANUAL padrão; ONCE/DAILY/WEEKLY, semanal N1–100.
- Semana segunda00h no fuso; sem retroatividade. Envio recebido ocupa ocorrência,
  inclusive futura contestação/anulação. Editar frequência conta histórico no
  período da regra nova. Preparação/falha não ocupa ocorrência nem saldo.
- Data/fuso/regra esperados mudaram:409 e revisão explícita. Replay já recebido
  recupera o resultado com mesmo corpo e autorização atual.
- Foto opcional READY da coleção/autor/revisão corretos; fechar uploads e
  preservar evidência recebida. Manual holdtrue; automático aprovado holdfalse.
- Disponível e pendente separados; inteiros acumulados em strings decimais.
- Código/testes350linhas; celular320/390, teclado/foco, 44px, texto200%,
  movimento reduzido e descarte de contexto privado.
- Domínio T07/dev/shadow separado; Next4310/mídia4311 em série. Namespaces
  t07-integration/t07-development no bucket privado existente; admin fora do Next.
- T08 recebe análise/compensações/extrato completo; T09 recebe resgate. Nenhum
  endpoint público para crédito, publicação arbitrária ou administração.

## Foco da revisão

1. Duas abas/UUIDs disputam a última ocorrência: somente um envio/crédito.
2. Resposta perdida e regra/pausa posterior: replay recupera sem novo efeito.
3. Dia/fuso/regra mudam durante upload: revisão antes de confirmar crédito.
4. Frequência editada não zera consumo e preserva snapshot de registros antigos.
5. Foto recebida permanece privada e protegida; outra relação ou remoção genérica
   não apaga evidência; fechamento real confere pendência na mesma transação.

## Contratos fixados antes do despacho

DTO em `web/src/contracts/activities.ts`; membros monetários acumulados são
strings. ActivityView inclui campos atuais/versão/arquivo e availability
individual, nula para lojista. SubmissionView inclui snapshot imutável ou null
no rascunho, status/pointsState, coleção, evidência, conversa e review atual.
Listas usam PageResult de stores. PointsBalance separa available/pending/today.

| Recurso após /api/lojas/:storeId | Método/corpo | Resultado |
| --- | --- | --- |
| /atividades | GET q/state/page/pageSize; POST operationId+ActivityFields | ActivityPage; ActivityMutation201 |
| /atividades/:activityId | GET; PATCH operationId+expectedVersion+ActivityFields | ActivityView; ActivityMutation |
| /atividades/:activityId/arquivar | POST operationId+expectedVersion | ActivityMutation |
| /atividades/:activityId/preparar | POST operationId | SubmissionView201, rascunho próprio |
| /registros | GET activityId/membershipId/status/from/to/page/pageSize | SubmissionPage, sem DRAFT |
| /registros/:submissionId | GET | SubmissionView, rascunho só autor |
| /registros/:submissionId/enviar | POST caption/evidenceAssetId/expectedVersion/expectedLocalDate/expectedTimezone | SubmissionView |
| /pontos | GET membershipId opcional para participante próprio | PointsBalance |
| /pontos/movimentos | GET membershipId/page/pageSize | PageResult<PointsEntryView> |

Domínio recebe Identity/storeId e body Record ou URLSearchParams:

```ts
listActivities(identity,storeId,query?):Promise<ActivityPage>
readActivity(identity,storeId,activityId):Promise<ActivityView>
createActivity(identity,storeId,body):Promise<ActivityMutation>
updateActivity(identity,storeId,activityId,body):Promise<ActivityMutation>
archiveActivity(identity,storeId,activityId,body):Promise<ActivityMutation>
prepareSubmission(identity,storeId,activityId,body):Promise<SubmissionView>
readSubmission(identity,storeId,submissionId):Promise<SubmissionView>
listSubmissions(identity,storeId,query?):Promise<SubmissionPage>
submitSubmission(identity,storeId,submissionId,body):Promise<SubmissionView>
readPoints(identity,storeId,query?):Promise<PointsBalance>
listPointsEntries(identity,storeId,query?):Promise<PageResult<PointsEntryView>>
```

Auxiliares públicos internos em arquivos de domínio:
`periodAt(tx,timezone,frequency,now):Promise<ActivityPeriod>` usa SQL/calendário;
`enqueueSubmissionReceived(tx,id):Promise<void>` é fornecido pelo root;
registradores de conversa/mídia e retenção reutilizam T05/T06.

## Ondas e propriedade

| Onda | Dono | Arquivos exclusivos | Dependência/recursos |
| --- | --- | --- | --- |
| 0 | root | schema, DTO, migração, contratos/docs | desenho aprovado; sem agentes escrevendo |
| 1 | domínio | server/{activities,submissions,points}/**; app/api/lojas/[storeId]/{atividades,registros,pontos}/** | DTO/schema; só fonte |
| 1 | UI | components/activities/**; app/lojas/[storeId]/{atividades,registros}/**; components/navigation/store-navigation.tsx; components/stores/store-workspace.tsx; components/ui/points-summary.tsx; tests/e2e/activities/** | DTO/ponte mídia; só fonte |
| 1 | testes | tests/integration/activities/** | DTO/schema/rotas; só fonte |
| 1 | root | scripts/config/sharedfixtures; outbox/notifications; stores/lifecycle.ts; media/service.ts e media-uploader.tsx; docs | mesma onda, zero colisão de arquivos; root serializa comandos |
| 2 | root | integrar e verificar tudo | fontes congeladas; DB/build/servidores em série |
| 3 | revisores novos | snapshot completo + chamadores | readonly, segurança/transações e UI/tipos |
| 4 | root/escritor focal | corrigir achados confirmados e checks afetados | um escritor por arquivo; commit final root |

## Tarefas verificáveis

### A — contratos, modelos e permissões (root)

- [x] Reconhecer fontes; desenho revisado; D04/desenho confirmados.
- [x] Fixar DTO e schema: Activity, ActivityEvent, ActivitySubmission,
  SubmissionEvent e PointsEntry. Origem/audiência com FKs compostas.
- [x] Gerar SQL por Prisma; revisar enum/CHECK, preservar FKs manuais e
  restringir grants/RLS. Auditorias/ledger sem UPDATE/DELETE no runtime.
- [x] Preparar T07 local e aplicar cadeia no dev/integração, sem reset;
  provar evolução/vazio, integridade e permissões efetivas.

### B — domínio e APIs (escritor domínio)

- [x] Cadastro/edição/arquivo com operationId/digest e auditoria; edição/arquivo
  exigem versão esperada.
  Testar nome80/81, pontos1/1.000.000/0/1.000.001, N1/100/0/101 e default MANUAL.
- [x] Datas SQL e disponibilidade: segunda/virada local, UTC/aparelho diferente,
  DST23/25h; contar todos recebidos no período atual, sem filtrar frequência antiga.
- [x] Rascunho próprio com coleção real; submissão de outra relação404;
  rascunho ausente do histórico/pendência/ocorrência/novidade.
- [x] Receber com snapshot e digest. Manual PENDING sem crédito; automático
  APPROVED com crédito, auditoria e evento na mesma TX. Legenda500/501 Unicode.
- [x] Conferir foto READY, publicá-la/fechar coleção; conversa real; holdD08
  conforme estado. Nenhum byte externo na TX.
- [x] Saldo/pendente/resumo diário e créditos consultáveis com audiência atual;
  soma exata acima de int32/Number.MAX_SAFE_INTEGER em fixtures identificadas.

### C — interface real (escritor UI)

- [x] Integrar navegação comum e páginas reais de atividades/registro, com
  cadastro, conflito de versão, arquivo confirmado, busca/filtros/paginação.
- [x] Participante vê regra/limite, contagens sem percentual, saldo separado e
  últimos créditos com origem. Lojista vê somente registros recebidos autorizados.
- [x] Preparar origem, legenda/foto, revisão e envio. Ponte root MediaUploader
  informa seleção/busy/ready; não enviar sem a foto selecionada por engano.
- [x] Em erro incerto, manter UUID/corpo e consultar o mesmo registro; regra/data
  mudaram, revisar antes de tentar novamente. Descartar estado ao trocar contexto.
- [x] Detalhe usa snapshot, foto e ConversationPanel. Nenhum botão de análise
  inexistente ou indicação técnica de etapa no fluxo do produto.
- [x] Chromium320/390: teclado/foco, 44px, diálogo/Escape, texto200%, reduzido,
  erros503/429/409, resposta perdida, contexto e foto processando.

### D — provas HTTP reais (escritor testes; root executa)

- [x] RED API ausente antes do domínio; GREEN com Auth/DB/Storage reais.
- [x] Dois participantes/outra loja/admin; campos forjados, revogação, suspensão,
  CSRF, paginação/filtros, isolamento de rascunho/mídia/pontos/destino.
- [x] Toque duplo/repetição/duas UUIDs concorrentes, limite ONCE/DAILY/WEEKLY;
  editar pontuação/aprovação/frequência, arquivar, pausar e encerrar concorrendo.
- [x] Constraints de fixture provocam falha depois do crédito e no outbox:
  nenhum ledger/evento/ocorrência parcial; retry recupera um único resultado.
- [x] Foto da origem real, processamento pendente/falso/outroautor, leitura após
  publicação, recusa de remoção genérica, retenção manual/automática e conversa.
- [x] Pendência manual impede encerrar a relação/loja certa; automático e
  rascunho não impedem; marcador bloqueia fuso e histórico continua acessível.

### E — integrações e recursos (root)

- [x] Outbox origem SUBMISSION_RECEIVED e destino real para registro/comentário;
  manter TICKET futuro e audiência dos eventos anteriores.
- [x] Lifecycle deixa de ser stub para registros reais; consumo de ocorrência,
  pendências e regra de fuso usam a mesma transação/contexto.
- [x] T07 nos scripts/env/fixtures, namespaces de mídia, CLI/outbox e workflow.
  Preservar credenciais de fixture/migração/service role fora do Next.
- [x] Executar check e regressões HTTP, migração e browser; examinar capturas.
  Aplicar migração também aos bancos dos modos antigos antes de suas suítes.
- [x] Congelar snapshot com base/manifesto; painel independente readonly;
  reproduzir achados concretos antes de corrigir e repetir checks afetados.
- [x] Atualizar canônicos/evidências/limites, scan de segredos e diff completo;
  root faz commit autorizado e confere árvore limpa.

## Limites de evidência

T06 foi validada em cfdcb25: check7+9, HTTP101 e Chromium136. Essa é a base,
não prova de T07. Câmera/galeria, Android/iPhone reais, leitor de tela, CI remoto
e infraestrutura publicada continuam não observados até execução correspondente.

## Execução e revisão

- Reconhecimento de domínio, UI e testes em assentos separados; desenho revisado
  antes da confirmação do idealizador. Após aprovação, três escritores com os
  arquivos exclusivos da tabela e root nas integrações/recursos mutáveis.
- A sétima migração foi aplicada em T07 dev/integração e nas bases anteriores,
  sem reset. A prova descartável partiu da primeira migração com dados, aplicou
  a cadeia e confirmou preservação, RLS nas 21 tabelas, FKs, grants, crédito único e
  snapshot imutável. Nenhuma migração já aplicada foi reescrita.
- RED de fundação: POST de atividade esperava 201 e recebeu 404 do build anterior.
  GREEN após implementação com Auth/PostgreSQL reais. O primeiro check encontrou
  oito usos de Array.at nos testes, incompatíveis com o lib TypeScript do projeto;
  corrigidos por indexação sem alterar configuração ou dependências.
- O primeiro HTTP completo revelou uma expectativa 400 para UUID de recurso
  malformado, cujo contrato compartilhado é 404. O teste foi alinhado; regras de
  campos/paginação continuam 400. O segundo HTTP completo passou 138/138: 37 de T07
  e 101 regressões, com Storage, processamento sintético e reprodução Chromium reais.
- Painel novo independente sobre o diff e todos os arquivos novos; manifesto
  privado com hashes em `.artifacts/t07-runtime/review-manifest.json`. Não existe
  intervalo de commits T07 antes do commit final. Revisões somente leitura de
  segurança/transações e UI/tipos, sem operar os recursos do integrador.
- P2, calendário: a conversão direta de meia-noite em Havana escolhia 05Z em vez de
  04Z no retorno DST. Reproduzido no PostgreSQL; candidatos de offsets dos dois
  lados escolhem a primeira ocorrência, e uma fronteira inexistente é localizada
  por bisseção. RED/GREEN cobre duas 00:30, dia anterior, salto de primavera,
  Lisboa 23/25h e semana de 169h. Revisor focal não encontrou novo defeito.
- P2, sessão: 401 durante envio agora limpa o formulário e revalida PrivateArea,
  preservando caminho/query/UUID no retorno. P3, validação: erro associado e foco
  no primeiro campo inválido, mantendo dados. RED em 320/390 dos dois casos e o
  controle 404 foram executados antes das correções. A revisão focal confirmou
  a solução por leitura; execução final de navegador é registrada abaixo.
- A revisão documental corrigiu a distinção de cadastro sem expectedVersion
  versus edição/arquivo com versão esperada. Links locais examinados resolvem.

## Evidência final local

- `npm run check`: regras, lint sem warnings, tipos, 7 testes do protótipo,
  9 da fundação e build de produção aprovados no código final.
- `db:migrate:check`: banco vazio/evolução, dados preservados, RLS e privilégios
  efetivos, FKs, snapshot e crédito inicial comprovados.
- `test:integration:t07`: 138/138, sendo 37 T07 e 101 regressões. Uma execução
  completa em domínio T07 cobre identidade, lojas, conversa, notificações e mídia.
- `web:test:e2e`: 166/166, sendo 30 T07 e 136 regressões, em Chromium 320/390.
  Antes disso, seletores exatos de label envolveram opções/valor de controles;
  corrigidos para papéis/nomes acessíveis, sem mudar asserções ou timeouts.
  Uma falha isolada de criação da página Chromium ocorreu antes do corpo de um
  teste antigo; o arquivo passou 6/6 sem alteração, seguido do completo 166/166.
- Inspeção visual de catálogo, confirmação manual e formulário a 200% em 320/390,
  com capturas ignoradas em `web/.artifacts/t07-*`. Um seletor do resumo diário
  atingia o potinho compartilhado: restringido ao card diário, com revisão
  independente focal, novo check e 30/30 T07 após o ajuste. Números extensos
  continuam exatos e podem quebrar linha sem cortar o conteúdo.
- Scan final de 410 arquivos versionáveis/estáticos sem segredos locais/chaves
  privadas. O diff staged identificou somente uma linha vazia final na migração
  já aplicada; preservada para não alterar seu checksum. A conferência com essa
  exceção local (`core.whitespace=-blank-at-eof`, sem mudar configuração) passou.
  O manifesto final acompanha as fontes conferidas. Os servidores de testes
  são encerrados pelo próprio harness.

A soma acima de Number.MAX_SAFE_INTEGER foi provada por consulta SQL identificada
e formatação de strings. Não se falsificou lançamento ou desativou constraint
para simular esse saldo. A API pública provou totais a partir de créditos reais.
T08 continua responsável pela análise/compensações e extrato completo; câmeras,
aparelhos físicos, leitor de tela e CI/infraestrutura remotos seguem não observados.
