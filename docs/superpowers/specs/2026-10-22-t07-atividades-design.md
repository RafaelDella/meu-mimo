# T07 — atividades e envio de conquistas

Estado: desenho e D04 confirmados pelo idealizador em 22/10/2026, após
reconhecimento independente e revisão. Base cfdcb25; branch codex/t07-atividades-conquistas.
T07 segue o roadmap; análise manual/contestação/estorno são T08 e resgates são T09.

## Objetivo

Entregar L03/L04 e P02–P04 com dados reais: lojista cadastra, edita e arquiva
atividades; participante consulta regras, registra uma conquista e acompanha
confirmação, foto e conversa privadas. Aprovação manual começa selecionada e
gera pendência sem saldo disponível; automática confirma um crédito único.

Crédito, movimento, registro, auditoria e evento devem confirmar juntos. O
protótipo e seus pontos continuam demonstração. Não criar endpoint público
para conceder pontos, aprovar manualmente ou forjar autor/participação.

## Base e abordagem

Manter Next/React/TypeScript, PostgreSQL/Prisma e serviços locais já aprovados.
Usar transação síncrona para receber o registro e confirmar crédito automático.
Separar o processamento de foto, reaproveitando T06, antes da confirmação final.
Uma fila para creditar depois deixaria saldo/registro em estados intermediários;
processar imagem dentro da transação seguraria locks durante trabalho externo.
Essas alternativas não atendem à consistência do roadmap. A escolha técnica
do integrador é reutilizar a transação existente e o processo separado de mídia.

Sem dependências novas. Calendário será calculado no PostgreSQL17 com o fuso
persistido e o relógio do banco; não depender de horário/fuso do aparelho.
Ledger consultável, sem saldo materializado paralelo nesta etapa. Valores
acumulados são inteiros exatos, enviados como strings decimais no JSON.

## D04 confirmada

As regras abaixo foram confirmadas em resposta única sobre o desenho:

- Semana de segunda-feira 00h até a segunda seguinte no fuso da loja.
- Sem retroatividade no MVP: data da atividade é a data local do recebimento
  confirmado; guardar também os instantes de preparação, envio, aprovação e crédito.
- Frequência única: uma ocorrência por atividade e participação; diária: uma
  por data local; semanal: até N por semana, N inteiro de 1 a 100, inclusive vários
  registros no mesmo dia.
- Somente envio confirmado ocupa ocorrência. Rascunho, upload ou falha não
  ocupam. Registro recebido continua ocupando mesmo se for contestado/anulado;
  complemento/reabertura usam o mesmo registro em T08.
- Pontos por ocorrência: inteiro de 1 a 1.000.000.
- Legenda opcional de até 500 caracteres Unicode, texto
  simples, imutável após envio. Comentários posteriores usam a conversa T05.
- Ao mudar frequência/limite, contar os envios já recebidos daquela atividade
  e participação no período da nova regra, independentemente da frequência antiga.
  Exemplo: três envios diários nesta semana já ocupam três vagas ao trocar para
  até três por semana. Única considera todo o histórico. Editar não zera consumo.

Nomes80, descrições1.000, paginação20/máximo50, leitura120/mutação30 por conta,
proibição de pontuar na própria loja e bloqueio de fuso após primeiro registro
já foram confirmados. Categoria opcional usa nome80; ilustração opcional usa
somente stickers locais existentes, sem novo upload de capa nesta etapa.

## Cadastro e revisão das regras

Atividade tem nome, descrição, categoria opcional, sticker local opcional,
pontos, frequência, limite semanal, modo MANUAL/AUTOMATIC, versão e arquivamento.
Alterar exige versão esperada; conflito pede atualização explícita do formulário.
Cada criação/edição/arquivo registra autor, instante e cópia da configuração.
Arquivar exige confirmação, impede novos registros e mantém o histórico.
Não há reativação nem exclusão física no fluxo de T07.

Mudanças afetam novos envios. Na confirmação, gravar snapshot do nome/descrição,
categoria/sticker, pontos, aprovação, frequência/limite e versão; data local,
fuso e limites UTC do período são próprios do registro recebido. Edição posterior
não modifica esse conteúdo. Formulário aberto antes de mudar regra deve revisar
a versão atual antes de confirmar, inclusive se a foto já estiver preparada.

## Preparação, foto e confirmação

1. Participante abre a atividade autorizada. A tela explica os pontos, a regra,
   a frequência, a disponibilidade e o fuso da loja.
2. Preparar com UUID estável cria rascunho próprio e coleção EVIDENCE interna
   ligada à atividade/participação reais. Essa preparação não cria ocorrência,
   crédito, notificação, conversa nem pendência de análise.
3. Legenda fica no formulário até o envio. Foto é opcional e usa seleção,
   transporte e processamento privados de T06. Escolher/remover/retomar é possível
   enquanto rascunho; origem, autor e coleção são validados pelo servidor.
4. Revisão consulta a versão/regra, data local e fuso atuais. Enviar inclui os
   valores esperados e a foto escolhida ou null; o servidor recalcula tudo.
   Mudança de regra, data local na virada ou fuso exige revisar novamente.
5. Foto escolhida precisa estar READY na coleção/revisão/autor corretos. Falha
   ou processamento pendente não confirma registro. É possível retirar a foto
   e enviar sem ela, mediante revisão explícita da seleção.
6. Uma transação bloqueia o contexto, revalida estado/disponibilidade e confirma
   ocorrência, snapshot, legenda, mídia escolhida/publicação, conversa, evento
   e eventual crédito. Fecha uploads da coleção. Marcar domainStartedAt somente
   no primeiro envio recebido, preservando o bloqueio de fuso de T04.
7. Manual fica PENDING, pontos PENDING e saldo disponível intacto. Automático
   fica APPROVED, pontos CREDITED, com movimento inicial único. A confirmação
   durável permite abrir o detalhe pelo mesmo identificador.

Repetir a preparação recupera a mesma origem. Repetir o envio com o mesmo corpo
recupera o resultado existente antes de aplicar bloqueios posteriores de arquivo,
pausa ou encerramento; autorização atual continua obrigatória. Corpo diferente
para a mesma operação é conflito, sem alterar registro ou crédito. Resultado
incerto mantém UUID/corpo e oferece consulta, sem criar outra tentativa financeira.

Rascunhos e arquivos de outro participante nunca aparecem em listas do lojista.
No registro recebido, participante e lojista têm foto/conversa autorizadas.
Evidência publicada não pode ser substituída/removida pela API genérica de mídia:
correção/complemento fica na origem T08 e direitos de dados em T14.
Manual mantém proteção D08 durante análise; automático aprovado libera retenção
de 180 dias. T08 deverá proteger novamente ao contestar/reabrir.

## Dados e concorrência

Modelos previstos: Activity, ActivityEvent, ActivitySubmission, SubmissionEvent
e PointsEntry, com índices de loja/participação/atividade/período e unicidade da
operação. FK composta impede vincular atividade/participação/registro/lançamento
a outra loja. Auditorias e ledger são append-only para o runtime.

O ledger inicial tem valor positivo, tipo ACTIVITY_CREDIT, origem no registro,
autor e instante. Chave estável e índice único do crédito inicial impedem
duplicação. A soma vem dos movimentos; pendente vem dos registros manuais
recebidos, separada da soma disponível. T08 acrescenta compensações e extrato
completo; T07 já fornece consulta autorizada dos créditos criados.

Preservar ordem de locks de T04: identidade/sessão, loja, vínculo, atividade,
registro, coleção e arquivo; nenhum byte externo dentro da transação final.
O lock da loja serializa edições, arquivo, envio e encerramento. Contagem de
ocorrências e inserção ficam no mesmo escopo bloqueado; constraints reforçam
operação/crédito únicos. Um relógio de banco por decisão evita períodos mistos.

Nova migração mantém CHECKs/FKs manuais anteriores e grants/RLS restritos.
Ao estender NotificationKind, considerar o commit do enum antes de usar o valor
em CHECK. Não reescrever migrações já aplicadas nem resetar bancos existentes.

## Conversa, novidades e encerramento

Registrar conversa SUBMISSION apenas no recebimento real. Novo envio manual ou
automático gera uma novidade ao lojista, com origem tipada, na mesma transação.
Não notificar o participante sobre a própria ação; a tela confirma seu resultado.
Repetição/rollback não deixa evento duplicado ou sem registro. Comentário no
registro real passa a abrir sua rota; TICKET continua com integração futura.

Encerramento consulta registros recebidos ainda PENDING na mesma transação,
por loja ou participação. Rascunhos não bloqueiam; registros automáticos aprovados
permitem encerramento com histórico preservado. O marcador de fuso permanece.
T08 estende a consulta para contestação; tickets continuam responsabilidade T09/T10.
Pausa/encerramento impedem preparar/receber novos registros. Suspensão/revogação
nega leitura, foto, conversa, saldo e destino, sem bypass administrativo.
Conversa de registro recebido continua aceitando comentários após pausa ou
encerramento, preservando o comportamento aprovado de T05. A origem pode fechar
explicitamente a escrita por commentsClosedAt; T08 define políticas das análises.

## Interface

- `/lojas/:storeId/atividades`: Cadastros/Registros para lojista e
  A fazer/Meus registros para participante. Busca e paginação; cards mostram
  regra, frequência e limite atingido. Registros têm filtros autorizados por
  atividade, período/estado e pessoa para o lojista.
- `/atividades/nova` e `/:activityId/editar`: formulário, aprovação manual padrão,
  explicação da regra, conflito de versão e arquivo confirmado.
- `/atividades/:activityId`: descrição, regra atual e últimos registros próprios;
  lojista acessa a gestão e a lista contextual de registros.
- `/atividades/:activityId/registrar`: preparação, legenda/foto e revisão, erro
  por etapa e recuperação da mesma operação.
- `/registros/:submissionId`: snapshot, data/fuso, situações de registro/pontos,
  foto e conversa reais. Ações de análise ficam em T08.

Exibir disponível e pendente separados por participação; totais inteiros exatos.
Resumo do dia distingue enviados, aprovados e pontos creditados. Sem rotina
diária definida, usar contagens, sem percentual ou denominador inventado.
Dados privados são descartados ao mudar conta/loja; abortar respostas antigas.
Reaproveitar componentes, rótulos, foco, modal, toque44px e estilos existentes.
Não introduzir novas composições fictícias como substitutas das rotas reais.

## Recursos, verificação e limites

Domínio meumimo_t07, dev e shadow próprios, Auth/Storage na stack meumimo-t02.
Next4310 e mídia4311 em testes, dev4301. Reutilizar bucket privado de T06 com
namespaces exclusivos de T07, processo separado e credencial admin fora do Next.
Root opera comandos, migrações, processos, builds e Git em série. Implementadores
recebem arquivos exclusivos; revisores independentes somente leitura.

Provar Auth/DB/Storage reais, isolamento com dois participantes e outra loja,
grants imutáveis, crédito/soma e evento atômicos; falha depois de lançar crédito,
concorrência, corpo divergente, resposta perdida, pausa/arquivo/edição concorrente,
mudança de regra/data/fuso durante foto e autorização após revogação.
Datas incluem segunda/virada local, fuso diferente do aparelho e dias DST23/25h.
Provar que mudanças de frequência não zeram consumo e rascunho não ocupa vaga.

UI: rotas reais com contratos controlados nos casos de erro; teclado/foco,
diálogos, 320/390px, texto200%, movimento reduzido e contexto limpo. Prova HTTP
usa origem T07 real com foto e conversa. Check, migração vazia/evolutiva,
regressões T02/T04/T05/T06, revisão independente e scan antes do commit.
Câmera/galeria e reprodução em aparelhos reais/leitor de tela continuam no aceite
móvel, sem alegação de observação por emulação. Sem publicação ou serviço pago.

## Fontes

Context7 foi consultado para transações Prisma; misturou exemplos v6 e v7.
Prevalecem a documentação oficial v7 e os tipos instalados em 7.10.1:
[transações](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions).
Calendário e unicidade usam PostgreSQL17:
[data/fuso](https://www.postgresql.org/docs/17/functions-datetime.html) e
[índices parciais](https://www.postgresql.org/docs/17/indexes-partial.html).
Consultas não incluem código privado, dados pessoais ou segredos.

Revisão independente do desenho concluída. O único complemento solicitado foi
explicitar comentários após encerramento: a decisão do integrador é preservar
T05, mantendo escrita autorizada até fechamento explícito pela origem.
