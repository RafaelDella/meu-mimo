# T09 — catálogo, resgate e histórico de tickets

Estado: desenho, D06 e limites D04 confirmados pelo idealizador em 2026-10-22,
com autorização para implementar, verificar e fazer commit ao concluir.
Base observada: `e35356f`, T08 concluída, árvore inicialmente limpa.
Este desenho não declara implementação, migração ou testes funcionais de T09.

## Objetivo e fronteiras

Entregar L06/L07 e P06–P09 na extensão prevista pelo roadmap: catálogo editável,
vitrine privada da loja, confirmação de resgate com saldo real, emissão única
de ticket, baixa de estoque e débito consistentes, histórico e extrato.

O ticket nasce **Aguardando combinar**. Ambas as pessoas podem conversar nele
pela infraestrutura de T05. Registrar combinado, realizar, solicitar/recusar
cancelamento, devolver pontos e eventualmente repor estoque pertencem a T10.
Álbum, uploads e publicação de momentos pertencem a T11. Não oferecer controles
falsos desses recursos nem gerar dados ou saldo de demonstração.

Preservar Next/React/TypeScript, PostgreSQL/Prisma 7, Auth/Storage locais e os
documentos existentes. Sem dependências novas, serviços pagos ou publicação.

## Abordagem e decisões de implementação

O roadmap já exige ticket, débito, estoque e evento na mesma operação. Reutilizar
o lock de loja e a transação existentes, com saldo calculado pelo ledger, é a
abordagem compatível com T07/T08. Carteira materializada acrescentaria uma segunda
representação para reconciliar sem necessidade demonstrada; execução assíncrona
da emissão mudaria a confirmação síncrona requerida pelo produto.

Decisões do implementador propostas para este recorte:

- Detalhe do mimo em página secundária responsiva e confirmação no `Dialog`
  existente. Preserva URL, retorno e comportamento de teclado da fundação.
- Ilustrações/stickers locais selecionáveis (`gift`, `coffee`, `takeout`,
  `envelope`), como permite L07. Upload de imagem de catálogo não é parte deste
  recorte: evidência/memória de T06 pertence a uma participação, enquanto a
  imagem do catálogo é compartilhada pela loja.
- Categorias em texto, com sugestões “A dois”, “Pra você” e “Surpresas”, sem
  tabela própria. O catálogo continua editável além dos nomes de demonstração.
- Uma versão de configuração e uma revisão de estoque separadas. A edição
  administrativa confirma ambas, impedindo que um formulário antigo reponha
  unidades consumidas. Outro resgate não muda preço/regra de um mimo ilimitado.
- Não persistir ticket em rascunho. A UUID da intenção é também o identificador
  do ticket confirmado; referência opaca na URL permite consultá-lo após reload.

## D06 e limites confirmados

**D06 confirmada:** estoque limitado é baixado na emissão do ticket. Cancelamento
antes da realização devolve pontos uma vez; reposição de estoque limitado exige
escolha explícita do lojista, desligada por padrão. Pedido de cancelamento em
análise impede realização; recusa motivada restaura o estado anterior. Disputa
após realização terá procedimento operacional definido em T14. Em T09 somente
a emissão/baixa é executada; as transições e devoluções serão implementadas em T10.

**D04 confirmados para T09:** custo inteiro entre 1 e 1.000.000 pontos; quantidade
limitada inteira entre 0 e 1.000.000 unidades; zero significa esgotado; ilimitado
tem quantidade nula. Nome até 80 caracteres, categoria até 80, descrição e
instruções até 1.000 cada, recadinho do catálogo até 500 caracteres Unicode.
Textos são simples; recadinho e instruções opcionais. O formulário identifica
a quantidade como **“Quantidade disponível agora”**.

Nome, paginação padrão 20/máximo 50, leitura 120/minuto e mutação 30/minuto por
conta seguem os limites já confirmados. Não há quantidade por compra: cada
confirmação emite um ticket para uma unidade. Tickets não expiram no MVP.

## Catálogo e disponibilidade

Lojista cria, edita, disponibiliza/indisponibiliza e arquiva mimos, inclusive
durante pausa. Loja/participação encerradas permitem consulta. Arquivar retira
o mimo de novos resgates e preserva tickets; não haverá desarquivamento em T09.

O cadastro contém nome, descrição, recadinho compartilhado, categoria, sticker,
custo, instruções, disponibilidade e estoque ilimitado/quantidade. Prévia de
card e vale não persiste nem emite ticket. Alterações usam UUID/digest e versões.

Participante consulta catálogo da própria loja, com busca, categoria e páginas.
O lojista também filtra cadastros arquivados. Item indisponível/esgotado tem
estado legível, sem expor quem resgatou. Detalhe arquivado pode ser consultado
pela relação autorizada, mas não aceita resgate. Catálogo não é público.

Saldo aprovado e pontos em análise permanecem separados. Com saldo suficiente,
mostrar “Já pode ser seu”; sem saldo, informar o valor exato que falta e ligar
às atividades. Saldo negativo continua visível como ajuste. Quantos pontos
faltam usa o saldo disponível real, inclusive quando negativo.

## Confirmação e transação de resgate

O servidor entrega uma prévia autorizada com versão, custo, saldo disponível,
pendente, saldo após resgate e situação de disponibilidade. A confirmação mostra
loja, mimo, uma unidade, custo e saldo restante. O lojista não resgata na própria
loja. Mimo indisponível, esgotado ou arquivado, loja pausada/encerrada e participação
encerrada bloqueiam nova emissão. Identidade, papel e autoria vêm do servidor.

Para operação nova, na transação: revalidar acesso; bloquear a loja; recuperar
UUID; validar estado, versão de configuração, saldo esperado e saldo suficiente;
validar estoque; guardar snapshot do mimo e saldo antes/depois; baixar uma unidade
limitada; emitir ticket/código; registrar evento, débito, conversa e outbox;
marcar início do domínio. Tudo confirma ou reverte junto. Não enviar bytes ou
mensagens externas dentro dessa transação.

Mudança de custo/regra exige revisão explícita; mudança de saldo também.
Esgotamento ou indisponibilidade durante a confirmação não descontam pontos.
Estoque restante pode mudar com outros resgates sem invalidar preço/regra: o
servidor confirma apenas se ainda houver uma unidade. Edição administrativa
conflitante não sobrescreve consumo ocorrido depois de abrir o formulário.

Replay idêntico recupera o mesmo ticket antes de validar saldo/versão/pausa
atuais, mas depois de revalidar acesso. Mesma UUID não troca autor, loja, mimo
ou corpo. Revogação e suspensão prevalecem sobre recuperação de operação.

Em falha 503/429 ou resposta perdida, preservar UUID e corpo e consultar a
operação antes de repetir. UUID opaca na URL sobrevive ao reload; custo, saldo,
recadinho e demais dados privados não são gravados na URL ou localStorage.
Ao recarregar, consultar primeiro o ticket daquela intenção. Se não confirmado,
reabrir a revisão com dados atuais e exigir confirmação, reutilizando a UUID;
uma resposta tardia da tentativa anterior não pode virar uma segunda cobrança.
Conflito de corpo exige consultar o resultado autorizado antes de oferecer
outra intenção. “Resgatar novamente” só inicia outra UUID como ação explícita.

## Ledger, estoque e migração

Preservar nomes conceituais `Reward`, `Redemption` e `RedemptionEvent`; “ticket”
é a apresentação do resgate. `RewardEvent` audita configurações. O resgate guarda
nome, descrição, categoria, recadinho, instruções, sticker, custo e versão da
ocasião, autor, instante, data/fuso, código, estado e dados da reserva de estoque.
Snapshots e eventos confirmados não recebem UPDATE/DELETE no runtime.

`PointsEntry` passa a ter exatamente uma origem: conquista ou resgate. A espécie
nova `REDEMPTION_DEBIT` é negativa, corresponde ao custo congelado e é única por
ticket. Atividades mantêm suas espécies e cadeia de compensações, com origem
de resgate nula; débitos de ticket têm origem de conquista nula. Usar verificações
explícitas de não nulidade nos CHECKs, preservando FKs compostas e os triggers
fortalecidos de T08. Não reescrever migrações aplicadas.

Banco exige ticket/evento/débito correspondentes, sinal e custo exatos, reserva
limitada consistente e saldo suficiente na emissão. A prova deve rejeitar débito
sem ticket, ticket gratuito, contexto trocado, estoque negativo, consumo duplicado
e reescrita de histórico. RLS/grants e Data API restritos continuam obrigatórios.

O saldo disponível soma todas as origens. Pendência, ganhos por atividade e
ajustes da conquista continuam filtrados por sua origem/espécie; gasto de ticket
não altera a soma original daquela atividade nem vira crédito pendente.

D05 já está confirmada: contestar mantém crédito; anular após gastar pode deixar
saldo negativo e preserva o ticket. Reabrir não recompõe; nova aprovação recompõe
uma vez. T09 comprova esse fluxo com créditos e gasto reais. Novo resgate precisa
de saldo suficiente. Ticket existente não impede encerrar loja ou participação.

## Telas, histórico e integrações

- Lojinha recebe potinho real e entrada da vitrine; catálogo completo em Mimos.
  A composição completa do painel e o bilhete privado continuam em T12.
- Lojista tem Mimos com Catálogo/Resgates, cadastro/edição e arquivo confirmado.
- Participante tem Meus mimos com Tickets/Extrato. Preservar `/extrato` e links
  existentes; abas usam rotas, sem duplicar o extrato. Cada débito abre o ticket.
- Ticket mostra vale, código, estado, custo, data/fuso, conteúdo da ocasião,
  participante apenas na visão do lojista, evento de emissão e conversa privada.
  Não há ação para realizar/cancelar nem álbum vazio fictício nesta etapa.
- Histórico filtra período inclusivo no fuso da loja, estado e, para lojista,
  pessoa. Participante consulta apenas os próprios tickets. Ordenação estável,
  paginação e retorno preservam filtros.
- Contador considera tickets ainda a realizar, independentemente da página e
  dos filtros do histórico; não usa o total histórico. T09 emite somente o estado
  inicial; combinado/cancelamento solicitado contam enquanto pendentes, e
  realizado/cancelado não contam quando essas transições forem integradas em T10.
- Aviso de resgate vai somente ao lojista pela outbox, uma vez, com destino
  reautorizado. Comentários do ticket resolvem sua origem real. A central completa
  de novidades segue em T12.

Todos os recursos descartam dados privados em 401/403/404; 401 revalida a sessão.
Isso inclui saldo, contador, pessoas, extrato e consulta da operação. Troca de
conta/loja aborta respostas antigas. Conflitos preservam formulário/motivo e
exigem revisão; falhas transitórias permitem consulta/tentativa explícitas.

## Aceite e execução proposta

1. Crédito real → resgate: um ticket, um débito, reserva, evento, conversa e
   outbox; saldo igual à soma do ledger. Editar/arquivar não muda o ticket.
2. Dois resgates com saldo para um, dois participantes na última unidade e
   repetições da mesma UUID: nenhuma duplicação ou efeito parcial.
3. Falha forçada em ticket, ledger, estoque/evento, conversa ou outbox reverte
   tudo; repetir depois recupera uma única emissão.
4. Crédito 15 → resgate 10 → anulação −15: saldo −10 e ticket preservado; novo
   resgate negado. Reabrir não movimenta; aprovar recompõe uma vez.
5. Edição de quantidade desatualizada, mudança de saldo/preço/estado, pausa e
   encerramento concorrentes serializam com a emissão. Histórico e replay
   confirmado permanecem autorizados; revogação retira o acesso.
6. Filtros/páginas/contador/origens/notificações não misturam pessoas/lojas;
   administrador não tem bypass e lojista não pontua na própria loja.
7. Chromium 320/390, teclado/Tab/Escape/foco, alvos de toque, texto 200%, movimento
   reduzido, saldo exato/negativo, resposta perdida/reload e 401/403/404.

Orquestração: contratos/schema primeiro; escritores separados para domínio/API,
UI/E2E e HTTP. Root integra serviços compartilhados, migrações/scripts/docs e
executa checks/Prisma/serviços/Git em série. Revisores independentes somente
leitura, correções verificadas e commit final solicitado pelo idealizador.
Recursos locais T09 separados: domínio/dev/shadow, prefixos Storage próprios,
Next 4310/mídia 4311 em loopback e stack Auth existente. Pipeline T06 é usado
nas regressões; T09 não cria upload novo. Aparelhos físicos, leitor de tela,
CI remoto e publicação continuam não observados.

## Fontes e preparação

Fontes: requisitos RF-09–RF-12/RF-16/RF-18/RF-19/RF-23, D03–D06;
design L06/L07/P06–P09 e §§13–14; arquitetura §§4–5; roadmap T09/T10/T11/T12.
Três reconhecimentos somente leitura conferiram domínio/SQL, UI e testes/runtime.
Nenhum código de produto ou banco foi alterado nesta preparação.
O builder check independente não encontrou lacunas materiais adicionais.

Context7 foi descoberto e consultado, mas retornou APIs de Prisma Next. Usar
os tipos instalados e o helper transacional existente, conforme a
[documentação oficial Prisma v7](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions),
sem adotar `db.transaction` de outra versão. Nenhum código privado ou segredo
foi enviado às consultas. Evidências funcionais serão registradas no plano
após confirmação do desenho e implementação.
