# T11 — álbum privado por ticket

Estado: desenho e complementos confirmados pelo idealizador em 22/10/2026,
com autorização para implementar após T10 e fazer commit. T10 foi concluída no
commit `7e7bee7`; execução e evidências de T11 ficam no plano correspondente.
O builder check independente não encontrou lacunas materiais para planejar
este desenho (`nothing important left`).
O pedido de continuar até T15 mantém a sequência e as dependências do roadmap.

## Objetivo e fronteiras

Entregar o álbum opcional de L08/P09: o lojista escolhe várias fotos e vídeos,
revisa legenda e ordem, acompanha cada envio e publica explicitamente os prontos
para o participante daquele ticket. Permitir novos lotes posteriores,
visualização privada e remoção própria confirmada, sem alterar pontos, estoque,
combinado ou realização. Outro resgate do mesmo mimo tem outro álbum.

Reutilizar o transporte privado e o processo de mídia de T06, integrado à origem
real do ticket. A conversa contextual T05/T10 permanece; reações, mural e central
completa de novidades pertencem a T12. A retrospectiva e compartilhamento externo
não entram neste recorte. Nenhum serviço pago, dependência nova ou publicação
da aplicação é necessário para entregar a versão local.

## Base observada e abordagem

`MediaCollection` já separa EVIDENCE/MEMORY por origem, loja e participação.
`reserveMedia` reserva até dez UUIDs por chamada e limita MEMORY a vinte arquivos
não removidos, incluindo envios em andamento e falhas. O transporte usa partes
de 5 MiB, offset/checksum persistidos, reserva recuperável e reautorização antes
e depois do Storage. O processo separado gera derivados privados; READY ainda
não significa publicado. `publishMedia` é interno e aceita somente derivados
READY íntegros. `removeMedia` oculta imediatamente e agenda expurgo repetível.

A UI existente `MediaUploader` já trata seleção, progresso, pausa, nova tentativa,
arquivo original reescolhido após reload, consulta e remoção confirmada. Ela
precisa ser integrada a um álbum real, revisão de legenda/ordem e fronteira
privada do ticket; não deve ser copiada como uma segunda implementação do upload.

A abordagem recomendada acrescenta um pequeno agregado de álbum/publicações,
mantendo bytes, leases e processamento no pipeline existente. Apenas liberar
`publishedAt` pela API genérica não preservaria agrupamento, ordem, legendas nem
recuperação da intenção. Processar/publicar automaticamente cada arquivo
contrariaria a revisão explícita e a publicação parcial escolhida pelo lojista.
Esta é uma decisão técnica proposta do implementador dentro da arquitetura
existente; a aprovação deste desenho confirma o recorte completo.

## Regras já confirmadas

- RF-25 e design §14.3: autoria do lojista, audiência exclusiva do ticket,
  múltiplos momentos, legenda opcional, ordem revisável antes da publicação,
  novos envios e remoção própria com confirmação.
- D07: até vinte itens por álbum, até dez por lote de envio. Fotos JPEG/PNG/WebP
  até 10.000.000 bytes; HEIC/HEIF continuam recusados. Vídeos MP4/MOV até
  100.000.000 bytes e sessenta segundos; derivados JPEG, MP4/H.264/AAC quando
  houver áudio, orientação aplicada e sem EXIF/GPS, nos limites T06.
- Somente itens publicados aparecem ao participante. Falha de um arquivo não
  descarta os outros e não publica silenciosamente um subconjunto.
- Uma publicação gera uma novidade agrupada para o participante, sem notificar
  o próprio autor. A novidade leva ao ticket autorizado; sem e-mail/push novo.
- Acesso de cinco minutos vinculado à sessão; conteúdo e miniatura reautorizam
  cada leitura/Range e retomada. Não persistir URL temporária como identidade.
- D08: órfãos após 24 h sem atividade e originais removidos até 24 h depois do
  processamento; álbum durante a relação ativa e até doze meses de calendário
  após encerramento. Ocultar remoções imediatamente; exclusão não altera ticket.
- D03/T10: pausa ou encerramento não revogam audiência dos tickets existentes.
  Sessão inválida, suspensão ou revogação prevalecem sobre histórico e replay.

## Complementos confirmados pelo idealizador

1. **Legenda:** texto simples opcional de até **500 caracteres Unicode**, com os
   validadores existentes. Apenas espaços vira legenda vazia. Não aceitar
   Unicode inválido ou controles proibidos. A legenda e a ordem confirmadas
   ficam imutáveis após publicar; novos lotes são acrescentados ao fim. Corrigir
   um momento já publicado exige removê-lo e enviar/publicar outro explicitamente.
2. **Ticket cancelado:** preservar consulta e remoção das mídias próprias já
   existentes, mas bloquear novas reservas, continuação de uploads e publicação.
   O cancelamento não apaga automaticamente os momentos. Nos estados aguardando,
   combinado, pedido em análise e realizado, o lojista pode adicionar/publicar;
   a mídia continua independente da decisão financeira.
3. **Pausa e encerramento:** permitir adicionar/publicar em tickets não cancelados
   da relação pausada ou encerrada enquanto houver audiência e prazo de retenção
   vigente; não reabrir a loja/participação nem reiniciar o prazo pela publicação.
   Depois do prazo, bloquear novas memórias; as existentes seguem a proteção
   do item seguinte. O participante continua sem permissão de upload neste álbum.
4. **Proteção após encerramento:** usar como início do prazo o primeiro
   encerramento da loja ou daquela participação. Durante ticket aberto ou pedido
   de cancelamento pendente, manter proteção conservadora para não expurgar uma
   pendência. Ao realizar ou cancelar, liberar a proteção e aplicar os doze meses
   contados do encerramento original; se já vencidos, ocultar e expurgar conforme
   D08, sem conceder doze meses novos. Esta extensão conservadora de proteção
   precisa ser confirmada por conciliar o prazo com “não apagar pendências”.

Os demais detalhes abaixo são escolhas de implementação revisáveis. Os quatro
itens acima foram confirmados junto com este desenho; D07/D08 e os limites de
arquivo continuam confirmados desde T06.

## Fluxo do lojista

O detalhe do ticket exibe álbum vazio ou momentos publicados e “Adicionar
momentos” quando permitido. O servidor reautoriza o ticket e registra a coleção
MEMORY de forma idempotente pela origem; não aceita UUID arbitrário de coleção
ou participante fornecido pelo cliente. Coleção/álbum têm vínculo único ao ticket.
Ticket antigo sem álbum continua consultável e recebe a origem ao iniciar o
primeiro envio autorizado; leitura não cria recursos implicitamente.

Selecionar até dez arquivos, mostrar tipo, tamanho, prévia local, legenda opcional
e botões acessíveis de mover antes/depois. O lojista revisa e envia. Cada arquivo
mantém sua UUID e progresso; o envio sequencial existente evita multiplicar
requisições e permite pausar sem perder partes confirmadas. Estado por arquivo:
selecionado, enviando, processando, pronto, falha e removendo. Arquivo inválido
exige remoção e nova seleção; falha transitória permite tentar a mesma reserva.

Depois do processamento, revisar os itens READY. A publicação recebe uma lista
ordenada explícita de um a dez itens prontos e suas legendas. Enquanto houver
outros processando ou com falha, o botão indica “Publicar N momentos prontos” e
o confirmador informa quantos ficarão no rascunho. Não selecionar automaticamente
um subconjunto durante a transação: qualquer item escolhido que tenha mudado
torna a operação um conflito e exige revisão. Itens não escolhidos permanecem
privados para tentativa/publicação posterior.

Novos lotes respeitam a capacidade de vinte itens ativos, somando publicados,
rascunhos e falhas reservadas. Remoção confirmada libera capacidade, sem alterar
o histórico da publicação. Uma nova seleção do mesmo arquivo é uma intenção
nova; idempotência protege repetição da mesma intenção, não proíbe escolher
conscientemente a mesma foto em outro momento.

Legenda/ordem de uma revisão ainda não publicada ficam em memória durante
falha e retry. Após reload, recuperar arquivos/progresso persistidos e solicitar
nova revisão das legendas/ordem ainda não confirmadas, sem prometer persistência
de rascunhos de texto entre dispositivos. Arquivo original precisa ser
reselecionado para retomar partes; checksum deve corresponder antes do upload.

## Visualização e remoção

Participante recebe somente itens publicados, na ordem confirmada e com legenda,
tipo, dimensões/duração e instante de publicação. Rascunhos, contagem de falhas,
nomes originais, checksums, caminhos de Storage e destinatários não aparecem.
Lojista vê também seus rascunhos por consultas autorizadas. Histórico de Meus
mimos mostra quantidade de momentos publicados e uma miniatura autorizada,
quando houver; cancelamento/remoção atualizam a prévia sem mudar o total de tickets.

Abrir foto em Dialog com descrição acessível e legenda, fechar por Escape e
devolver foco ao item. Vídeo usa player nativo com controles, `preload=metadata`,
`playsInline`, sem autoplay ou início automático de som. Se o acesso temporário
expirar, renovar sob autorização atual e oferecer retomar a reprodução; não
tratar expiração como nova publicação. Miniaturas usam os mesmos controles de
acesso dos arquivos grandes. Não expor URLs permanentes ou download público.

Somente o lojista autor remove suas mídias. Confirmar com identificação do
momento e aviso de que ele deixará de aparecer no álbum; Escape/cancelar
preservam o item. Ocultar e invalidar acesso imediatamente na transação,
incrementar revisão do álbum e registrar a remoção sem apagar o evento original.
O worker existente elimina derivados/originais com retry/quarentena. Publicação
e remoção concorrentes não podem tornar visível item removido; URL emitida
antes da remoção passa a negar conteúdo. Participante não remove a mídia do autor;
pedido de exclusão/exportação segue o procedimento de T14.

## Contratos e persistência propostos

API privada sob `/api/lojas/:storeId/tickets/:ticketId/album`:

- `GET`: álbum/versão, itens publicados paginados e permissões atuais; visão
  do lojista permite acessar a coleção de rascunhos pelo transporte T06.
- `POST /iniciar`: UUID de intenção, autoriza o ticket e cria/recupera agregado
  e coleção MEMORY; não altera ticket, pontos ou estoque.
- `POST /publicacoes`: `operationId`, `expectedVersion` e lista ordenada
  `items[{assetId,caption}]`, de um a dez, sem duplicações. Sem autor, loja,
  participante ou destino no corpo. Resposta distingue publicação aplicada e
  visão atual do álbum, inclusive após remoção/publicação posterior.
- `GET /operacoes/:operationId`: encontra publicação do ator e ticket atuais
  ou retorna ausência autorizada. Não revela intenções de outra origem/autor.

Resumir a prévia no DTO de ticket/histórico evita uma chamada por item na lista.
Paginação padrão vinte/máximo cinquenta e ordem estável. O limite de vinte itens
não autoriza carregar histórico ilimitado de publicações/remoções. Publicação
somente de itens novos: item já publicado por outra operação retorna conflito,
sem reutilizá-lo para gerar outro aviso. Replay da própria operação é seguro.

Um agregado Album liga ticket/coleção/loja/participação e versão; uma publicação
imutável usa UUID da operação, autor, digest, versão e instante. Itens publicados
guardam referência única ao asset, legenda e posição estável, sem duplicar bytes.
Um evento de remoção preserva autoria/instante/revisão. Usar FKs compostas,
unicidades, RLS e concessões mínimas; tabelas de auditoria sem UPDATE/DELETE no
runtime. Campos exatos e índices ficam para o plano, com migração nova/aditiva.
Não editar migrações aplicadas, especialmente os bytes preservados de T09.

## Atomicidade e recuperação

Manter a ordem existente de locks de identidade/sessão → loja → participação →
coleção/álbum → arquivos. Serializar publicações, remoções, cancelamento e
encerramento pelo mesmo lock da loja, além da revisão esperada. Revalidar autor,
ticket, coleção e todos os itens; publicação, metadados ordenados, `publishedAt`,
auditoria e uma outbox agrupada confirmam juntos. Nenhuma escrita no ledger,
catálogo ou projeção financeira é necessária.

Storage/processamento ficam fora dessa transação; continuar o modelo T06 de
leases e confirmação condicional. A transação de publicação não espera FFmpeg,
não publica PROCESSING e não transforma falha física em publicação parcial
silenciosa. Resposta perdida, 429/503 ou reload consultam primeiro a UUID opaca
da publicação. Mesma UUID/corpo recupera o resultado autorizado sem duplicar
itens/aviso. Alterar corpo exige resolver a intenção anterior e confirmar uma
nova explicitamente; revisão antiga retorna 409. URL só pode conservar UUID,
nunca legenda, nomes de arquivos, tokens de mídia ou conteúdo privado.

Usar os limites atuais de leitura/mutação por conta e vinte autorizações de
upload por minuto; reserva em lote conta os arquivos, não apenas uma chamada.
CSRF e Cache-Control privado/no-store continuam obrigatórios. 401/403/404 de
álbum, coleção, arquivo, publicação, operação, miniatura ou conteúdo acionam a
fronteira privada do ticket e descartam rascunhos, navegação e respostas antigas.
Troca de conta/loja/ticket aborta pedidos e revoga previews locais/object URLs.
410 de URL expirada permite renovação autorizada, sem ocultar falhas de acesso.

## Retenção integrada

Registrar a origem MEMORY apenas para ticket real e verificar essa origem
também nas APIs genéricas e no gateway; conhecer um ID não concede audiência.
Aplicar a política aprovada acima ao iniciar álbum, publicar, encerrar
participação/loja e resolver ticket. Atualizações de proteção/prazo pertencem à
mesma transação da origem. Pausa não inicia prazo de encerramento; cancelamento
não equivale a encerramento da relação. Novo lote não estende um prazo anterior.

No prazo vencido, negar novas memórias mesmo havendo hold; o hold preserva apenas
os momentos existentes enquanto a pendência não é resolvida. Sem hold, negar
também consulta dos derivados antes da próxima manutenção; o worker faz
ocultação/expurgo repetível. Provar
29/02 → 28/02 nos doze meses de calendário. Originais, órfãos, quarentena de
tentativas e reconciliação de objetos tardios conservam o comportamento T06.
Histórico estruturado, exclusão/exportação identificável, anonimização e
restauração completa permanecem em T14.

## Aceite e evidências necessárias

1. Três fotos e dois vídeos reais sintéticos percorrem reserva, partes,
   processamento, revisão e publicação única; participante vê só esses itens.
2. Um vídeo falha sem perder os demais. Publicar explicitamente os prontos
   gera um aviso; nova tentativa e publicação posterior não duplicam arquivos,
   saldo, estoque, ticket ou avisos anteriores.
3. Legenda Unicode 0/500/501, ordem, lote 10/11, capacidade 20/21, remoção que
   libera vaga, múltiplos lotes e outro ticket do mesmo mimo ficam isolados.
4. Replay após nova publicação/remoção retorna operação aplicada e visão atual;
   conflito de versão, dupla publicação, publicação × remoção/cancelamento,
   falha de outbox/auditoria revertem todos os efeitos daquele commit.
5. Participante não publica/remove mídia do lojista; outro participante, loja,
   ticket, sessão revogada/suspensa e acesso administrativo cotidiano negam
   coleção, arquivo, miniatura, Range e operação, inclusive URL antes emitida.
6. Pausa/encerramento, todos os estados do ticket e proteção/prazo D08 seguem
   os complementos aprovados; publicação/remoção não alteram pontos/estoque.
7. Chromium cobre galeria/player, falhas/retomada/reload, troca de conta,
   401/403/404/410/429/503, teclado/Escape/foco, 320/390 px, texto 200% e movimento
   reduzido. HTTP com Auth/PostgreSQL/Storage reais prova persistência e bytes.
   Reprodução/câmera em Android/iPhone reais e leitor de tela precisam de
   evidência própria; captura sintética não declara esses itens concluídos.

Orquestração posterior à aprovação: contratos e esquema primeiro; escritores
separados de domínio/API, UI e testes; root serializa Git, bancos, typegen,
builds e serviços. Recursos T11 separados em domínio/dev/shadow e namespaces
`t11-development`/`t11-integration`, Next 4310/mídia 4311 em loopback, com Auth
local existente. Revisão independente somente leitura e commit por etapa.

## Fontes e pendências

Fontes locais: roadmap T11; requisitos RF-25, RNF-13/RNF-20, §3.7 e D07/D08;
design L08/P09, §14.3 e §15; arquitetura §1.4 e §4.2; `docs/media-local.md`;
desenho confirmado T10; módulos `server/media`, `server/media-worker` e
`components/media` inspecionados em 22/10/2026. Nenhuma consulta externa recebeu
código privado ou dados pessoais; não há mudança de API externa neste desenho.

Builder check e aprovação do desenho/complementos concluídos. Próximo passo:
elaborar o plano de implementação conforme writing-plans;
nenhum código, schema, serviço, teste funcional ou commit foi iniciado por
esta preparação documental.
