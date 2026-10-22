# Análise e extrato locais — T08

T08 integra decisões do lojista e complementos da participação ao registro real
de T07. D05 e os limites foram confirmados pelo idealizador em 22/10/2026;
[desenho](superpowers/specs/2026-10-22-t08-analise-extrato-design.md) e
[execução](superpowers/plans/2026-10-22-t08-analise-extrato.md) registram o contrato.

## Preparar e executar

Exige a stack `meumimo-t02` e as ferramentas de [mídia local](media-local.md).
Na raiz, execute em série:

```sh
npm --prefix web run local:prepare:t08
npm --prefix web run db:migrate:dev:t08
npm --prefix web run db:migrate:integration:t08
npm --prefix web run media:fixtures:t08
npm run check
npm --prefix web run db:migrate:check
npm --prefix web run test:integration:t08
npm run web:test:e2e
```

O preparo seleciona `meumimo_t08_dev` em `.env.local`; integração usa
`meumimo_t08` e shadow usa `meumimo_t08_shadow`. Os bancos são separados e
nenhum comando reseta uma base existente. Storage usa o bucket privado
`meumimo-t06-private`, com prefixos `t08-development`/`t08-integration` e
temporários em `.artifacts/t08-runtime/temp/`. Credenciais e artefatos ficam
fora do Git. O processo Next recebe somente o papel restrito e a chave pública.

Para desenvolvimento, mantenha cada processo em seu terminal:

```sh
npm run web:dev
npm --prefix web run media:dev:t08
npm --prefix web run outbox:dev:t08
```

Aplicação em 4301; integração inicia seu próprio Next em 4310 e mídia em 4311,
sempre em loopback. Não execute builds, typegen ou servidores concorrentes no
checkout. A integração controla processamento e entrega para reproduzir falhas;
não mantenha workers de integração em segundo plano. Para uma passagem manual:

```sh
npm --prefix web run media:once:t08
npm --prefix web run media:purge:t08
npm --prefix web run outbox:once:t08
```

## Estados e movimentos

| Ação | Resultado | Pontos |
| --- | --- | --- |
| Aprovar pendente/contestado | Aprovado | Crédito inicial ou recomposição se estornado; mantém crédito vigente |
| Contestar | Contestado | Mantém crédito existente; abre solicitação de complemento |
| Anular | Anulado | Estorna uma vez o crédito vigente; sem crédito, delta zero |
| Reabrir anulado | Em análise | Delta zero; só uma nova aprovação recompõe |
| Responder solicitação | Continua contestado | Delta zero; uma resposta por solicitação |

Motivo obrigatório para contestar, anular e reabrir, até 500 caracteres Unicode.
Aprovar usa motivo vazio. Complemento exige texto de até 500 caracteres ou uma
foto READY da revisão atual, podendo conter ambos. Cada nova contestação após
resposta abre outra revisão. Snapshot, legenda, foto inicial e ocorrência
recebida permanecem imutáveis. `approvedAt` conserva a primeira aprovação;
a análise mostra a aprovação mais recente e seu autor.

Decisão, versão, evento, ledger, retenção e outbox são gravados na mesma
transação. `ACTIVITY_CREDIT`, `ACTIVITY_REVERSAL` e `ACTIVITY_RESTORE` formam
uma cadeia de compensações sem UPDATE/DELETE. Total e projeções usam strings
decimais e BigInt, inclusive saldos negativos. A prévia do saldo é revalidada
antes da decisão; mudança exige revisar o impacto e confirmar novamente.

Pausa permite análise e complemento de uma origem real contestada, incluindo
upload. Encerramento exige resolver registros PENDING/CONTESTED e deixa análise
e extrato para consulta; replay confirmado continua disponível com acesso atual.
Comentários seguem as regras de T05. Revogação, suspensão ou troca de conta
retiram o acesso. Evidências permanecem protegidas durante análise/contestação.

## Contratos

Prefixo `/api/lojas/:storeId`:

| Método e recurso | Contrato |
| --- | --- |
| GET `/registros/:id` | Snapshot, análise atual, ações permitidas e impacto exato |
| POST `/registros/:id/analise` | `operationId`, `expectedVersion`, `action`, `reason`, `expectedBalance` |
| POST `/registros/:id/resposta` | `operationId`, `expectedVersion`, `requestId`, `evidenceRevision`, `text`, `evidenceAssetId` |
| GET `/registros/:id/operacoes/:operationId` | Evento aplicado e registro atual, reautorizados |
| GET `/registros/:id/historico` | Histórico paginado de recebimento, aprovação automática e revisões |
| GET `/pontos` | Saldo disponível, pendente, primeiras aprovações e ajustes do dia |
| GET `/pontos/movimentos` | Extrato paginado com `kind`, `from`, `to` e `membershipId` |

Lojista informa `membershipId` para consultar saldo individual; o extrato sem
esse filtro reúne a loja autorizada. Participante consulta apenas a própria
participação. Datas do extrato são inclusivas e interpretadas no fuso da loja.
Paginação padrão 20/máximo 50; leitura 120/min e mutação 30/min por conta.

Mutações usam UUID e digest imutáveis. Após resposta perdida, consultar operação
antes de reenviar o mesmo corpo. Replay devolve o evento original com estado
atual e não repete efeitos. Conflitos 409 incluem `review_changed`,
`balance_changed`, `operation_conflict` e `media_not_ready`; 429 informa espera.
Recursos privados indisponíveis respondem 404; sessão inválida responde 401.
Origin/CSRF, JSON limitado, identidade verificada e `no-store` seguem T02/T04.

As telas ficam em `/lojas/:storeId/registros/:id` e `/lojas/:storeId/extrato`.
Links com `?evento=UUID` consultam a operação antiga; filtros do extrato ficam
na URL. Novidades `SUBMISSION_REVIEWED`/`SUBMISSION_RESPONDED` usam outbox com
chave `submission.review:{eventId}`, destinatário derivado da origem e destino
reautorizado. A central completa permanece em T12.

## Limites desta entrega

Resgates e tickets são T09/T10. A prova de saldo negativo nesta etapa é
aritmética assinada e interface controlada, além do estorno real por HTTP.
O cenário completo gastar → anular → preservar ticket será verificado em T09;
nenhum débito fictício é introduzido no ledger para simular essa integração.
Dispositivos físicos, leitor de tela, CI remoto e publicação continuam pendentes.
