# Meu Mimo

Uma lojinha privada de atividades, pontos e recompensas afetivas. Este repositório
contém o planejamento do produto, um protótipo navegável e a fundação da aplicação.

## Executar a prévia

Com Node.js 24.12 ou superior da série 24 e npm, na raiz:

```sh
npm ci
npm --prefix web ci
npm run dev
```

Abra [a prévia local](http://127.0.0.1:4173). Para encerrar, use `Ctrl+C`.
O conteúdo estático continua funcionando sem dependências de produção ou build.
As dependências de desenvolvimento da raiz servem aos checks do projeto.

```sh
npm run check
```

Esse comando verifica as regras locais, executa ESLint e roda os testes existentes.
Também verifica lint, tipos, testes e build de `web/`. Para detalhes e limitações,
consulte [qualidade](docs/quality.md).

## Executar a aplicação

```sh
npm run web:dev
```

Abra [a aplicação local](http://127.0.0.1:4301). A página inicial apresenta o Meu Mimo.
A [nova interface](http://127.0.0.1:4301/visual-check) reúne Lojinha, detalhe de
mimo e resumo do lojista, com componentes acessíveis e dados fictícios.
T02 acrescenta [conta](http://127.0.0.1:4301/conta) e APIs de identidade e
autorização, dependentes da stack local descrita no [onboarding](docs/onboarding.md).
T04 acrescenta [Minhas lojas](http://127.0.0.1:4301/lojas), criação, pessoas,
configurações, convites e edição do nome da conta. Prepare os bancos conforme
[lojas locais](docs/stores-local.md).
T05 prepara comentários privados e novidades persistidas; o consumidor local e
as APIs estão descritos em [conversas e novidades](docs/relation-local.md).
T06 acrescenta transporte e processamento privado de fotos/vídeos; preparação e
fronteiras em [mídia local](docs/media-local.md). D08 foi confirmada; a proteção
de retenção é atualizada por cada origem integrada.
T07 entrega atividades, conquistas e crédito automático único, com foto privada,
histórico e saldo real da participação. Preparação em [atividades locais](docs/activities-local.md).
T08 acrescenta aprovação manual, contestação/complemento, compensações e extrato
com filtros. Preparação em [análise e extrato locais](docs/points-local.md).
O servidor da prévia em 4173 continua independente.

Para verificar o navegador depois de `npm run check`:

```sh
npm --prefix web exec -- playwright install chromium
npm run web:test:e2e
```

O Playwright inicia o build local, espera a resposta HTTP e encerra seu servidor.
Se a porta estiver ocupada, encerre somente seu servidor antes do teste.
`WEB_TEST_PORT` aceita outra porta local; T03 foi conferida em 4303.

## O que existe hoje

O [protótipo](prototype/README.md) oferece atividades diárias, pontos, catálogo,
resgate de tickets, extrato e bilhete, com dados de demonstração salvos no navegador.
`web/` fornece a fundação Next.js/React/TypeScript, as composições estáticas de
T03, identidade local T02 e lojas/participações/convites T04 com Supabase
Auth/PostgreSQL/Prisma. A prévia visual não salva dados nem desconta pontos.
T05 acrescenta APIs de conversa e notificações persistidas com outbox. T06 prepara
mídia privada com derivados e retomada. T07 integra registros reais de atividade,
pendência manual e crédito automático consultável. T08 integra análise,
complementos, estorno/recomposição e extrato real. Resgates/tickets, álbuns,
Realtime e a central completa de novidades
permanecem no roadmap.

A aplicação completa está descrita nos documentos abaixo. A adoção do toolkit
prepara o desenvolvimento e mantém o estágio atual explícito.

| Fonte canônica | Responsabilidade |
| --- | --- |
| [requisitos.md](requisitos.md) | Escopo, prioridades e critérios de aceite do produto |
| [arquitetura.md](arquitetura.md) | Decisões e proposta técnica, incluindo Prisma |
| [design.md](design.md) | Identidade, telas, estados e acessibilidade |
| [Roadmap de implementação](docs/superpowers/plans/2026-10-22-roadmap-implementacao.md) | Marcos, dependências, critérios de aceite e orquestração do MVP e da evolução |
| [M0 e plano da fundação](docs/superpowers/plans/2026-10-22-m0-fundacao.md) | Decisões registradas, versões selecionadas, pendências e plano de T01–T03 |
| [AGENTS.md](AGENTS.md) | Instruções e comandos compartilhados para agentes |
| [docs/onboarding.md](docs/onboarding.md) | Preparação, execução e diagnóstico local |
| [docs/quality.md](docs/quality.md) | Gates, revisão e avaliação do agente |
| [docs/setup.md](docs/setup.md) | Toolkit, versões, integrações, evidências e manutenção |

## Estrutura

```text
prototype/dist/         HTML, CSS, JavaScript e assets da prévia; são fontes
prototype/server.mjs    Servidor local sem dependências
prototype/tests/        Testes de regras e persistência da demonstração
web/                   Aplicação Next.js com pacote e lockfile próprios
web/tests/             Testes de fronteira, lint e navegador da fundação
eslint-rules/           Regras locais derivadas do toolkit
scripts/               Autoverificação dessas regras
docs/                  Operação, qualidade, setup e atribuições
```

O setup usa o [Vibe Coding Toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit)
na revisão registrada em `docs/setup.md`. Os documentos anteriores permanecem
canônicos; o toolkit não altera a decisão por Prisma nem publica a aplicação.
