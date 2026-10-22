# T08 — análise, compensações e extrato

Estado: desenho, D05 e os limites D04 aplicáveis confirmados pelo idealizador
em 22/10/2026.
Base: 09fc5c4, T07 concluída; branch codex/t08-analise-extrato.
Este documento orienta a implementação; evidências ficam no plano de T08.

## Objetivo e limites

Entregar L05/P05 e o extrato do roadmap: analisar registros manuais, contestar,
receber complemento, manter aprovação, anular e reabrir análise. A pessoa deve
entender a decisão e o efeito exato nos seus pontos, com histórico preservado.

Manter a base Next/React/TypeScript, Prisma/PostgreSQL e Auth/Storage locais.
Reutilizar registro, snapshot, coleção de evidência, conversa e locks de T07.
Não criar outra ocorrência ao complementar/reabrir, nem liberar a ocorrência
anulada. Não importar dados do protótipo ou substituir os pontos da ocasião.

Resgate/estoque/tickets são T09/T10; álbum é T11. Não criar resgate fictício,
endpoint de crédito arbitrário, carteira paralela ou administração por bypass.
Sem dependências novas, publicação, serviços pagos ou migração em ambiente real.

## Abordagem técnica proposta pelo integrador

Usar a transação síncrona já adotada: autorização, decisão, movimento, retenção
e outbox confirmam juntos sob o lock da loja/registro. O processamento da foto
continua separado, anterior à confirmação. Essa abordagem preserva o contrato
de consistência que já orientou T07.

Foram consideradas decisões assíncronas por fila, que exigiriam apresentar
crédito/estorno ainda não confirmado, e recomputar o saldo reescrevendo o registro,
que conflitaria com o histórico compensatório já definido. Manter a transação e
acrescentar movimentos é a opção coerente com a arquitetura escolhida.

Separar uma auditoria de revisão, com UUID da operação e versão própria, dos
eventos imutáveis de recebimento/aprovação automática já existentes. A versão da
atividade e o campo `review` de preparação T07 não são a versão da análise.
O implementador detalhará DTOs/rotas no plano após aprovação deste desenho.

## D05 confirmada: estados e pontos

O estado da análise é distinto da situação dos pontos. O crédito da origem pode
estar contabilizado mesmo enquanto o registro está em contestação.

| Estado atual | Ação do lojista | Estado resultante | Efeito financeiro |
| --- | --- | --- | --- |
| Aguardando aprovação | Aprovar | Aprovado | Primeiro crédito ou recomposição de estorno anterior |
| Aguardando aprovação | Contestar | Em contestação | Nenhum; continua pendente |
| Aguardando aprovação | Anular | Anulado | Nenhum se nunca creditado/já estornado |
| Aprovado | Contestar | Em contestação | Crédito continua contabilizado |
| Aprovado | Anular | Anulado | Compensa uma vez o crédito efetivamente vigente |
| Em contestação | Aprovar/manter | Aprovado | Credita/recompõe se necessário; manter crédito vigente não movimenta |
| Em contestação | Anular | Anulado | Compensa somente se houver crédito vigente |
| Anulado | Reabrir análise | Aguardando aprovação | Nenhum: a recomposição depende da nova aprovação |

Reabrir não aprova automaticamente, inclusive quando a atividade da ocasião
era automática. Uma nova aprovação usa os pontos originais, mesmo que o cadastro
atual tenha sido alterado ou arquivado. Aprovação inicial e aprovação mantida
ficam identificadas pelo autor/data; a regra automática histórica continua visível.

Permitir ciclos posteriores: aprovado → contestado → mantido → contestado;
anulado → reaberto → aprovado → anulado. Cada ação tem versão, identificação,
autor e data próprios. Dois pedidos concorrentes não podem vencer a mesma versão.
Atualizar/repetir uma operação confirmada não produz nova decisão ou lançamento.

Motivo obrigatório para contestar, anular e reabrir, em texto simples de até
500 caracteres Unicode. Aprovar/manter dispensa motivo. Não alterar ou apagar
motivo anterior; a conversa permanece disponível para esclarecimentos.

Anular após gasto admite saldo negativo, preserva tickets emitidos e mantém o
extrato consultável. Novos resgates dependerão de saldo suficiente em T09.
Exemplo: saldo 5, ajuste −15, saldo projetado −10. A tela informa esse impacto
antes da confirmação; uma mudança de saldo/versão exige nova revisão explícita.
Se o registro não tem crédito vigente, a anulação mostra ajuste zero.

## Ledger e consistência

- Manter o crédito inicial único de T07. Aprovação manual credita com autoria do
  lojista; a automática já registrada mantém seu ator e sua regra históricos.
- Acrescentar estorno negativo e recomposição positiva, vinculados à decisão e
  ao movimento compensado. Cada movimento admite no máximo uma compensação.
  Cadeia por registro: +P → −P → +P → −P; soma da origem é sempre zero ou P.
- O valor P vem do snapshot. Anular sem crédito ou manter aprovação não inventa
  movimento. Reabrir análise não movimenta. Nunca editar/deletar lançamentos.
- Persistir UUID/digest da operação e a versão resultante. Repetição autorizada
  recupera a decisão aplicada antes de conferir a versão/estado atuais; corpo
  diferente com a mesma UUID é conflito. A resposta identifica decisão aplicada
  e estado atual, inclusive depois de ações posteriores.
- No erro incerto, preservar UUID/corpo e consultar a operação antes de repetir.
  Não mostrar sucesso até confirmar a transação. Conflito preserva o motivo
  para copiar/revisar, sem aplicar automaticamente uma intenção antiga.
- Saldo, valores e projeções são strings decimais e BigInt. Uma prévia obtida no
  servidor não autoriza o POST; saldo e versão são relidos na confirmação.

A migração será aditiva, preservando as sete já aplicadas. Estender estados,
CHECKs, grants e triggers de T07 sem permitir alteração do snapshot. O trigger
financeiro deve validar cada tipo de movimento, preservando a unicidade do
crédito inicial e reforçando mesma loja/participação/registro na compensação.
Auditoria nova e ledger continuam sem UPDATE/DELETE para o runtime.

## Complemento de evidência

Somente o participante autor responde formalmente a uma solicitação em
contestação, no mesmo registro e conversa. Confirmado: um complemento confirmado
por solicitação; depois dele, o lojista pode pedir outro, com novo motivo e
versão, mantendo a contestação. Não há limite artificial de ciclos.

O complemento tem texto de até 500 caracteres Unicode e uma foto opcional;
exigir ao menos texto não vazio ou foto. A legenda inicial permanece imutável.
Comentários livres continuam separados, com o contrato T05, e não mudam estado
nem contam como confirmação formal da evidência.

Cada solicitação abre uma revisão de evidência. Os arquivos enviados ficam
privados para o autor até a confirmação explícita. Uma foto selecionada local,
inválida ou processando impede confirmar o complemento; READY precisa pertencer
à coleção/autor/revisão corretos. Confirmar fecha os uploads daquela revisão.

O evento de resposta preserva texto, foto/revisão, autor, data e versão. A foto
inicial e complementos anteriores continuam consultáveis pela relação. Não
substituir `ActivitySubmission.evidenceAssetId` ou reutilizar uma foto de outra
versão. O componente de upload deve considerar a seleção da revisão atual;
fotos históricas não podem bloquear ou se tornar a seleção do novo complemento.

Responder mantém a contestação e não credita pontos. Dois complementos para
a mesma solicitação não podem confirmar. Se o lojista decidir antes da resposta,
o envio é recusado por conflito, sem publicar a foto ou alterar pontos; os bytes
não confirmados seguem a política de órfãos D08. A mesma UUID recupera resposta
já confirmada, com autorização atual.

## Pausa, encerramento, autorização e retenção

Confirmado: a pausa permite analisar e complementar registros existentes,
inclusive a foto de uma solicitação real de complemento. Continuam bloqueados
os novos registros/convites/resgates já definidos em D03. A exceção de mídia
pertence à origem real em contestação; não abre evidências soltas de T06.

Loja ou participação encerrada permite consulta ao histórico, sem novas ações
de análise, contestação, anulação, reabertura ou complemento. As conversas
recebidas mantêm o contrato T05/T07 até a origem fechar comentários explicitamente.
Atividade arquivada continua permitindo resolver os registros já recebidos.

Pendente e contestado impedem encerrar a loja/relação correspondente. Fechar
e contestar/reabrir usam o mesmo lock: não deixar relação encerrada com nova
análise pendente. Anulação/aprovação final libera essa dependência.

Todas as leituras, decisões, replays, fotos e destinos revalidam sessão e
permissões. Participante só acessa sua relação; lojista a própria loja; admin
não ganha acesso privado por ser admin. Suspensão/revogação prevalece sobre o
link anteriormente listado. Trocar conta/loja descarta conteúdo privado.

Pendente/contestado/reaberto protege todas as versões publicadas contra expurgo.
Aprovação/anulação final libera hold, preservando os 180 dias desde a publicação
de cada foto. Não reiniciar o prazo ao decidir. Se o expurgo venceu antes da
proteção, manter referência histórica e informar mídia indisponível; nunca
ressuscitar bytes. Alterar estado/hold/publicação ocorre na mesma transação da
origem e lock de coleção. Rascunho abandonado segue órfãos após 24h.

## Histórico, extrato e novidades

Reutilizar o detalhe do registro para análise e histórico paginado: recebimento,
aprovação automática/manual, contestação, pedido de complemento, resposta,
anulação, reabertura e recomposição. Mostrar autor, data, motivo e efeitos
separados; os cards também distinguem aprovação automática da manual.

Entregar `/lojas/:storeId/extrato`, com entrada pelo potinho e navegação da loja.
O acesso adicional por Meus mimos será ligado ao fluxo real em T09/T12. Não
criar uma área de mimos simulada para cumprir esse vínculo nesta etapa.

Filtrar período pela data do movimento no fuso da loja, tipo e participação
autorizada. Agrupar por data, ordenar/paginar de forma estável e preservar
filtros ao abrir a origem e voltar. Mostrar valor assinado, autor, horário,
nome da ocasião, tipo, origem e compensação. A origem abre o registro/decisão
correspondente, inclusive se o evento estiver em página antiga do histórico.

Disponível e pendente ficam separados. Pendente inclui registro recebido ainda
em análise e sem crédito vigente, inclusive reaberto; contestado já creditado
não duplica pendência. Anulado não soma pendente. Saldo negativo tem explicação
persistente e acesso aos movimentos, sem celebração de ganho.

O resumo diário distingue recebimentos, primeiras aprovações, ganhos iniciais
por atividade e ajustes líquidos. Manter/recompor não é nova conquista. Os
ganhos iniciais usam a data do primeiro crédito; estorno/recomposição aparecem
como ajustes e no extrato, sem reescrever o histórico de ganhos daquele dia.

Decisões confirmadas avisam o participante; complemento confirmado avisa o
lojista. Uma novidade por evento/UUID, sem notificar o próprio autor. Persistir
outbox na mesma transação; lista/contador/destino usam audiência atual. O
conteúdo privado do motivo, texto ou foto não vai para logs ou resumo do aviso.

## Aceite e prova local

- Aprovar/anular duas vezes e disputar a mesma versão: somente um efeito.
- Contestar antes/depois de creditar; manter sem segundo crédito; anular sem
  crédito não debita. Ciclos completos recompõem somente o valor da ocasião.
- Falha após movimento/evento/publicação/outbox desfaz estado, hold e dinheiro;
  retry com a mesma UUID confirma tudo uma vez. Replay antigo não reaplica ação.
- Histórico/recorrência preservados após renomear, arquivar, anular/reabrir.
- Foto sintética real em complemento, anterior preservada, rascunho privado,
  READY/contexto corretos, corrida com decisão/expurgo e D08 protegida.
- Auth/CSRF/no-store, participante vizinho, outra loja, admin sem bypass,
  sessão expirada, suspensão/revogação e troca de contexto.
- Extrato reconcilia com soma exata, filtros/paginação e origem reautorizada.
- Chromium 320/390, teclado/foco/diálogo, 44px, texto 200%, movimento reduzido,
  falhas 503/429/409 e resposta perdida, BigInt e saldo negativo controlado.

Sem resgate implementado, T08 não comprova integralmente “gastar → anular →
ticket preservado/novo resgate bloqueado”. Provar HTTP de crédito/estorno/
recomposição reais, aritmética assinada identificada (5 − 15 = −10) e UI
controlada. A integração real com gasto/tickets fica explicitamente para T09.
Não falsificar débito em ledger nem desativar constraints para simular o caso.

Depois de aprovado, detalhar plano e contratos; executar as ondas do toolkit
com um escritor por arquivo, recursos mutáveis serializados e revisão nova
somente leitura. Root integra, executa checks e faz o commit final solicitado.
Não alegar aparelhos físicos, leitor de tela ou CI/publicação remotos sem prova.

## Reconhecimento e revisão do desenho

Três leituras independentes, somente leitura, conferiram domínio/migrações,
UI e provas de T07. Um novo revisor leu o desenho completo como implementador
e não encontrou perguntas materiais restantes. Nenhum código ou banco foi
alterado nesta preparação. O idealizador confirmou o desenho, D05 e os limites de T08 antes da implementação.

Conferência da base em 22/10/2026: `npm run check` passou com regras/lint,
7 testes do protótipo, 9 da fundação, tipos e build. Isso verifica a base T07,
sem alegar implementação ou testes funcionais de T08.

Context7 foi descoberto e consultado. A resposta misturou APIs da documentação
atual com referências v7; usar os tipos instalados e a
[documentação Prisma v7](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions),
preservando o helper transacional existente. Não adotar APIs de outra versão
por sugestão do índice. Nenhum código privado ou segredo foi enviado às consultas.
