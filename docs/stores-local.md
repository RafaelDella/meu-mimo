# Lojas locais — T04

T04 usa o mesmo Auth de [T02](identity-local.md), com domínio em banco próprio.
É desenvolvimento/teste fictício; não publica nem contrata serviços.

## Preparação

Após preparar T02, execute na raiz, sem servidores Next concorrentes:

```sh
npm --prefix web run local:prepare:t04
npm --prefix web run db:migrate:dev:t04
npm --prefix web run db:migrate:integration:t04
npm --prefix web run db:migrate:check
npm run check
npm --prefix web run test:integration:t04
npm run web:test:e2e
```

`local:prepare:t04` cria, se ausentes, `meumimo_t04`, `meumimo_t04_dev` e
`meumimo_t04_shadow` em 127.0.0.1:54322. Não reseta bancos. Auth mantém
`postgres`; as fixtures usam conexões administrativas separadas para Auth e
domínio. O estado privado fica em `.artifacts/t04-runtime/integration.json`.
O segredo e senha do papel local são compartilhados com T02, para preservar
seus processos. Nunca copie esse estado para documentação ou Git.

O bootstrap gerencia `.env.local` marcado, apontando o desenvolvimento ao banco
T04 e porta 4301. Arquivo personalizado é preservado. `npm run web:dev` abre
`/conta` e `/lojas`. Cadastro e recuperação chegam ao Mailpit local; use o
mesmo navegador para o callback. O bootstrap inclui callbacks 4301/4302/4310
no Auth local, conservando imagem/configuração e predecessor parado para reversão.

O driver HTTP usa porta 4310, recusa porta ocupada, inicia o build já preparado
com credenciais restritas e encerra só seu processo. Fixtures removem suas
lojas, convites, auditorias, relações, perfis e limites identificáveis. Mensagens
fictícias e auditoria anônima podem permanecer no ambiente local. A suíte T04
inclui as regressões T02; o comando T02 continua independente em 4302.

## Contratos e migrações

As APIs e limites estão no [plano de T04](superpowers/plans/2026-10-22-t04-lojas.md).
DTOs públicos ficam em `web/src/contracts/stores.ts`. E-mail só é devolvido ao
próprio perfil verificado; convite público e lista de pessoas não o incluem.

Migrações continuam via Prisma 7.10.1. A geração interativa `migrate dev` não
aceitou o terminal automatizado por causa do novo índice único. O SQL T04 foi
gerado com o comando oficial `migrate diff` entre o banco dev reservado e o
schema, revisado e complementado com constraints/grants/RLS na mesma migração.
O helper equivalente é `node scripts/prisma-local.mjs diff t04`, dentro de
`web/`; ele só imprime SQL. Nunca sobrescreva migração já aplicada.

Convites armazenam hash do token e recuperam a mesma URL por operationId usando
HMAC privado com separação de domínio. Rotação/versionamento da chave antes de
T14 precisa preservar ou revogar explicitamente links existentes. Criar loja e
convite tem repetição segura; o aceite bloqueia a loja durante a transação e
revalida identidade, vínculo e estado. Encerramento preserva autorização de
consulta e é distinto de revogação de acesso.

T04 ainda não tem registros, pontos ou tickets. Não exibe saldos ou pendências
fictícias. T07–T10 devem marcar `Store.domainStartedAt` na primeira operação do
domínio, na mesma transação, e integrar a consulta real de análises pendentes.
Com esse marcador, mudança de fuso e encerramento ficam bloqueados; esta última
proteção só poderá ser substituída quando as dependências reais existirem.
Mídia, bilhete, notificações e tela completa da lojinha seguem suas tarefas.

## Convites por código — evolução de 23/10/2026

O [desenho aprovado](superpowers/specs/2026-10-23-convites-por-codigo-design.md)
e o [plano](superpowers/plans/2026-10-23-convites-por-codigo.md) acrescentam CODE
sem reescrever os links T04. A interface nova envia `kind: CODE`, validade e
maxUses; o corpo legado com somente operationId conserva o contrato original.
Dez caracteres gerados, exibidos em dois grupos, identificam cada convite.
Usos contam novas participações; consultas, repetição e proprietário não gastam
cota. Sem vencimento e ilimitado usam null e são opções independentes.

A busca autenticada usa POST `/api/lojas/buscar`; código não entra em query
string ou localStorage. Resolução/aceite curto compartilham 10 tentativas por
minuto por conta e devolvem 429/Retry-After. Gestão e mutações conservam os
limites anteriores. Compartilhar o link longo continua possível; nenhuma
mensagem é enviada automaticamente.

Migração aditiva `20261023010000_invitation_codes`, com histórico de usos e
FKs/guardas/RLS, deve ser aplicada somente aos ambientes locais autorizados.
Esta evolução usa T14 dev/shadow/integração existentes e Next4310/mídia4311 em
série; não iniciar suítes T04/T14 juntas. Chave não é rotacionada na origem.
A cópia de recuperação usa chave nova e revoga CODE copiados explicitamente,
preservando vínculos/usos; exige gerar outro convite na cópia.
Evidências e estado de validação ficam no plano, sem confundir aceite do desenho
com aprovação dos checks da implementação.
