# Álbum privado local — T11

O álbum pertence a um ticket real. Somente o lojista autor envia/publica/remove;
a participante vê os momentos publicados daquela relação. Pontos, estoque,
estado e combinado do ticket permanecem independentes das mídias.

## Preparação

Com Docker Desktop Linux, stack `meumimo-t02` e pacotes do onboarding ativos:

```sh
npm --prefix web run local:prepare:t11
npm --prefix web run db:migrate:dev:t11
npm --prefix web run db:migrate:integration:t11
npm --prefix web run media:fixtures:t11
npm run check
npm --prefix web run db:migrate:check
npm --prefix web run test:integration:t11
npm run web:test:e2e
```

PostgreSQL local usa `meumimo_t11_dev`, `meumimo_t11_shadow` e `meumimo_t11`;
Storage usa `t11-development`/`t11-integration`. Auth/Storage continuam na stack
existente, sem reset dos bancos anteriores. O preparo seleciona desenvolvimento
em `.env.local`; credenciais e provas ficam ignoradas em `.artifacts/t11-runtime`.
Next de desenvolvimento atende em 4301; integração usa 4310 e mídia 4311,
somente loopback e em série com outros servidores/builds/typegen deste checkout.

Em terminais separados para usar desenvolvimento:

```sh
npm run web:dev
npm --prefix web run media:dev:t11
npm --prefix web run outbox:dev:t11
```

Next recebe conexão restrita e segredo do gateway. Credenciais administrativas
de Auth/Storage e migração ficam nos processos próprios, fora do navegador.

## Publicação e recuperação

Selecionar/enviar usa o transporte T06 com partes persistidas. READY ainda é
rascunho: revisar seleção, ordem e legendas, depois confirmar de um a dez itens
prontos. Falhas e arquivos não escolhidos continuam privados. Limite de vinte
itens ativos inclui rascunhos, falhas e envios; remoção própria libera vaga.
Fotos e vídeos preservam formatos, tamanhos e duração D07/T06.

Legenda opcional tem até 500 caracteres Unicode; espaços viram texto vazio.
Legenda e ordem publicadas são imutáveis; novos lotes entram ao fim. Rascunhos de
texto/ordem ficam em memória, exigindo nova revisão após reload. A intenção de
publicação usa UUID/corpo estáveis e consulta antes de repetir resposta perdida,
429 ou 503. Conflito exige revisão explícita. URL conserva só UUID opaca.

API base `/api/lojas/:storeId/tickets/:ticketId/album`:

| Recurso | Contrato |
| --- | --- |
| GET | Página 20/máximo 50, permissões atuais, publicados e versão; leitura não cria |
| POST `/iniciar` | `{operationId}` cria/recupera álbum e coleção da origem real |
| POST `/publicacoes` | `{operationId,expectedVersion,items:[{assetId,caption}]}`; evento aplicado e visão atual |
| GET `/operacoes/:UUID` | Operação autoral daquela origem ou ausência autorizada |

Publicação, itens/posições, `publishedAt`, versão e outbox única confirmam na
mesma transação. Remoção usa a rota T06 existente, registra evento e oculta no
mesmo commit. Itens e eventos permanecem no histórico. URLs temporárias/Range
reautorizam audiência e estado, inclusive após remoção, revogação ou vencimento.
Coleções MEMORY antigas sem álbum/ticket correspondente ficam inacessíveis.

## Retenção e limites

Ticket cancelado permite consulta e remoção própria, bloqueando novos envios e
publicação. Pausa e encerramento permitem novos momentos até doze meses de
calendário do primeiro encerramento da loja ou participação; novos lotes não
reiniciam prazo. Ticket pendente protege mídias existentes após esse prazo,
mas não permite novas. Realizar/cancelar libera a proteção e aplica o prazo
original, com negação imediata de derivados vencidos antes do expurgo.

Galeria usa foto ampliada em diálogo e vídeo com controles, sem autoplay.
Negação 401/403/404 de qualquer fonte retira a área privada; 410 permite renovar
o acesso sob autorização atual. A novidade é uma por publicação, para a outra
pessoa, sem legenda privada no resumo e sem push externo.

Evidências reais, revisão e limitações ficam no [plano T11](superpowers/plans/2026-10-22-t11-album.md).
Web local é a prioridade confirmada. Aparelhos físicos, leitor de tela real,
publicação e provedores continuam adiados; testes de navegador controlados
não substituem a prova HTTP com Auth/PostgreSQL/Storage reais.
