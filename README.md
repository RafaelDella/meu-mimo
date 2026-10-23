# Meu Mimo

Uma lojinha privada de atividades, pontos e recompensas afetivas. Este repositório
contém o planejamento do produto, um protótipo navegável e a aplicação local em
Next.js/React/TypeScript, com Supabase Auth, PostgreSQL/Prisma e mídia privada.

## Instalar as dependências

Use Node.js **24.12 ou superior da série 24** e npm. A versão de referência está
em `.nvmrc`; o ambiente verificado usa npm 11.19.1. A aplicação completa também
precisa de Docker Engine Linux ativo, conforme o [onboarding](docs/onboarding.md).
Git é necessário para obter atualizações do repositório.

Execute todos os comandos deste README na raiz do projeto, onde estão este
arquivo e o `package.json` principal:

```sh
node --version
npm --version
npm ci
npm --prefix web ci
```

## Preparar os serviços pela primeira vez

Com Docker ativo, sem servidores ou consumidores locais em execução e com
autorização para preparar e migrar o banco local de desenvolvimento:

```sh
npm --prefix web run local:start
npm --prefix web run local:prepare:t14
npm --prefix web run db:migrate:dev:t14
npm run web:build
```

Esse preparo usa a stack local `meumimo-t02` e o banco de desenvolvimento
`meumimo_t14_dev`. O guia de [operação local T14–T15](docs/pilot/local.md)
detalha as ferramentas, o ambiente gerenciado e o preparo adicional de integração.
Credenciais e arquivos operacionais ficam fora do Git; preserve `web/.env.local`,
journal, chaves e backups existentes ao atualizar o projeto.

## Iniciar, conferir e parar a aplicação

Para usar a aplicação com os serviços já preparados:

```sh
npm --prefix web run local:web
```

Mantenha o terminal aberto e aguarde **`LOCAL_READY`**. O supervisor coordena a
web, o processamento de mídia e as notificações, além da rotina de backup local.
Abra [sua conta](http://127.0.0.1:4301/conta) ou
[Minhas lojas](http://127.0.0.1:4301/lojas). Os e-mails de cadastro e recuperação
chegam ao [correio local](http://127.0.0.1:54324).

Em outro terminal, confira a saúde:

```sh
npm --prefix web run local:health
```

O resultado deve indicar `ready`. Para encerrar, use `Ctrl+C` no terminal do
supervisor ou execute:

```sh
npm --prefix web run local:stop
```

Aguarde `LOCAL_STOPPED`. A parada preserva os dados e os volumes da stack Docker.
O supervisor exige preparo, migrações e build atualizados; ele não executa esses
passos automaticamente. A rotina de backup depende de manter o processo e a
máquina ligados. Detalhes em [operação local](docs/pilot/local.md).

## Desenvolver com recarregamento automático

Depois de preparar os serviços, pare o supervisor e inicie o Next em modo de
desenvolvimento:

```sh
npm --prefix web run local:stop
npm run web:dev
```

Abra [a aplicação local](http://127.0.0.1:4301). Encerre com `Ctrl+C`.
Esse comando inicia somente o Next. Para desenvolver os fluxos de mídia e
notificações, execute os consumidores em terminais separados, conforme
[operação local](docs/pilot/local.md#comandos-de-qa-e-opera%C3%A7%C3%A3o).
O supervisor e o servidor de desenvolvimento usam a mesma porta; execute um
modo por vez. Pare também os consumidores próprios antes dos checks.

## Executar a demonstração sem banco

```sh
npm run dev
```

Abra [a demonstração local](http://127.0.0.1:4173) e encerre com `Ctrl+C`.
Ela usa dados fictícios salvos no navegador e é independente da aplicação.
A [prévia visual](http://127.0.0.1:4301/visual-check), servida pelo Next,
também usa dados fictícios, sem salvar cadastros ou descontar pontos.

## Atualizar o projeto

Primeiro, pare o supervisor. Se estiver usando o modo de desenvolvimento,
encerre o Next e os consumidores com `Ctrl+C` nos respectivos terminais.
Confira o trabalho local antes de buscar uma nova versão:

```sh
npm --prefix web run local:stop
git status --short
```

Se houver alterações locais, preserve-as em um commit ou em uma cópia antes de
prosseguir. Com a árvore limpa, atualize a branch atual e reinstale as dependências
pelas versões dos lockfiles:

```sh
git pull --ff-only
npm ci
npm --prefix web ci
```

Se o pull indicar divergência entre branches, resolva essa divergência antes de
continuar. Confira as instruções da nova versão; mudanças no preparo dos serviços
devem seguir o [guia local](docs/pilot/local.md). Se houver novas migrações do
recorte T14, aplique-as ao banco local de desenvolvimento com a web parada e
com a autorização correspondente para esse ambiente:

```sh
npm --prefix web run db:migrate:dev:t14
```

Valide a atualização e reinicie a aplicação:

```sh
npm run check
npm --prefix web run local:web
```

O `check` já gera o build de produção. Depois de `LOCAL_READY`, execute
`npm --prefix web run local:health` em outro terminal. `npm ci` instala as versões
fixadas; atualizar deliberadamente as versões das dependências é uma mudança
separada, com revisão dos lockfiles e novos checks.

## Verificar o projeto

Pare a web antes de executar checks, builds, geração de tipos ou testes que
compartilham o checkout. Os comandos abaixo também podem ser usados isoladamente:

| Comando | Verificação |
| --- | --- |
| `npm run check` | Lint, regras, testes da base e de `web/`, tipos e build, em série |
| `npm run lint` | Lint da base e do protótipo |
| `npm test` | Sete testes de domínio da demonstração |
| `npm run web:lint` | Lint da aplicação |
| `npm run web:typecheck` | Geração de tipos e TypeScript |
| `npm run web:test` | Testes nativos da aplicação |
| `npm run web:build` | Build de produção da aplicação |

Para verificar a interface no navegador, após `npm run check`:

```sh
npm --prefix web exec -- playwright install chromium
npm run web:test:e2e
```

O Playwright inicia e encerra seu próprio servidor e recusa reutilizar um servidor
existente. `WEB_TEST_PORT` permite outra porta local, como 4303; builds e servidores
Next continuam serializados no checkout. As provas com Auth, banco e Storage
reais usam preparo e comandos próprios no [guia local](docs/pilot/local.md).
Detalhes e limites dos checks estão em [qualidade](docs/quality.md).

## O que existe hoje

O recorte local T14–T15 reúne contas, lojas, convites, atividades e conquistas,
análise de registros, pontos e extrato, catálogo, resgates e tickets, combinado e
realização, álbuns privados, bilhetes, mural, novidades e administração por
metadados. Também inclui direitos de dados, exportação cifrada, backup,
recuperação isolada e supervisor de uso diário.

Esse estado foi validado localmente. O aceite e as pendências de dispositivos e
publicação estão em [aceite da web](docs/pilot/acceptance.md); contratos e
procedimentos continuam nos documentos canônicos abaixo.

| Fonte canônica | Responsabilidade |
| --- | --- |
| [requisitos.md](requisitos.md) | Escopo, prioridades e critérios de aceite do produto |
| [arquitetura.md](arquitetura.md) | Decisões e proposta técnica, incluindo Prisma |
| [design.md](design.md) | Identidade, telas, estados e acessibilidade |
| [Roadmap de implementação](docs/superpowers/plans/2026-10-22-roadmap-implementacao.md) | Marcos, dependências, critérios de aceite e orquestração do MVP e da evolução |
| [M0 e plano da fundação](docs/superpowers/plans/2026-10-22-m0-fundacao.md) | Decisões registradas, versões selecionadas, pendências e plano de T01–T03 |
| [AGENTS.md](AGENTS.md) | Instruções e comandos compartilhados para agentes |
| [docs/onboarding.md](docs/onboarding.md) | Preparação, execução e diagnóstico local |
| [docs/pilot/local.md](docs/pilot/local.md) | Preparo T14–T15, supervisor, saúde e uso diário |
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
