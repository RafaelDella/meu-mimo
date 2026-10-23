# Relação, novidades e painéis locais — T12

T12 reúne bilhetes individuais, reações, mural, central de novidades e painéis
com os dados privados da loja. Reutiliza as conversas de registros/tickets,
o extrato, o catálogo e os álbuns; cada relação mantém sua própria audiência.

Estado: **implementada e verificada localmente**. Prisma foi gerado e validado.
A prova de evolução executada no PostgreSQL local passou pelas quatorze
migrações, preservação dos dados anteriores, 37 tabelas com RLS e privilégios
efetivos. A revisão independente de SQL não encontrou problemas P1/P2 nessa
prova. A migração T12 foi aplicada aos bancos de desenvolvimento e integração,
e nove arquivos sintéticos de mídia foram preparados. Os checks passaram;
319 casos HTTP distintos e 672 cenários Chromium foram cobertos em execuções
serializadas e repetições focais. Ocorrências e limites estão no plano T12.
Essa evidência local não declara publicação ou validação física.

## Preparação e execução

Usar Node.js 24, pacotes e Docker Desktop com engine Linux conforme o
[onboarding](onboarding.md). PostgreSQL, Auth e Storage continuam na stack
local existente `meumimo-t02`, com volumes persistentes. Não criar outra
instalação PostgreSQL nem resetar os bancos das etapas anteriores.

Na raiz, com a stack ativa:

```sh
npm --prefix web run local:prepare:t12
npm --prefix web run db:migrate:dev:t12
npm --prefix web run db:migrate:integration:t12
npm --prefix web run media:fixtures:t12
```

Os recursos reservados são:

| Recurso | Desenvolvimento | Integração |
| --- | --- | --- |
| Banco PostgreSQL | `meumimo_t12_dev` | `meumimo_t12` |
| Banco shadow | `meumimo_t12_shadow` | Separado dos dados de integração |
| Namespace de Storage | `t12-development` | `t12-integration` |
| Next | `127.0.0.1:4301` | `127.0.0.1:4310` |
| Gateway e processamento de mídia | `127.0.0.1:4311` | `127.0.0.1:4311` |

Auth/Storage usam `127.0.0.1:54321`, PostgreSQL usa `127.0.0.1:54322` e a
caixa de mensagens local usa `127.0.0.1:54324`. Desenvolvimento e integração
compartilham as portas de mídia e devem rodar em série. Builds, typegen e
servidores também permanecem serializados neste checkout.

O preparo seleciona desenvolvimento em `web/.env.local`. Estado de execução,
credenciais e provas ficam ignorados em `.artifacts/t12-runtime/`. O processo
Next recebe conexão restrita e os segredos próprios do gateway; credenciais
administrativas de Auth/Storage, migração e fixtures pertencem aos processos
separados. Não copiar esses valores para o navegador ou Git.

Para usar a versão de desenvolvimento, abrir três terminais na raiz:

```sh
npm run web:dev
```

```sh
npm --prefix web run media:dev:t12
```

```sh
npm --prefix web run outbox:dev:t12
```

A outbox entrega novidades no PostgreSQL local. Mantê-la ativa para que
bilhetes e interações apareçam na central após a confirmação da origem.
Os arquivos sintéticos de mídia são fixtures de teste e não representam
contas, saldo ou conteúdo real de desenvolvimento.

Com os servidores de desenvolvimento encerrados, executar as verificações em
série; os comandos abaixo não constituem um registro de aprovação:

```sh
npm run check
npm --prefix web run db:migrate:check
npm --prefix web run test:integration:t12
npm run web:test:e2e
```

Não alterar as quatorze migrações já aplicadas. Uma correção posterior de
persistência exige migração aditiva e nova prova de preservação.

## Bilhete privado e leitura exata

O lojista envia texto simples obrigatório de até 2.000 caracteres Unicode
para uma participação. Há um bilhete atual por relação, com versões imutáveis.
Pausa permite enviar/substituir; encerramento da loja ou participação mantém
consulta e leitura das versões, bloqueando novos envios.

Ler a versão 1 confirma somente a versão 1. Se chegar uma versão 2 enquanto o
painel estiver aberto, ela continua não lida até ser aberta explicitamente.
Marcar uma novidade como lida não confirma a leitura do bilhete. O lojista
não recebe recibo, estado de não lido nem contagem de leituras em seus DTOs,
painéis ou acontecimentos.

Envio usa UUID de operação, corpo estável e versão esperada; a primeira escrita
espera zero. Resposta perdida exige consultar a operação antes de repetir.
Replay retorna o resultado aplicado e a visão atual autorizada sem novo aviso.
Conflito exige revisar a versão atual. Texto e rascunhos ficam em memória,
fora de URLs, armazenamento do navegador, logs e mensagens de erro.

Rotas sob `/api/lojas/:storeId`:

| Método e recurso | Uso |
| --- | --- |
| GET `/bilhete` | Bilhete atual da própria participação e indicador privado |
| GET `/participacoes/:membershipId/bilhete` | Consulta do lojista sem recibo |
| PATCH mesma rota | `{operationId,expectedVersion,text}` envia uma versão |
| GET mesma rota `/operacoes/:operationId` | Recupera a intenção autoral autorizada |
| GET `/bilhetes/versoes/:versionId` | Consulta a versão exata daquela audiência |
| POST mesma rota `/lida` | `{}` confirma somente a versão mostrada ao destinatário |

## Reações, mural e painéis

As seis opções são **❤️, 👏, 🥹, 🔥, 😂 e 🌷**. Cada pessoa mantém uma reação por
registro/ticket, podendo trocar ou remover. A API recebe o estado desejado,
inclusive `null` para remoção, UUID e versão esperada; repetição não funciona
como alternância. Trocar/adicionar avisa a outra pessoa; remoção e operação
sem mudança não geram aviso.

A escrita segue `Conversation.writable`: uma conversa aberta pode receber
reações no histórico de relação encerrada; `commentsClosedAt` permite somente
consulta. Revogação ou suspensão do acesso elimina consulta, mutação e replay.
Reações, comentários e bilhetes não movimentam pontos, estoque ou tickets.

| Método e recurso sob `/api/lojas/:storeId` | Uso |
| --- | --- |
| GET `/conversas/:conversationId/reacao` | Estado e permissões atuais |
| PUT mesma rota | `{operationId,expectedVersion,emoji}` |
| GET mesma rota `/operacoes/:operationId` | Recuperação da intenção |
| GET `/mural` | Registros recebidos e tickets emitidos, sem rascunhos |
| GET `/resumo` | Resumo do lojista e checklist derivado de dados reais |
| GET `/lojinha` | Início do participante, saldo, atividades, vitrine e bilhete |
| GET `/participacoes/:membershipId/resumo` | Detalhe autorizado da pessoa |
| GET `/resumo/acontecimentos` | Acontecimentos paginados da loja |

O participante consulta somente a própria relação. O lojista pode filtrar
o mural por pessoa; tipos, estados e período são filtrados no servidor.
O mural usa a data original de recebimento/emissão e a conversa existente.
Mídia não publicada permanece privada. Saldo disponível e pendente continuam
separados, com valores de pontos em strings e possibilidade de saldo negativo.
Pendências de tickets de participações encerradas continuam nos painéis.

## Central, agrupamento e preferências

A central fica em `/notificacoes`, com filtros por loja e categoria. Cada
OutboxEvent/Notification permanece individual; o grupo é uma projeção com
versão. Comentários e reações são agrupados por destinatário, loja, ator e
conversa em janelas de cinco minutos. Bilhetes, análises, tickets e publicações
de álbum ficam separados. Um álbum continua gerando uma novidade por publicação,
sem multiplicação pelo número de arquivos.

A leitura recebe a versão exibida do grupo e marca somente membros até ela.
Uma entrega posterior, inclusive de evento antigo, avança a versão e permanece
não lida. Versão futura é recusada. O contador considera grupos não lidos com
aviso ativo, sem somar cada arquivo ou cada interação de um grupo.

Preferências começam com interações sociais ativas (`socialMuted=false`) e
aviso de aprovação automática ligado (`automaticApprovalNotices=true`), versão
virtual zero até a primeira escrita. Silenciar afeta somente o contador;
histórico, central e `readAt` permanecem intactos. Reativar recompõe o contador
dos não lidos. Decisões manuais, cancelamentos e devoluções continuam visíveis.
O recebimento automático de T07 avisa o lojista; não cria um aviso para a
própria pessoa que enviou o registro. A preferência afeta o destinatário desse
aviso, preservando o resultado e a consulta do participante.

| Método e recurso | Uso |
| --- | --- |
| GET `/api/notificacoes/grupos` | `storeId`, `category`, `page` e `pageSize` |
| POST `/api/notificacoes/grupos/:groupId/lida` | `{throughVersion}` observada |
| GET `/api/notificacoes/grupos/:groupId/destino` | Resolve destino sob audiência atual |
| GET `/api/lojas/:storeId/preferencias/notificacoes` | Preferências do próprio vínculo |
| PATCH mesma rota | `{operationId,expectedVersion,socialMuted,automaticApprovalNotices}` |
| GET mesma rota `/operacoes/:operationId` | Consulta a intenção daquele vínculo |

As rotas individuais de notificações T05 permanecem disponíveis. Categorias
são `NOTES`, `ACTIVITIES`, `REWARDS` e `SOCIAL`; convite aceito entra em
`ACTIVITIES`, preservando o tipo específico do evento. Abrir outra loja exige
resolver novamente o destino autorizado e mostrar seu contexto.

## Atualização e fronteiras

Consultas visíveis são atualizadas inicialmente a cada trinta segundos,
centralizadas por conta/sessão/loja, sem sobreposição ou polling em aba oculta.
Retorno à aba, foco e reconexão provocam nova consulta autorizada. Isso não
representa transporte Realtime nem entrega por push.

Paginação padrão vinte/máximo cinquenta, limite de 120 leituras e trinta
mutações por minuto por conta, CSRF e respostas privadas `no-store` permanecem.
Troca de conta/contexto aborta respostas antigas; erros de acesso retiram dados
privados. A versão web local é a prioridade confirmada. Hospedagem, domínio,
custos, publicação e aparelhos físicos foram adiados pelo usuário.

As decisões completas estão no [desenho T12](superpowers/specs/2026-10-22-t12-relacao-paineis-design.md)
e a execução/evidência no [plano T12](superpowers/plans/2026-10-22-t12-relacao-paineis.md).
Os limites de mídia e retenção continuam em [mídia local](media-local.md) e
[álbum local](albums-local.md).
