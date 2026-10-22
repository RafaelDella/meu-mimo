# T05 — conversas e notificações persistidas

**Base:** 2c6662c. **Estado:** desenho e limite de 500 caracteres confirmados
pelo idealizador em 22/10/2026.
**Fontes:** roadmap T05, requisitos RF-15/RNF-02–04/10/19 e design §15–16.

## Resultado e abordagem

Preparar a conversa privada de cada registro/ticket e entregar novidades no app
com repetição segura. Manter Next, Prisma 7.10.1, PostgreSQL e Auth existentes.
Outbox no PostgreSQL e consulta autorizada são a abordagem escolhida pelo
integrador dentro do roadmap. Realtime é opcional e não é necessário à prova de
recuperação: uma consulta posterior encontra avisos persistidos mesmo sem sinal.
Uma fila externa acrescentaria infraestrutura sem benefício demonstrado neste
pacote. Não há mensagens externas, e-mail, push ou serviço novo.

O aceite real de convite de T04 passa a gerar uma novidade para o lojista na
mesma transação da participação/aceite. Repetir o aceite ou abrir a própria loja
não produz outro evento. Conversas são registradas por T07/T09 na transação do
recurso de origem; T05 não inventa registros/tickets nem permite criá-los por API.

A central completa de novidades, preferências, agrupamento social, reações e
bilhetes ficam em T12. T05 entrega serviços, APIs e componente reutilizável de
conversa. O componente só será montado nos recursos reais das próximas tarefas;
seus estados são testados em uma composição de teste explicitamente fictícia.

## Audiência e comentários

Cada conversa é de um registro ou ticket, em uma loja e participação específicas.
Somente o participante daquela relação e o lojista da loja têm acesso. Concessão
administrativa não dá acesso. Identidade, suspensão, sessão e vínculos atuais
são verificados no servidor; `accessRevokedAt` nega acesso, `closedAt` preserva
consulta. Não há chat coletivo, criação pública de conversa nem mudança pública
de destinatário/assunto.

Uma função interna registra assunto SUBMISSION/TICKET e IDs validados, sob o
mesmo StoreScope/transação do domínio. Os módulos T07–T10 são responsáveis por
criar/remover o vínculo real com o recurso e definir quando fechar sua escrita.
Pausa/encerramento da loja ou participação não bloqueiam por si só a conversa
existente, necessária a pendências. `commentsClosedAt` do assunto permite tornar
a conversa somente leitura. A política do recurso não é inventada em T05.

Comentários são texto simples, sem HTML, edição, exclusão ou anexos nesta etapa.
Autor e instante vêm do servidor. UUID da operação identifica o comentário;
repetição com mesmo autor, conversa e texto normalizado retorna o existente,
reutilização com outros dados falha com conflito. Comentário e evento são
confirmados juntos. Não notificar o próprio autor.

**Confirmado:** até 500 caracteres Unicode por comentário, conforme
design §15.2/D04. Textos vazios/controles inválidos são rejeitados. Paginação
20/máximo 50 e limites 120 leituras/30 mutações por minuto por conta reutilizam
o contrato confirmado de T04, incluindo o mesmo bucket para não multiplicar o
limite ao alternar módulos. O componente informa limite e estado de envio,
preserva pedido/UUID após resultado incerto e descarta estado ao trocar contexto.

## Dados e entrega

Quatro novas entidades em app, com FKs, restrições, RLS e grants mínimos:

- Conversation: assunto tipado/ID único, loja, participação, criação e fechamento
  de comentários. Registro somente interno e imutável quanto à audiência.
- Comment: UUID da operação, conversa, autor, texto e instante; índice de ordem.
- OutboxEvent: chave única, tipo INVITATION_ACCEPTED/COMMENT_CREATED, loja,
  participação, autor, vínculo de destinatário e origem tipada (convite ou
  comentário); criação, disponibilidade, tentativas, código de falha e processado.
- Notification: evento único, criação da entrega e leitura da própria novidade.
  Destinatário e contexto derivam do evento imutável, evitando cópias divergentes.

O consumidor interno bloqueia um evento disponível com FOR UPDATE SKIP LOCKED,
materializa a notificação e marca processado na mesma transação curta. Não há
posse fora dessa transação; queda reverte tudo e outro consumidor retoma. Não
são necessários lease/fencing enquanto a entrega se limita ao mesmo banco.
Falhas mantêm evento pendente e recebem tentativas/backoff limitado em uma
transação posterior, somente se ainda não processado, sem texto privado no log.
Não descartar silenciosamente um evento após um número arbitrário de falhas.

O worker Node é separado do Next e usa só credenciais restritas. O driver local
inicia/encerra seus próprios processos; não há endpoint HTTP de drain nem
destinatário arbitrário no cliente. O modo manual --once permite diagnóstico e
prova de falha/repetição; produção/scheduler dependem de T14.

Consultas filtram pelo destinatário e autorização atual da loja/relação/recurso.
Não retornam avisos ou contagens de acesso revogado. Marcar um aviso como lido é
idempotente e não marca eventos posteriores. Ordenação pela data da entrega e ID
permite encontrar eventos antigos entregues depois; não depender de watermark
do instante de origem. Destino é tipado e derivado, nunca URL enviada pelo autor.
Convite aceito aponta para Pessoas; destinos de registro/ticket são resolvidos
como referências autorizadas e serão montados pelos módulos de origem.

## Recursos, aceite e limites

Reutilizar stack meumimo-t02 em loopback, com Auth postgres e domínio isolado
meumimo_t05, dev/shadow próprios e porta de integração 4310. Não resetar bancos.
Preservar modos T02/T04, serviços e sete testes do protótipo. Root serializa
migrações, npm/build/portas/fixtures. Escritores têm arquivos exclusivos e
revisores independentes são somente leitura. Commit só pelo integrador.

Provar: audiência entre dois participantes/lojas; sessão/suspensão/revogação;
comentário repetido/concorrente; operação com dados diferentes; rollback sem
evento órfão; entrega repetida/concorrente; falha/queda e recuperação sem aviso
parcial; consulta depois de evento perdido/entrega atrasada; leitura isolada e
destino reautorizado; grants/RLS e migração vazia/evolutiva. UI: 320/390, 200%,
teclado/foco, movimento reduzido, texto renderizado como texto e resposta incerta.
Não alegar teste de leitor/aparelho/mensageiro real ou CI remoto sem observação.
