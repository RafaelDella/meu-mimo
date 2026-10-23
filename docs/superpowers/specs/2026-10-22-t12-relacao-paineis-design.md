# T12 — relação privada, novidades e painéis reais

Estado: desenho integralmente confirmado pelo idealizador em 22/10/2026,
incluindo D04 do bilhete e os três complementos de produto abaixo, com
autorização de implementação na sequência até T15. Builder check independente
concluído, sem lacunas materiais adicionais. O desenho T11 está confirmado;
este documento consome seu contrato. T11 foi concluída antes da execução T12.
T12 foi implementada e verificada localmente em 23/10/2026; evidências,
ocorrências e limitações estão no plano, sem autorização de publicação.

## Objetivo e recorte

Completar RF-13/RF-14/RF-15 e as telas P01, P10, L02 e C04 com dados reais:
bilhete individual versionado, reações e mural privado, central de novidades e
preferências por loja, resumo do lojista e Lojinha do participante. Reutilizar
conversas/comentários T05, atividades/pontos T07/T08, catálogo/tickets T09/T10 e
álbum T11 quando entregue. Nenhum dado de demonstração vira dado confiável.

Não acrescentar chat coletivo, ranking, reação por arquivo, favoritos/arquivo
de bilhetes, confirmação de leitura ao remetente, meta P1, retrospectiva,
e-mail ou push. Administração é T13; recuperação, exclusão/exportação e matriz
de aparelhos são T14. Não contratar serviço nem publicar a aplicação.

## Base observada antes da implementação e abordagem

Comentários imutáveis de até 500 caracteres Unicode já são privados e
idempotentes. A conversa nasce da transação do registro/ticket e sua audiência
é revalidada atualmente; `commentsClosedAt` determina se aceita escrita.
Outbox transacional e consumidor SQL já materializam Notification única por
evento com retry/backoff. API existente lista, marca leitura e resolve destinos
autorizados, mas ainda não há interface C04, agrupamento ou preferências.

O workspace já separa papel/loja e compartilha fronteira privada, contador de
tickets, saldo e vitrine reais. Sua apresentação inicial ainda é parcial;
Pessoas não tem detalhe completo nem editor de bilhete. As composições T03 são
fictícias e permanecem só como referência visual. Não há transporte Realtime
nem push implementado em `web/src`.

Recomenda-se acrescentar módulos de notas/reações e projeções de leitura para
mural e painéis, conservando fontes financeiras e outbox atuais. Não duplicar
o ledger ou criar uma segunda conversa para o mural. Um feed público ou uma
carteira somada entre lojas contrariaria a privacidade e a unidade de pontos.

Consulta autorizada continua sendo fonte dos dados. Usar invalidação após
mutações, ao voltar à aba/rota e consulta periódica enquanto a interface estiver
visível é uma escolha técnica do implementador. Intervalo inicial de trinta
segundos, centralizado por conta/sessão/loja, sem polling em abas ocultas ou
requisições sobrepostas. Realtime poderá apenas antecipar uma nova consulta;
sua ausência/queda não impede o uso. Não instalar serviço/canal público para
satisfazer uma expectativa de atualização instantânea.

## Confirmado pelo produto e etapas anteriores

- Cada relação tem bilhete privado; cartão da Lojinha e coração abrem o mesmo
  conteúdo. Nova versão volta a ser não lida. Ler uma versão antiga não lê uma
  versão posterior. Estado acompanha a conta entre dispositivos e nunca é
  apresentado ao lojista.
- Comentários T05: até 500 caracteres Unicode, texto simples imutável,
  autor/instante, repetição segura. Edição/exclusão não entram em T12.
- Reações e comentários só pertencem a registros/tickets autorizados da dupla.
  Não aprovam atividade, entregam mimo ou movimentam pontos/estoque.
- Mural do participante só mostra a própria relação. Lojista pode organizar
  todas as relações de sua loja com filtro por pessoa, sem torná-las públicas.
- Novidade identifica loja, autor, evento, horário, leitura e destino. Destino
  reautoriza o recurso e indica claramente uma eventual troca de loja/papel.
  Nunca avisar o autor como se outra pessoa tivesse agido.
- Interações sociais podem ser silenciadas por loja. Decisões sobre pontos
  continuam consultáveis no app; push é separado e não condiciona o uso.
- L02 tem checklist inicial, registros pendentes, mimos a realizar, participantes
  e acontecimentos recentes. P01 tem saudação, identificação do lojista, saldo
  disponível/pendente separados, atividades, vitrine e bilhete da participação.
- Paginação padrão vinte/máximo cinquenta, leituras 120/minuto e mutações
  30/minuto por conta, CSRF, isolamento de estado e autorização atuais permanecem.

## Complementos confirmados em T12

1. **Bilhete:** D04 de até **2.000 caracteres Unicode**, texto simples
   obrigatório, sem apenas espaços; um bilhete atual por relação com versões
   preservadas. Envio/substituição permitido durante pausa; relação ou loja
   encerrada mantém consulta/leitura das versões e bloqueia novos envios.
   Não adicionar exclusão ou envio vazio como forma implícita de retirar bilhete.
2. **Reações:** seis opções **❤️, 👏, 🥹, 🔥, 😂 e 🌷**,
   uma por pessoa por registro/ticket, podendo trocar ou remover. Escrita segue
   `Conversation.writable`, inclusive histórico de relação encerrada quando a
   conversa permanece aberta. Conversa fechada permite só consulta. Remoção não
   gera aviso; adicionar/trocar gera aviso à outra pessoa. Não existe texto livre
   de reação nem um novo limite de 500: esse limite pertence aos comentários.
3. **Novidades e preferências:** agrupar comentários/reações da mesma pessoa,
   para o mesmo destinatário e item da mesma loja, em janelas de **cinco minutos**.
   Bilhetes, análises/pontos, tickets e publicações de álbum não são fundidos
   com interações sociais. “Silenciar interações desta loja” retira os avisos
   sociais do contador de atenção, mantendo-os consultáveis na central/mural.
   Preferência separada para aviso de aprovação automática, ligada inicialmente
   para preservar o comportamento atual. Desativar também afeta só o contador,
   sem esconder a decisão. Ao reativar, itens ainda não lidos voltam ao contador;
   silenciar nunca equivale a marcar como lido. Sem controle fictício de push.

Esses três itens foram propostos pelo implementador e confirmados pelo
idealizador no aceite integral deste desenho. O restante detalha contratos
técnicos dentro dos requisitos existentes, sem ampliar o recorte de produto.

## Bilhete: edição, versões e leitura

Pessoas recebe detalhe secundário autorizado: nome, saldo da relação, registros
em análise, conquistas recentes, resgates, mural e “Escrever bilhete”. Cada bloco
abre a consulta existente com filtro daquela pessoa; não copiar dados de outra
participação para preencher estados vazios.

Editor tem texto, contador Unicode, prévia e envio explícito. Atualização recebe
UUID de operação e versão esperada; primeira versão espera zero. Projeção atual,
versão imutável, autor/instante e outbox para o destinatário confirmam juntos.
Concorrência exige revisão e preserva o rascunho em memória. Replay da mesma
UUID/corpo devolve versão aplicada e bilhete atual autorizado sem duplicar aviso.
Não guardar texto em URL, localStorage, sessionStorage, logs ou mensagens de erro.

GET da Lojinha/coração retorna só o bilhete atual da própria participação e seu
estado de leitura. O indicador não lido pertence à versão, não à loja inteira.
Abrir conteúdo e registrar leitura são operações distintas: o cliente confirma
o ID exato da versão efetivamente mostrada depois de a resposta ser renderizada.
Nova versão enviada durante o painel aberto permanece não lida; mostrar aviso
“Há um bilhete novo” com ação de abrir a nova versão, sem substituição silenciosa.

Notificação de versão antiga pode abrir aquela versão autorizada; marcar sua
leitura não afeta a atual. Isso não cria uma tela de arquivo/favoritos. Se a
versão não puder mais ser consultada por política de retenção, explicar ausência
sem mostrar outro bilhete como se fosse o mesmo. “Guardar esse carinho” fecha o
painel e devolve o foco; não cria uma coleção pessoal.

Recebimentos de leitura usam vínculo próprio e versão exata com unicidade;
repetição é idempotente. DTO do lojista, lista de pessoas, dashboards, eventos e
diagnóstico nunca expõem `readAt`, não lido ou contagens de leitura do participante.
Outbox de envio não inclui esses recebimentos. Ler uma versão não a reenvia.

## Reações, conversa e mural

API de reação recebe estado desejado explícito (`emoji` permitido ou `null`),
UUID e versão esperada da reação daquele autor/item. Não usar “toggle” sem
estado esperado: uma resposta perdida não pode remover uma reação por repetição.
Adicionar/trocar/remover preserva auditoria e audiência, mas não toca qualquer
comando de análise, realização, saldo ou estoque. Operação sem mudança não gera
novo aviso. Cada pessoa altera apenas sua própria reação; ambas veem as escolhas
da dupla e rótulos acessíveis, sem ranking ou número global de outras pessoas.

Mural projeta registros efetivamente recebidos e tickets emitidos, sem rascunhos
de conquista ou mídia não publicada. Um card por origem mostra estado atual,
data da origem, resumo autorizado, reações e acesso à conversa existente.
Ordenar pela recepção/emissão decrescente e ID estável; nova interação não cria
uma conquista duplicada nem muda a data original do card. Reações/comentários
recentes aparecem como informação do card e nos avisos.

Filtros por tipo, estado e período; filtro de pessoa só na visão do lojista.
Paginação não consulta todas as conversas para depois filtrar no navegador.
Participante tem “Só você e [lojista] veem este mural” e não recebe IDs, nomes,
saldos, fotos, bilhetes ou atividade de terceiros. Lojista recebe identificação
da pessoa apenas em sua audiência atual. Links abrem a origem autorizada,
preservando filtros de retorno permitidos da mesma loja.

O mesmo componente contextual de reação/conversa é reutilizado em detalhe e
mural; não criar comentários independentes no feed. `commentsClosedAt` continua
sendo o contrato de escrita. Suspensão ou revogação elimina consulta, mutação e
replay, mesmo que o registro/ticket e seu histórico permaneçam armazenados.

## C04, agrupamento e preferências

Central global em `/notificacoes`, separada de uma loja específica, com filtros
de loja e categoria. Cards indicam contexto, autor, descrição do evento, data,
leitura e quantidade agrupada quando social. Contador do sino considera apenas
grupos com itens não lidos e avisos ativos segundo as preferências atuais.
Cards silenciados continuam consultáveis e identificados como sem aviso ativo.
Não misturar lojas ou relações, mesmo para a mesma conta ou emoji.

Preservar OutboxEvent/Notification por evento como fonte imutável e prova de
entrega; o agrupamento é uma projeção sobre essas notificações, com ID estável e
versão. A versão cresce quando chega uma interação, inclusive entrega tardia.
Marcar grupo lido recebe a versão exibida e afeta apenas seus membros observados;
uma interação que chegou depois continua não lida. Repetição do consumidor ou do
comando de leitura não duplica grupos, origem ou aviso. A data de entrega mantém
recuperável um evento antigo processado depois, sem trocar o instante original.

Categorias: bilhetes, atividades/análise, mimos/tickets/álbuns e interações.
Outbox T11 de uma publicação já agrupada permanece uma única novidade; não
expandir um aviso por arquivo. Destinos de análise/estorno preservam referência
ao evento/movimento e os tipos atuais. Aviso de reação removida não é criado;
aviso histórico de adição não concede acesso a uma reação que já não existe.

Ao abrir aviso de outra loja, resolver destino sob autorização atual, mostrar
nome/papel do contexto e só então trocar a navegação. Não confiar em caminhos,
perfis ou destinatários enviados pelo cliente; destinos são derivados do
servidor. Falha de acesso não exibe prévia do recurso. Marcar aviso lido não
equivale a ler bilhete nem altera aprovação ou status de ticket.

Preferências acessíveis em Minha conta e por loja: silenciar interações e
avisar aprovação automática. Persistir por conta/vínculo e versão, com
autorização atual, conflito revisável e repetição segura; não alterar preferências
de outra pessoa. Decisões financeiras, cancelamento e recuperação de pendências
continuam visíveis, independentemente dessas duas preferências. Push P1 permanece
separado e não há pedido de permissão, configuração de provedor ou toggle que
proponha uma entrega ainda inexistente.

## L02 e P01 com dados reais

Resumo do lojista usa consultas agregadas restritas à loja gerenciada e às
relações não revogadas. Checklist derivado de apresentação/configuração real,
atividade ativa, mimo ativo e primeiro convite/participação; não persistir uma
conclusão fictícia nem exigir os passos para acessar histórico. Atalhos levam
aos fluxos existentes e respeitam pausa/encerramento.

Registros em análise contam recebidos PENDING/CONTESTED; tickets a realizar
contam WAITING_AGREEMENT/AGREED/CANCELLATION_REQUESTED; participantes ativos
excluem encerrados/revogados, com histórico acessível separadamente. Tickets de
participação encerrada ainda pendentes continuam no trabalho a resolver.
Acontecimentos recentes vêm dos eventos confirmados, paginados, com autor e
origem autorizados. Anulação, cancelamento e devolução permanecem identificados;
devolução não vira ganho de atividade. Resumo não apresenta recibo de bilhete.

P01 substitui apresentação genérica por saudação da conta, identidade real de
quem preparou a loja, potinho disponível e pendente, atalhos das atividades
disponíveis, vitrine com categorias e cartão do bilhete atual. Estado diário
reutiliza T07/T08 e não inventa percentual de rotina sem denominador definido;
atividade semanal mantém sua unidade. Saldo negativo é exibido corretamente e
não vira zero na interface. Sem somar pontos de outras lojas.

Coração e sino são controles distintos, com nomes acessíveis, indicadores e
estados vazios reais. Participante conserva exatamente Lojinha/Atividades/Meus
mimos na navegação principal; mural, extrato, conta e seletor são complementares.
Lojista usa Resumo/Atividades/Mimos/Pessoas, movendo extrato, convites e
configurações para acessos auxiliares conforme design. No desktop, apresentar
navegação lateral sem duplicar controles ou esconder o contexto.

Atualizar os agregados após aprovação, resgate, realização, cancelamento,
bilhete e interação por invalidação compartilhada. Troca de loja/papel descarta
projeções da origem e carrega o novo conjunto autorizado junto. Erro de um bloco
não pode mostrar dados antigos de outra conta como fallback; erro financeiro
não é apresentado como saldo zero. Reconsultar após offline, retorno à aba ou
queda do transporte de eventos mantém correto o uso entre dispositivos.

## Contratos e proteções de persistência

Novos contratos tipados incluem NoteVersion/NoteCurrent, ReactionState,
FeedPage, NotificationGroupPage/Preferences e Merchant/ParticipantDashboard.
Rotas propostas sob a loja: detalhe de pessoa, `bilhete` da própria relação,
bilhete da participação para o lojista, leitura de versão, operação de envio,
reação da conversa, `mural` e `resumo`. Central acrescenta grupos e preferências
sem quebrar as rotas T05 de notificações individuais. Campos finais ficam para
o plano; nenhuma rota aceita uma audiência arbitrária sem conferir sua origem.

Uma projeção de bilhete aponta à versão atual; versões e operações são
imutáveis. NoteRead pertence ao destinatário e à versão exata. Reaction mantém
estado por autor/conversa com evento imutável de mudança. FKs compostas,
unicidades, RLS/grants e guardas diferidas protegem contexto e auditoria;
projeções/versões/outbox confirmam na mesma transação. Nenhuma escrita direta
do navegador no ledger, ticket, decisões ou tabelas privadas é adicionada.

Projeção de grupo associa cada Notification a um grupo privado sem trocar sua
origem. Preferência não apaga fonte de domínio nem muda o resultado da entrega.
Limitar payloads e paginação; novas consultas não retornam o texto de todos os
bilhetes nem os comentários completos para compor contagens. Retenção de
histórico estruturado segue D08 e a operação T14; este desenho não promete
retenção ilimitada de versões/textos.

Mutação com UUID/digest e versão, replay reautorizado, lookup antes de repetir
uma intenção incerta e 409 exigindo revisão seguem o padrão T10. A resposta
distingue versão aplicada do estado atual quando isso muda após outras ações.
Leituras não criam versão ou marca de leitura implicitamente. 401/403/404
descartam conteúdo do contexto cuja audiência falhou; sessão inválida limpa
toda a área privada. Em uma notificação revogada, retirar a prévia e reconsultar
a central autorizada. Troca de conta/sessão aborta respostas antigas e descarta
rascunhos, versões, indicadores e preferências anteriores.

## Aceite e evidências necessárias

1. Lojista envia para Ana, nunca Bia; duas contas/dispositivos consultam o
   mesmo bilhete. Abrir versão antiga enquanto chega nova não marca a nova.
   Nenhum DTO/erro/log de lojista revela leitura. Unicode 2.000/2.001 e conflitos.
2. Adicionar/trocar/remover cada reação permitida, concorrência e resposta
   perdida não duplicam estado/aviso. Reagir/comentar não muda pontos, ticket,
   estoque, crédito, análise ou realização.
3. Mural com registros manuais/automáticos/contestados/anulados e tickets
   realizados/cancelados preserva origem e privacidade. Rascunhos e mídia não
   publicada não aparecem. Loja, pessoa, período e paginação isolam a audiência.
4. Agrupamento social não funde decisão financeira ou álbum. Leitura de grupo
   antigo durante nova interação deixa a nova não lida; entrega tardia e dois
   consumidores não perdem/duplicam avisos. Preferências silenciam só o previsto
   e seguem a conta entre dispositivos sem mudar decisões.
5. L02 vazio/em uso e P01 real refletem aprovação, resgate, realização,
   cancelamento e saldo negativo sem dados demonstrativos ou de outra loja.
   Devolução de resgate não é ganho de atividade. Troca de papel altera toda
   a navegação/conjunto; pontos de lojas distintas nunca são somados.
6. Conta suspensa/revogada, admin sem relação, replay, IDs de outra loja/pessoa,
   consultas em lote, notificação/destino e caches negam o conteúdo privado.
   Queda de eventos/offline e nova consulta recuperam dados confirmados.
7. HTTP com Auth/PostgreSQL reais prova versões/leitura e efeitos atômicos;
   falhas forçadas em auditoria/outbox revertem a ação. Chromium cobre teclado,
   foco, painel/dialog/Escape, 320/390 px, texto 200%, movimento reduzido e
   401/403/404/409/429/503. Aparelhos reais, leitor de tela e Realtime efetivo
   precisam de evidência própria; polling não declara canal ao vivo testado.

Orquestração posterior à aprovação: contratos/esquema primeiro, escritores
separados de domínio/API, UI e testes, revisão independente somente leitura.
Root serializa Git, serviços, bancos, typegen e builds em domínio/dev/shadow
T12 e namespaces separados, com Next 4310/mídia 4311 em loopback. Nenhuma
migração aplicada é alterada. Não iniciar plano executor ou código desta etapa
antes de confirmar o desenho e concluir suas dependências.

## Fontes e pendências

Fontes locais: roadmap T12; requisitos RF-13–RF-19, RNF-10, §3.4, D04/D08;
design C04/C05/L02/P01/P10, §§6–7 e §15; arquitetura de conversa/outbox e
autorização; serviços atuais de notificações/conversas/atividades/pontos;
workspace/navegação/Pessoas; desenho T11 confirmado. Inspeção somente
leitura em 22/10/2026, sem consulta externa com código ou dados privados.

O desenho e seus complementos estão confirmados. A execução está detalhada no
[plano T12](../plans/2026-10-22-t12-relacao-paineis.md), preparado com writing-plans.
A preparação original foi somente documental. A execução posterior consumiu
T11 concluída e está registrada no plano, com as verificações locais efetivas.
