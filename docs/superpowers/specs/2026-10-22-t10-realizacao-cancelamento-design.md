# T10 — combinado, realização e cancelamento

Estado: desenho e complementos D04/T10 confirmados pelo idealizador em 22/10/2026,
com autorização para implementar e fazer commit. D03 e D06 já foram confirmadas. Este documento
não declara implementação, migração ou testes funcionais de T10.

Base observada: `753ae367c6619b5736fa39910aa03ab275e8c914`, T09 concluída e
árvore inicialmente limpa. A branch `codex/t09-catalogo-resgates` foi publicada
em `origin` a pedido do idealizador, com o mesmo SHA conferido no remoto.

## Objetivo e fronteiras

Completar L08/P09 no recorte de T10: registrar e revisar combinado, marcar
realização, pedir e resolver cancelamento, devolver pontos uma vez e oferecer
reposição explícita de estoque. Mostrar os acontecimentos na linha do tempo
privada, conservar a conversa e refletir a devolução no extrato real.

Preservar o vale, código, conteúdo, custo, data/fuso, saldos e reserva da emissão.
Não expirar tickets, debitar outra vez ao realizar ou converter devolução em
ganho por atividade. Álbum e publicação de mídia pertencem a T11; reações e a
central completa de novidades pertencem a T12; disputa após realização pertence
ao procedimento operacional de T14. Não oferecer controles fictícios desses
recursos.

Manter Next/React/TypeScript, Prisma/PostgreSQL, Auth/Storage locais, componentes
e fronteiras existentes, sem dependências novas, serviços pagos ou publicação.

## Abordagem

O roadmap e a arquitetura exigem estado, movimento compensatório e estoque
consistentes. Evoluir a máquina de estados do ticket na transação existente,
serializada pelo lock da loja e protegida por eventos imutáveis, é a abordagem
compatível com T07–T09. Uma carteira materializada acrescentaria reconciliação
sem necessidade demonstrada; estorno assíncrono deixaria o cancelamento sem
resultado financeiro confirmado. A implementação proposta conserva o saldo
calculado pelo ledger e a outbox transacional.

## Regras confirmadas que permanecem

- D03: tickets existentes podem ser tratados durante pausa e após encerramento
  da loja ou participação. Encerramento não equivale a revogação de acesso.
- D06: baixar estoque na emissão; cancelar somente antes da realização e
  devolver o custo da ocasião uma única vez. Reposição de estoque limitado
  exige escolha explícita do lojista, desmarcada inicialmente.
- Pedido de cancelamento em análise bloqueia realização. Recusa exige motivo
  e restaura o estado anterior. O lojista também pode iniciar cancelamento.
- Identidade e audiência atuais continuam obrigatórias. Suspensão, sessão
  inválida e revogação retiram acesso, inclusive ao replay. Administração não
  ganha acesso implícito a uma relação.
- Tickets não expiram. Conversa privada T05 permanece disponível conforme sua
  autorização atual, inclusive depois de realização, cancelamento e encerramento.

## Complementos confirmados para T10

1. Combinado e motivos usam texto simples, obrigatório quando aplicável, de
   até **500 caracteres Unicode**, sem aceitar apenas espaços ou Unicode
   inválido. Normalização e contagem seguem os validadores existentes.
2. Data do combinado é opcional, uma data civil válida `YYYY-MM-DD`, sem horário,
   interpretada no fuso congelado do ticket. Pode registrar uma data passada;
   isso não retroage a data do evento, altera pontos ou agenda notificações.
3. O lojista pode revisar texto/data enquanto o ticket estiver aberto; cada
   revisão preserva o combinado anterior em um evento. Omitir a data remove
   a data do combinado atual de forma explícita no formulário.
4. O lojista pode marcar realização tanto de **Aguardando combinar** quanto de
   **Combinado**, mediante confirmação. Não exigir um combinado fictício para
   registrar um mimo já entregue. Realizado e cancelado não reabrem em T10.
5. A reposição de uma unidade só pode ser escolhida quando o ticket
   consumiu estoque limitado e o catálogo continua limitado, com capacidade
   abaixo de 1.000.000. Não repor se a emissão foi ilimitada ou o catálogo agora
   é ilimitado. Se o limite foi alcançado, permitir cancelar sem reposição após
   revisão explícita. Não reduzir ou repor silenciosamente.
6. Arquivar ou indisponibilizar um mimo não impede devolver pontos nem repor
   uma reserva limitada elegível; reposição não desarquiva ou disponibiliza o
   mimo. Nenhuma ação usa o preço atual para calcular a devolução.

Os itens acima fecham detalhes não definidos em D06 e foram confirmados no aceite
deste desenho. Os demais detalhes técnicos deste desenho são escolhas
do implementador dentro dos contratos existentes.

## Máquina de estados e permissões

| Ação | Quem | Origem | Resultado e efeito |
| --- | --- | --- | --- |
| Registrar/revisar combinado | Lojista | Aguardando combinar ou Combinado | Combinado; texto/data auditados, sem movimento |
| Marcar realização | Lojista | Aguardando combinar ou Combinado | Realizado; um marco de realização, sem novo débito |
| Pedir cancelamento com motivo | Participante do ticket | Aguardando combinar ou Combinado | Cancelamento solicitado; guarda estado anterior e mantém combinado |
| Recusar pedido com motivo | Lojista | Cancelamento solicitado | Restaura exatamente Aguardando combinar ou Combinado; sem movimento |
| Confirmar/iniciar cancelamento com motivo | Lojista | Aguardando combinar, Combinado ou Cancelamento solicitado | Cancelado/estornado; devolução única e reposição opcional elegível |

Durante pedido pendente não permitir revisar combinado ou realizar. Uma recusa
não apaga o pedido e permite um novo pedido posterior, auditado separadamente.
O motivo do pedido e o da decisão ficam preservados. Cancelamento sempre exige
motivo do lojista, mesmo ao aceitar um pedido. Não há retirada unilateral de
pedido pelo participante neste recorte.

## Operações, concorrência e recuperação

Cada transição recebe UUID de operação, versão esperada do ticket e corpo
validado com campos permitidos. Cancelamento também confirma o impacto no saldo;
quando houver reposição, confirma a revisão de estoque observada. Textos, saldo,
datas privadas e destinatários nunca vêm de parâmetros de navegação nem de
identificadores de perfil fornecidos pelo cliente.

Na transação: revalidar identidade e audiência, bloquear loja, recuperar operação
existente, validar papel/versão/estado e impacto atual, atualizar projeção do
ticket, anexar evento, registrar devolução e eventual reposição, enfileirar aviso.
Tudo confirma ou reverte junto. Autor, horário, loja e participação vêm do
servidor. Apenas UUID opaca pode permanecer na URL para recuperar uma resposta.

Mesma UUID e corpo recuperam o evento aplicado e a visão atual autorizada do
ticket, mesmo depois de outras transições. A resposta distingue a operação
confirmada do estado atual. UUID não troca ação, autor, ticket, loja ou corpo.
Replay reautoriza antes de retornar, mas não repete efeitos nem exige a versão
antiga ainda vigente. UUID diferente com versão antiga retorna conflito.

Disponibilizar consulta autorizada de operação. Em resposta perdida, 503/429 ou
reload, consultar primeiro; não criar outra intenção enquanto o resultado for
incerto. Se não houver operação confirmada, exigir revisão atual e confirmação
explícita. Não guardar motivo/combinado/saldo em URL ou localStorage. Durante a
sessão, preservar rascunho, UUID e corpo; se a revisão mudar o corpo, resolver
antes a intenção anterior e iniciar outra UUID de forma explícita.

Realização × cancelamento, dois cancelamentos, recusa × confirmação, edição de
combinado × pedido e edição de estoque × reposição são serializados. Só uma
transição da versão observada vence. Estorno pode recompor um saldo negativo;
não depende de haver saldo suficiente. Datas de emissão, combinado, realização
e cancelamento permanecem distintas.

## Persistência, ledger e proteção SQL

Evoluir `Redemption` com versão e projeção do combinado, pedido e marcos, mantendo
snapshots da emissão imutáveis. Evoluir `RedemptionEvent` para ações repetíveis,
versão única por ticket, UUID/digest, autor/instante, estado anterior/novo,
texto/data, solicitação resolvida e impacto financeiro/estoque. Emissão antiga
recebe versão inicial compatível, sem trocar IDs ou apagar história.

Eventos, ledger e auditorias não recebem UPDATE/DELETE no runtime. Conceder
UPDATE somente às colunas de projeção necessárias, com guardas e auditoria
diferida que exijam evento válido correspondente. Validar matriz de transição,
papel, audiência, versões, motivos, preservação de snapshots e marcos. Cada
pedido tem no máximo uma resolução; cancelado/realizado são terminais.

Adicionar `REDEMPTION_REFUND` positiva, igual ao custo congelado, ligada ao
cancelamento e ao débito original. Substituir a unicidade global de
`PointsEntry.redemptionId` por unicidades que permitam no máximo um débito e
uma devolução por ticket. Origem de conquista continua exclusiva da origem de
resgate. Preservar os triggers fortalecidos e a cadeia de compensações de T08.
Devolução não usa evento de análise de atividade nem altera a ocorrência.

Cancelamento exige seu evento, movimento de devolução e aviso na mesma
transação; devolução exige cancelamento correspondente, autor, valor e contexto
exatos. Reposição exige consumo limitado original, escolha auditada, uma unidade
e revisão de estoque correspondente, sem auditoria administrativa conflitante.
Não autorizar alterações livres de estoque ou duplo uso de uma mesma reposição.

O saldo disponível soma todas as espécies com SUM→texto/BigInt. Pendência,
créditos/ajustes diários e métricas de atividade mantêm seus filtros: devolução
não aumenta conquistas ou ganhos de atividade. Extrato identifica **Devolução
de resgate** e abre o ticket autorizado; débito e devolução continuam visíveis.

Usar migração nova e aditiva, com RLS/grants e FKs compostas. Não editar nenhuma
migração aplicada, especialmente os bytes preservados da migração T09. Separar
etapas do verificador para comprovar emissão T09 antes da evolução e preservação
dos dados após T10, incluindo IDs, snapshots, eventos, débitos e saldos.

## API, audiência e notificações

Rotas de ticket sob `/api/lojas/:storeId/tickets/:ticketId` continuam privadas.
Acrescentar transição, consulta de operação e eventos paginados; GET do detalhe
entrega estado, versão, combinado atual e ações/impactos autorizados. Não
carregar uma linha do tempo ilimitada no detalhe. Paginação padrão 20/máximo
50; ordem estável pela versão e ID do evento.

Reutilizar limite de leitura 120/minuto e mutação 30/minuto por conta, CSRF e
Cache-Control privado/no-store. Participante acessa somente seu ticket e pode
pedir cancelamento; lojista trata os tickets das relações autorizadas. Ações
proibidas não são liberadas por campos do cliente.

A outbox recebe referência ao evento de transição, com contexto validado.
Combinado, realização, recusa e cancelamento avisam o participante; pedido avisa
o lojista. Não notificar o autor sobre sua própria ação. Uma operação gera um
aviso, sem duplicação no replay ou na entrega concorrente. Destino reautoriza
ticket/evento e, quando aplicável, o movimento de devolução. Não enviar push,
e-mail ou mensagens externas novas nesta etapa.

## Interface e acessibilidade

Manter vale, snapshot, conversa, retorno ao histórico/extrato com filtros e
participante identificado somente na visão autorizada do lojista. Acrescentar
combinado/data atuais e ações disponíveis no estado atual.

- Lojista: formulário de combinado, confirmação de realização e cancelamento
  com motivo, custo devolvido, saldo resultante e checkbox de reposição
  inicialmente desmarcado. Ao resolver pedido, mostrar o motivo original e
  oferecer aceitar/cancelar ou recusar com justificativa.
- Participante: pedir cancelamento com motivo nos estados abertos; durante
  análise, mostrar que o pedido aguarda decisão e bloqueia realização.
- Terminais: mostrar resultado, autor/data e devolução/reposição confirmadas,
  sem controles de reabertura. Manter saldos da emissão rotulados como históricos.
- Linha do tempo paginada preserva emissão, revisões do combinado, realização,
  pedidos e decisões, com textos, autor, instante/fuso e efeitos reais.
- Atualizar contador compartilhado e saldo após transições. Pedido continua
  contando como pendente; realizado/cancelado saem do contador. Total histórico
  não diminui. Extrato apresenta a nova espécie e filtros compatíveis.

Reutilizar Dialog e padrões existentes: labels, descrição de erro, primeiro
campo inválido focado, Tab/Shift+Tab/Escape, fechamento e retorno do foco. Após
sucesso, focar resultado estável quando o acionador desaparecer; atualizações
secundárias não roubam foco. Respeitar 320/390 px, texto 200%, alvos de 44 px e
movimento reduzido.

401/403/404 de detalhe, eventos, operação, transição, saldo ou conversa acionam
RewardAccess e descartam conteúdo privado/navegação. Trocar conta/loja/ticket
aborta respostas antigas e descarta rascunhos privados. Conflito preserva texto
em memória, exibe o estado atual e exige revisão antes de confirmar outra ação.

## Aceite e execução proposta

1. Registrar/revisar combinado com/sem data; realizar uma vez dos dois estados
   abertos; nenhuma dessas ações altera pontos ou estoque.
2. Pedido bloqueia combinado/realização; recusa motivada restaura ambos os
   estados possíveis e conserva pedido/combinado. Novo pedido não apaga o anterior.
3. Cancelar direto ou aceitar pedido devolve exatamente o custo congelado uma
   vez. Repetições e resposta perdida não duplicam evento, devolução, estoque
   ou aviso. Saldo negativo também recebe a devolução correta.
4. Reposição desligada por padrão; testar emissão limitada/ilimitada, catálogo
   alterado/arquivado, teto, revisão antiga e reposição concorrente com edição
   ou consumo. Conflito não causa estorno parcial nem reposição silenciosa.
5. Realização × cancelamento e demais corridas produzem um vencedor por versão.
   Falhas forçadas em projeção/evento/ledger/estoque/outbox revertem tudo.
6. SQL runtime rejeita estado sem evento, cancelamento sem devolução, devolução
   sem cancelamento, valor/contexto/autor trocados, duas devoluções, resolução
   duplicada e alteração de snapshots/eventos. Migração preserva dados T07–T09.
7. Pausa e encerramento preservam tratamento/conversa. Revogação/suspensão,
   duas participações e lojas distintas preservam isolamento em leitura,
   mutação, replay, paginação, extrato e notificação.
8. Chromium cobre estados, motivos Unicode/limites, teclado/foco, 320/390 px,
   texto 200%, movimento reduzido, 401/403/404, conflito, 429/503, resposta
   perdida/reload e troca de contexto. HTTP real prova persistência e dinheiro.

Orquestração proposta: contratos/schema primeiro; escritores separados para
domínio/API, UI/E2E e HTTP; root integra migração, scripts, documentos e executa
Git/checks/serviços em série. Revisão independente somente leitura, correções
verificadas e commit final solicitado. Recursos locais T10 separados em
domínio/dev/shadow, prefixos próprios, Next 4310/mídia 4311 em loopback e stack
Auth existente. Não executar builds/typegen/serviços simultâneos no checkout.

## Fontes e preparação

Fontes: requisitos RF-12/RF-16/RF-18/RF-19/RF-23, RNF-03/RNF-11/RNF-19,
D03–D06; design L08/P09 e §§14–15; arquitetura §§3.4–5; roadmap T10 e fronteiras
T11/T12/T14; implementação e desenho aprovado de T09.

Três reconhecimentos somente leitura examinaram domínio/SQL, UI e testes/runtime.
O builder check independente leu este desenho e não encontrou lacunas materiais
para planejar a implementação (`nothing important left`).
Context7 foi descoberto no cliente; consultas de APIs serão feitas quando a
implementação aprovada exigir uso ou alteração de APIs de versão. Nenhum código
de produto, serviço ou banco foi alterado nesta preparação.
