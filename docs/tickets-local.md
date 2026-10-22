# Combinado, realização e cancelamento locais — T10

Desenho e complementos D04 confirmados em 22/10/2026. T10 amplia o ticket de
T09 com andamento versionado, linha do tempo privada, cancelamento/devolução
e reposição explícita. Álbum integra T11; disputa após realização fica em T14.

## Preparação

Com Docker Desktop Linux e a stack `meumimo-t02` do onboarding ativos:

```sh
npm --prefix web run local:prepare:t10
npm --prefix web run db:migrate:dev:t10
npm --prefix web run db:migrate:integration:t10
npm --prefix web run media:fixtures:t10
npm run check
npm --prefix web run db:migrate:check
npm --prefix web run test:integration:t10
npm run web:test:e2e
```

O preparo seleciona `.env.local` de desenvolvimento. Segredos/relatórios ficam
em `.artifacts/t10-runtime/`, ignorados; não copie seu conteúdo para o Git.
Bancos `meumimo_t10_dev`, `meumimo_t10_shadow` e `meumimo_t10` são separados,
com migrações aditivas, sem reset dos domínios anteriores. Auth/Storage continuam
na stack existente. Next de integração 4310/mídia 4311 e desenvolvimento 4301
atendem somente loopback; comandos de banco/build/typegen/servidor são seriais.
Namespaces Storage: `t10-development`/`t10-integration`.

Consumidores de desenvolvimento em terminais separados, quando necessários:

```sh
npm --prefix web run media:dev:t10
npm --prefix web run outbox:dev:t10
```

Provas determinísticas não disputam com consumidores em background. Comandos
de execução única: `media:once:t10`, `media:purge:t10`, `outbox:once:t10` em `web/`.
Nunca passar credenciais de fixture/migração/Storage administrativo ao Next.

## Contrato de ticket

Depois de `/api/lojas/:storeId/tickets/:ticketId`:

| Recurso | Resultado |
| --- | --- |
| GET detalhe | Snapshot da emissão, estado/versão, combinado, pedido atual, ações/impactos autorizados e primeira página de eventos |
| POST `/transicoes` | `{ticket,event,appliedVersion}`; ticket atual e evento confirmado da intenção |
| GET `/operacoes/:UUID` | `{operation: resultado ou null}`, depois de autorizar o ticket e a autoria da operação |
| GET `/eventos` | Eventos paginados por versão, padrão 20/máximo 50 |

Toda mutação recebe `operationId`, `expectedVersion` e `action`. Campos por ação:

| Ação | Autor e campos | Origem → destino |
| --- | --- | --- |
| AGREE | Lojista; text e agreementDate opcional/null | Aguardando/Combinado → Combinado |
| FULFILL | Lojista; nenhum campo financeiro/textual | Aguardando/Combinado → Realizado |
| REQUEST_CANCELLATION | Participante; text com motivo | Aguardando/Combinado → Cancelamento solicitado |
| REJECT_CANCELLATION | Lojista; text com motivo | Solicitado → estado anterior |
| CANCEL | Lojista; text, expectedBalance string, restock boolean; expectedStockRevision somente se repõe | Aguardando/Combinado/Solicitado → Cancelado |

Textos até 500 caracteres Unicode, não vazios. Data civil YYYY-MM-DD pode ser
passada e usa fuso congelado; não agenda evento externo nem retroage o horário
auditado. Revisar combinado conserva versões anteriores; remover data é explícito.
Solicitação bloqueia combinado e realização até decisão; recusa preserva pedido
e combinado e permite outro pedido. Realizado/Cancelado são terminais.

D03 permite tratar tickets pausados/encerrados; acesso revogado, suspensão ou
sessão inválida continuam bloqueando leitura e replay. Conversa mantém a audiência
T05, inclusive nos terminais. Tickets não expiram e realização não debita de novo.

## Dinheiro, estoque e auditoria

Uma transição confirma projeção, evento, eventual refund/reposição e outbox na
mesma transação do lock de loja. Cancelamento devolve o custo congelado uma vez,
inclusive com saldo negativo. `REDEMPTION_REFUND` referencia débito e evento,
aparece como **Devolução de resgate**, abre o ticket e não entra nos ganhos,
aprovações, pendências ou ajustes de atividade. Débito original permanece visível.

Reposição é uma escolha do lojista, desmarcada. Exige emissão e catálogo atual
limitados, estoque abaixo de 1.000.000 e revisão atual. Pode repor mimo arquivado,
sem disponibilizá-lo. Alteração incompatível exige revisão; cancelar sem repor é
uma decisão explícita, nunca uma mudança silenciosa da confirmação enviada.

Snapshots, eventos e ledger continuam imutáveis no runtime. Somente colunas de
andamento recebem UPDATE restrito; triggers/FKs/índices exigem estado, versão,
autor, refund, reposição e audiência correspondentes. A migração T09 aplicada
continua intacta; a evolução usa duas migrações aditivas. A segunda alinha a
validação SQL de espaços Unicode e caracteres de controle à validação da API.

Repetir a mesma UUID/corpo retorna o evento aplicado e o ticket atual autorizado,
mesmo após mudanças posteriores. UUID não troca ator, ticket, ação ou corpo.
Em resposta perdida, reload ou 429/503, consultar a intenção primeiro. A URL
guarda apenas UUID opaca; não guardar texto, motivo, saldo ou data privada em URL
ou localStorage. Resultado ausente exige revisão e confirmação explícita.
Conflitos usam 409; campos inválidos 400. Leitura 120/mutação 30 por minuto por conta.

Cada transição notifica somente a outra pessoa, via outbox REDEMPTION_UPDATED
referenciando evento/ticket reais. Entrega e destino reautorizam audiência;
resumo não inclui texto/motivo privado. Não há push ou canal externo novo.

## Verificação e limites

HTTP usa Auth/PostgreSQL/Storage reais, com crédito e resgate reais pela API.
Chromium controla respostas para verificar estados, privacidade e interação;
não é prova de persistência. Negação 401/403/404 retira toda a área privada.
Contador usa tickets ainda a realizar, mantendo pedidos em análise; terminais
saem do contador e permanecem no total histórico.

Execução, resultados e limitações ficam no [plano T10](superpowers/plans/2026-10-22-t10-realizacao-cancelamento.md).
