# Meu Mimo

Uma lojinha privada de atividades, pontos e recompensas afetivas. Este repositório
contém o planejamento do produto e um protótipo navegável da pessoa participante.

## Executar a prévia

Com Node.js 24.12 ou superior da série 24 e npm, na raiz:

```sh
npm ci
npm run dev
```

Abra [a prévia local](http://127.0.0.1:4173). Para encerrar, use `Ctrl+C`.
O conteúdo estático continua funcionando sem dependências de produção ou build.
As dependências de desenvolvimento da raiz servem aos checks do projeto.

```sh
npm run check
```

Esse comando verifica as regras locais, executa ESLint e roda os testes existentes.
Para mais detalhes e limitações, consulte [qualidade](docs/quality.md).

## O que existe hoje

O [protótipo](prototype/README.md) oferece atividades diárias, pontos, catálogo,
resgate de tickets, extrato e bilhete, com dados de demonstração salvos no navegador.
Não há contas reais, banco, convites, sincronização ou notificações entre pessoas.

A aplicação completa está descrita nos documentos abaixo. A adoção do toolkit
prepara o desenvolvimento e mantém o estágio atual explícito.

| Fonte canônica | Responsabilidade |
| --- | --- |
| [requisitos.md](requisitos.md) | Escopo, prioridades e critérios de aceite do produto |
| [arquitetura.md](arquitetura.md) | Decisões e proposta técnica, incluindo Prisma |
| [design.md](design.md) | Identidade, telas, estados e acessibilidade |
| [Roadmap de implementação](docs/superpowers/plans/2026-10-22-roadmap-implementacao.md) | Marcos, dependências, critérios de aceite e orquestração do MVP e da evolução |
| [AGENTS.md](AGENTS.md) | Instruções e comandos compartilhados para agentes |
| [docs/onboarding.md](docs/onboarding.md) | Preparação, execução e diagnóstico local |
| [docs/quality.md](docs/quality.md) | Gates, revisão e avaliação do agente |
| [docs/setup.md](docs/setup.md) | Toolkit, versões, integrações, evidências e manutenção |

## Estrutura

```text
prototype/dist/         HTML, CSS, JavaScript e assets da prévia; são fontes
prototype/server.mjs    Servidor local sem dependências
prototype/tests/        Testes de regras e persistência da demonstração
eslint-rules/           Regras locais derivadas do toolkit
scripts/               Autoverificação dessas regras
docs/                  Operação, qualidade, setup e atribuições
```

O setup usa o [Vibe Coding Toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit)
na revisão registrada em `docs/setup.md`. Os documentos anteriores permanecem
canônicos; o toolkit não altera a decisão por Prisma nem publica a aplicação.
