# Catálogo e resgates locais — T09

Desenho e D06/D04 confirmados em 22/10/2026. T09 entrega catálogo privado,
confirmação com saldo real, emissão atômica, estoque e histórico. Combinado,
realização e cancelamento/devolução serão implementados em T10; álbum em T11.

## Preparação

Com Docker Desktop ativo e a stack `meumimo-t02` preparada pelo onboarding:

```sh
npm --prefix web run local:prepare:t09
npm --prefix web run db:migrate:dev:t09
npm --prefix web run db:migrate:integration:t09
npm --prefix web run media:fixtures:t09
npm run check
npm --prefix web run db:migrate:check
npm --prefix web run test:integration:t09
npm run web:test:e2e
```

O preparo configura `.env.local` de desenvolvimento e grava segredos em
`.artifacts/t09-runtime/`, ignorados pelo Git. Não copie seu conteúdo para
relatórios. Bancos `meumimo_t09_dev`, `meumimo_t09_shadow` e `meumimo_t09`
permanecem separados. Migrações são aditivas; não use reset.
Next de integração usa4310 e mídia4311; desenvolvimento4301. Todas as portas
ficam em loopback. Build, typegen, servidores e modos de integração são seriais.

T09 usa as regressões de mídia com o bucket privado existente e namespaces
`t09-development`/`t09-integration`. Catálogo escolhe stickers locais, sem
pipeline de upload novo. Workers em terminais separados, quando necessários:

```sh
npm --prefix web run media:dev:t09
npm --prefix web run outbox:dev:t09
```

Consumidores não são iniciados em background durante as provas de falha:

```sh
npm --prefix web run media:once:t09
npm --prefix web run outbox:once:t09
```

## Contrato

Depois de `/api/lojas/:storeId`:

| Recurso | Comportamento |
| --- | --- |
| GET/POST `/mimos` | Lista privada/novo cadastro lojista; UUID de operação |
| GET/PATCH `/mimos/:id` | Detalhe com prévia participante/edição versionada |
| POST `/mimos/:id/arquivar` | Arquivo preserva os tickets |
| POST `/mimos/:id/resgatar` | UUID, versão e saldo esperado; ticket confirmado |
| GET `/mimos/:id/operacoes/:UUID` | Recupera ticket ou null depois de autorizar origem |
| GET `/tickets` | Histórico por período inclusivo no fuso, situação e pessoa autorizada |
| GET `/tickets/resumo` | Total e contador a realizar, sem depender da página/filtros |
| GET `/tickets/:id` | Vale, snapshot, emissão e conversa da relação |
| GET `/pontos/movimentos` | Inclui REDEMPTION_DEBIT com origem/link do ticket |

Cadastros até80 caracteres de nome/categoria, descrição/instruções1.000 e
recadinho500 Unicode. Custo1–1.000.000; estoque0–1.000.000 ou null ilimitado.
CRUD admite16KiB para permitir todos esses limites Unicode; outras rotas8KiB.
Leitura120/mutação30 por minuto por conta, página20/máximo50.

Edição confirma versão de configuração e revisão de estoque, identificada como
“Quantidade disponível agora”. Consumo limitado muda apenas revisão/quantidade;
um formulário antigo não pode repor o que foi gasto. Arquivo é irreversível
nesta etapa. Pausa permite editar catálogo, mas impede novos resgates.

Uma unidade emite um ticket, baixa estoque limitado, cria débito exato, evento,
conversa e aviso ao lojista na mesma transação do lock de loja. Runtime não
atualiza/exclui ledger, snapshots ou eventos. Triggers/FKs exigem origem e efeitos
correspondentes, inclusive reserva e saldo suficiente; RLS nega Data API direta.
Saldo usa todas as origens; pendência e cadeia financeira de conquista seguem
separadas. Anulação após gasto pode deixar saldo negativo e preserva o ticket.
Tickets existentes não impedem encerramento da loja/participação (D03).

UUID da intenção persiste na URL antes do POST. Após reload ou resposta perdida,
consultar a operação antes de tentar novamente. null exige prévia atual e nova
confirmação usando a mesma UUID. Mesmo corpo recupera o mesmo ticket; UUID não
troca autor, loja, mimo ou corpo. Nunca gravar saldo/conteúdo privado em URL ou
localStorage. 401/403/404 descartam área privada; 401 revalida sessão.

## Verificação

As provas HTTP usam Auth/PostgreSQL/Storage reais e créditos/gasto pela API.
Chromium usa respostas controladas para estados, teclado/foco e falhas; essa
camada não prova persistência. Evidências e limitações ficam no
[plano T09](superpowers/plans/2026-10-22-t09-catalogo-resgates.md).
