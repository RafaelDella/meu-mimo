# Conversas e novidades locais — T05

Esta fundação usa os serviços de [T02](identity-local.md), com domínio T05
isolado. Preserve os bancos/estados de [T04](stores-local.md).

## Preparar

Com Node24, pacotes instalados e stack Docker local saudável:

```sh
npm --prefix web run local:prepare:t05
npm --prefix web run db:migrate:dev:t05
npm --prefix web run db:migrate:integration:t05
npm --prefix web run db:migrate:check
npm run check
npm --prefix web run test:integration:t05
npm run web:test:e2e
```

O bootstrap cria `meumimo_t05`, `meumimo_t05_dev` e `meumimo_t05_shadow`, sem
reset; Auth continua em `postgres`.
O estado privado está em `.artifacts/t05-runtime/integration.json`, ignorado.
`.env.local` gerenciado aponta ao dev T05 e 4301; arquivo personalizado é
preservado. Nunca passe conexão de migração ou service role ao Next/worker.
Integração usa meumimo_t05/4310 em série, com regressões T02/T04 incluídas.

## Consumidor de novidades

Em outro terminal, execute `npm --prefix web run outbox:dev` junto de
`npm run web:dev`. O consumidor usa a conexão restrita de desenvolvimento,
busca lotes limitados e entrega somente em PostgreSQL. Ctrl+C encerra seu
processo. Um evento confirmado permanece pendente até o consumidor executar.

`npm --prefix web run outbox:once:t05` processa um lote no banco de integração
e imprime apenas quantidades delivered/failed; falhas dão código de saída1 e
ficam para retry. Não o execute em paralelo às suítes determinísticas de falha.
O driver de testes não inicia consumidor em background: as suítes exercitam
consumo direto/concorrente e o CLI --once com dados fictícios identificáveis.

O lock do evento, inserção idempotente do aviso e confirmação ficam na mesma
transação. Queda reverte todos; outra execução retoma. Retry usa relógio do DB,
espera de1s dobrando até60s e código de falha constante, sem texto privado.
Não há posse fora da transação, lease nem chamada externa durante o lock.
Operação em ambiente publicado/scheduler será definida em T14.

## O que esta etapa disponibiliza

O aceite de convite gera evento para o lojista na mesma transação do vínculo.
APIs de notificações consultam os avisos próprios e revalidam acesso ao abrir
destino/marcar leitura. Revogação esconde conteúdo e contagem; encerramento
preserva consulta. Nova consulta encontra entregas atrasadas sem depender de
Realtime. Não são enviados e-mail, push ou mensagens para outras aplicações.

Conversas são registradas por função interna na transação de um registro/ticket.
Não existe endpoint público para inventar assunto ou destinatário. T07/T09 devem
ligar seus recursos reais e T07–T10 definir o fechamento de escrita. A API já
permite comentário500 Unicode, paginação, repetição e audiência privada; as
fixtures são explícitas quanto aos assuntos fictícios. O destino de comentário
é referência tipada com path null até o módulo de origem fornecer a tela real.

O componente reutilizável está em `components/conversation/`; a composição
`/visual-check/conversa` é demonstração em memória, com transporte fictício.
Ela não comprova autenticação/persistência; as suítes HTTP fazem essa prova.
Central completa, agrupamento/preferências, reações e bilhete pertencem a T12.
