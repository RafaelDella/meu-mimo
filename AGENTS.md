# Meu Mimo

## Comece aqui

- Produto e aceite: [requisitos.md](requisitos.md).
- Decisões técnicas: [arquitetura.md](arquitetura.md).
- Interface e linguagem: [design.md](design.md).
- Entrada no projeto: [README.md](README.md) e [docs/onboarding.md](docs/onboarding.md).
- Ferramentas, fontes e evidências: [docs/setup.md](docs/setup.md).
- Qualidade, revisão e avaliação do agente: [docs/quality.md](docs/quality.md).

## Estado e comandos

A demonstração está em `prototype/`: HTML, CSS e JavaScript ESM.
`prototype/dist/` é código-fonte manual e deve ser versionado e verificado.
A fundação Next.js/React/TypeScript está em `web/`, com Node.js 24 e npm.
As composições de T03 estão em `/visual-check`, com dados fictícios e sem
persistência; componentes compartilhados em `web/src/components/ui/`.
T02 acrescenta identidade/API com Supabase Auth e PostgreSQL/Prisma locais;
os comandos e a separação de credenciais estão em `docs/onboarding.md`.
T04 entrega lojas, participações e convites; recursos e comandos em `docs/stores-local.md`.
T05 prepara conversas e outbox/notificações; comandos e fronteiras em `docs/relation-local.md`.
T06 prepara transporte e processamento de mídia privada; comandos e pendências
de retenção em `docs/media-local.md`.
T07 entrega atividades, conquistas e crédito automático; comandos e limites em
`docs/activities-local.md`. T08 entrega análise, complementos, compensações e
extrato; comandos e limites em `docs/points-local.md`.
T09 entrega catálogo, resgates e tickets; contratos e comandos em `docs/rewards-local.md`.
T10 acrescenta combinado, realização, cancelamento/devolução e reposição explícita;
contratos e comandos em `docs/tickets-local.md`.
T11 integra álbum privado por ticket e retenção da origem; contratos e comandos
em `docs/albums-local.md`. Os testes de mídia usam tickets reais na cadeia atual.
T12 integra relação, novidades e painéis; a validação local e os comandos estão
em `docs/relationship-local.md`. Bancos T12 dev/shadow/integração são separados,
com namespaces próprios; Next 4301/4310 e mídia 4311 continuam em série.
O plano da fundação e as dependências estão em
[M0](docs/superpowers/plans/2026-10-22-m0-fundacao.md).

Na raiz:

```sh
npm ci
npm --prefix web ci
npm run dev
npm run web:dev
npm run lint
npm run lint:rules
npm test
npm run check
```

O protótipo atende em `http://127.0.0.1:4173`; a aplicação em
`http://127.0.0.1:4301`. Execute cada servidor em seu terminal.
`web:typecheck` e `web:build` verificam a aplicação; `web:test:e2e` testa o build
com Chromium previamente instalado pelo Playwright. O `check` agrega a base e
`web/`, sem iniciar banco. Lint da raiz cobre a base; `web:lint` cobre `web/`.
Os comandos de `prototype/package.json` continuam válidos naquela pasta.
`WEB_TEST_PORT` altera somente a porta do servidor de testes (padrão 4301;
T03 usa 4303). Builds, typegen e servidores continuam serializados no checkout.
Integração real usa `web:test:integration`, stack `meumimo-t02` e aplicação 4302;
T04 usa `npm --prefix web run test:integration:t04`, domínio `meumimo_t04` e 4310.
T08 usa `test:integration:t08`, domínio `meumimo_t08`, Next 4310/mídia 4311,
Storage com prefixo próprio e bancos dev/shadow separados.
T09 usa `test:integration:t09`, domínio `meumimo_t09`, as mesmas portas em série
e namespaces `t09-development`/`t09-integration`, com dev/shadow separados.
T10 usa `test:integration:t10`, domínio `meumimo_t10`/dev/shadow, namespaces próprios
e Next4310/mídia4311, em série com os modos anteriores.
T11 usa `test:integration:t11`, bancos `meumimo_t11`/dev/shadow, namespaces próprios
e as mesmas portas em série. Não alterar as treze migrações já aplicadas.
T12 usa `test:integration:t12` e bancos `meumimo_t12`/dev/shadow. A cadeia atual
tem quatorze migrações aplicadas e 37 tabelas com RLS; correções são aditivas.
T05 usa `test:integration:t05`, domínio `meumimo_t05` e a mesma porta em série;
o consumidor local tem comando próprio e credencial restrita.
T06 usa `test:integration:t06`, bancos `meumimo_t06`/dev/shadow e gateway local
4311 separado; nunca passar service role ao Next. D08 foi confirmada; proteção
de retenção permanece conservadora até a integração pela origem.
T07 usa `test:integration:t07`, domínio `meumimo_t07`, Next 4310 e mídia 4311,
em série com os modos anteriores. O namespace de Storage é `t07-integration`;
desenvolvimento usa banco e namespace próprios.
Prepare serviços e migrações conforme o onboarding. Não exponha as portas fora
de loopback, não use o shim npm `docker` e não passe credenciais de fixture ou
migração ao Next. Desenvolvimento, shadow e integração usam bancos separados.

## Acordos de trabalho

- Leia as instruções, o código relevante e o documento responsável antes de editar.
- Faça a menor mudança completa que atenda ao pedido; preserve alterações locais.
- Defina o aceite, reproduza falhas e execute os checks afetados antes de concluir.
- Preserve validação, tratamento de erros, acessibilidade e os sete testes de domínio.
- Separe comportamento implementado, decisão confirmada e proposta futura.
- Atualize o documento canônico junto com mudanças de contrato ou configuração.
- O estado em `localStorage`, os 240 pontos e as pessoas da prévia são demonstração.
  Não os trate como autenticação, autorização ou dados confiáveis de uma aplicação real.
- Preserve Prisma e os documentos existentes; a receita genérica de Drizzle do
  toolkit não substitui a decisão deste projeto.
- Mantenha credenciais, arquivos `.env`, backups e relatórios sensíveis fora do Git.
- Preserve o cliente, modelo, autenticação e permissões escolhidos pelo usuário.
  Este setup não altera a configuração global nem duplica o Context7.
- Responda em português com clareza e concisão; código e documentos usam prosa normal.
- Continue o trabalho autorizado após responder perguntas de status. Um bloqueio
  afeta suas dependências; ao retomar, confira arquivos, processos e checks reais.
- Use delegação somente quando autorizada e útil, com escopo explícito, um escritor
  por arquivo e revisão independente somente leitura. Verifique os resultados.
- Publicação, serviços pagos, migrações reais, mensagens externas e ações destrutivas
  dependem da autorização correspondente. Não instale hooks Git ou bloqueios de branch.

## Contexto e ferramentas

Use este arquivo como índice; carregue os documentos detalhados conforme a tarefa.
Consulte Context7 para APIs da versão usada quando a integração estiver carregada;
use documentação oficial e registre a limitação quando ela estiver indisponível.
Não envie código privado, dados pessoais ou segredos nas consultas.

Antes de depender de uma skill ou MCP, confirme sua descoberta no cliente.
O inventário de skills locais, os equivalentes de processo e as integrações
pendentes estão em `docs/setup.md`. Instalação em disco não prova ativação.
Revisões de UI devem incluir teclado, foco, estados, movimento reduzido e celular.
Não acrescente serviços ou dependências apenas para cumprir um catálogo.
