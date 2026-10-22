# Adoção do Vibe Coding Toolkit

## Escopo e fontes

Configuração local do projeto iniciada em 21/10/2026, com conferências em
22/10/2026. Cliente: Codex desktop, modelo e autenticação herdados da sessão.
Nenhum modelo, provedor, proxy, cobrança ou permissão global foi alterado.

Fonte única da receita: [soumatheusgomes/vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit/tree/790a895304e0c08b70a5b215c9d334f1c86b816c),
revisão `790a895304e0c08b70a5b215c9d334f1c86b816c`, obtida em diretório temporário
fora do projeto. O fluxo aplicado foi o
[prompt 12 para projeto existente](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/prompts/12-existing-project-setup.md).
Guias e templates desse toolkit vieram da mesma revisão.

Foram preservados o protótipo, a decisão por Prisma, os documentos canônicos,
o runner `node:test`, o npm e a configuração global do Context7. Não foi criada
uma aplicação Next.js sobre os arquivos atuais. A origem Git não foi trocada
pelo repositório da receita. Não houve commit, push ou publicação.

## Ambiente observado

| Item | Valor e alcance |
| --- | --- |
| Sistema/shell | Windows e PowerShell |
| Runtime | Node.js 24.12.0; npm 11.19.1 |
| Aplicação atual | HTML/CSS/JavaScript ESM; servidor `node:http` em `prototype/` |
| Produção | Nenhuma dependência npm; conteúdo estático em `prototype/dist/` |
| Ferramentas de qualidade | ESLint 10.13.0, `@eslint/js` 10.0.1, globals 17.13.0, somente desenvolvimento |
| Compatibilidade conferida | Engines e peer dependencies consultados no registro oficial antes da instalação |
| Instalador de skills | `skills` 1.7.4; instalação local para Codex com `--copy` |
| Codex CLI | 0.163.0; cliente desktop e CLI não foram tratados como uma nova sessão |
| Git inicial | Branch `master` sem commits; documentos e protótipo já existiam como arquivos não rastreados |
| Recuperação | `.artifacts/toolkit-setup/before-setup.zip`, com 64 arquivos; manifesto SHA-256 ao lado |

A instalação inicial terminou os downloads, mas aguardou o endpoint de auditoria
do npm. Ela foi interrompida e concluída com
`npm install --ignore-scripts --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1`.
Isso não altera configurações globais. A auditoria é uma operação separada;
seu resultado não deve ser inferido do sucesso da instalação.

## Mapa documental do manifesto

| Destino da receita | Fonte canônica neste projeto |
| --- | --- |
| `README.md` | [README.md](../README.md), criado como entrada |
| `PRODUCT.md` | [requisitos.md](../requisitos.md), preservado |
| `AGENTS.md` | [AGENTS.md](../AGENTS.md), comandos e índice curto |
| `CLAUDE.md` | [CLAUDE.md](../CLAUDE.md), ponte `@AGENTS.md`; Claude não foi instalado/testado |
| `docs/architecture.md` | [arquitetura.md](../arquitetura.md), preservado |
| `docs/design.md` | [design.md](../design.md), preservado |
| `docs/onboarding.md` | [onboarding.md](onboarding.md) |
| `docs/quality.md` | [quality.md](quality.md) |
| `docs/setup.md` | Este registro |

O índice de memória é `AGENTS.md`, descoberto pelo mecanismo nativo do Codex;
os detalhes ficam nos documentos indicados. Não existe memória externa ou
carregamento automático inventado de `MEMORY.md`. Revise este registro quando
mudarem cliente, runtime, scripts, stack, fontes ou integrações.

## Skills locais

Oito skills foram instaladas em `.agents/skills/`, como arquivos reais, sem
junctions ou links absolutos para caches. `skills-lock.json` registra fontes,
caminhos e hashes. Cada arquivo instalado foi comparado com a cópia upstream
da revisão abaixo, incluindo os recursos auxiliares.

| Fonte e revisão | Skills e uso |
| --- | --- |
| `obra/superpowers` — `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` | `brainstorming`, `writing-plans`: entender e planejar mudanças quando necessário |
| Mesma fonte | `systematic-debugging`: investigar falhas; `verification-before-completion`: exigir evidência antes de concluir |
| Mesma fonte | `requesting-code-review`, `receiving-code-review`: delimitar revisão e verificar achados |
| `vercel-labs/agent-skills` — `063bee94c3f4df8453406c830b0a7df0f2860278` | `web-design-guidelines`: revisão de UI; `writing-guidelines`: revisão de documentação |

Essas são skills, não uma instalação global dos plugins Superpowers. O cliente
precisa descobri-las em uma nova sessão. Leitura direta de um `SKILL.md`, hashes
e listagem pelo instalador não provam ativação automática ou execução da skill.
As instruções explícitas do usuário e autorizações já dadas prevalecem sobre
pedidos repetidos de aprovação em receitas de processo.

`find-skills`, criação de skills e ferramentas de documentos/PDF/slides/planilhas
já estão disponíveis no ambiente do Codex e não foram duplicadas no projeto.
As atribuições e as licenças encontradas estão em [licenses/README.md](licenses/README.md).

## Cobertura do catálogo e decisões

“Reutilizado” indica uma capacidade existente; “instalado” significa arquivos
verificados em disco. A execução real e as observações ausentes são registradas
separadamente. Tudo que foi adicionado tem escopo de projeto.

| Componente | Decisão e evidência/condição |
| --- | --- |
| Superpowers | Seis skills locais instaladas; descoberta em nova sessão pendente. Processo proporcional usado no setup. |
| Subagentes | Capacidade nativa reutilizada para auditoria do catálogo e revisão; tarefas somente leitura, modelo/esforço herdados. |
| Ponytail full | Princípio da menor solução completa incorporado em `AGENTS.md`; plugin/hook não instalado nem alegado ativo. |
| Caveman | Comunicação concisa em português incorporada; nenhum proxy, modelo ou plugin adicional. |
| RTK | Binário não encontrado no PATH; integração nativa é pré-requisito de máquina pendente, fora desta instalação local. Nenhum wrapper fictício. |
| ESLint/Biome | ESLint instalado com gates pertinentes; Biome adicional não se justifica nesta base pequena. |
| Context7 | Servidor global registrado, habilitado e OAuth confirmado no turno anterior. Reutilizado sem duplicação; ferramenta não carregada nesta sessão, consulta real pendente. |
| Graphify | `.graphifyignore` preparado; CLI ausente no PATH e grafo não necessário para seis pequenos módulos. Reavaliar quando relações da base justificarem. |
| Obsidian | Não aplicável: não há vault/destino ou necessidade de exportar contexto. |
| Memória leve/Claude memory | Índice e documentação versionados reutilizados; nenhuma memória específica de Claude foi alegada carregada. |
| Hooks | Não aplicáveis: não há necessidade demonstrada de interceptação. Nenhum hook Git ou de cliente foi adicionado. |
| agent-browser | Navegador do host reutilizado para fluxo local; CLI adicional não instalado. |
| Chrome DevTools MCP | Sem lacuna que justifique outro servidor. A conferência visual não equivale a uma auditoria completa de rede/performance. |
| Codex | `AGENTS.md`, skills locais e fontes portáteis adotados. Configurações pessoais ficam fora do projeto. |
| Anthropic artifact skills/skill creator | Equivalentes existentes do Codex reutilizados quando houver tarefa correspondente; não são dependências desta aplicação. |
| Vercel web/prosa | Duas skills compatíveis instaladas; sem publicação ou alteração automática de UI. |
| React/composition/transitions/React Native | Não aplicáveis ao HTML/JS atual. Reavaliar a seleção quando a implementação usar a plataforma correspondente. |
| Vercel deploy/CLI/optimize | Não selecionados: publicação, conta e métricas não fazem parte deste setup. |
| `next-dev-loop` | Não aplicável: não existem Next/Turbopack ou `/_next/mcp`. |
| `next-bundle-optimizer` | Não aplicável: não existe build/analisador Next. `dist/` continua sendo fonte. |
| PostgreSQL skill | Não aplicável à execução atual. Reavaliar ao implementar Prisma/PostgreSQL, preservando ORM e provedor escolhidos. |
| `gh-fix-ci` | Não aplicável agora: sem PR/check remoto e `gh` ausente no PATH. Um workflow local foi preparado; execução remota não validada. |
| `differential-review`/segurança | Revisão manual e prompt versionado em `quality.md`; sem intervalo Git fictício ou upload de código. |
| shadcn | Não aplicável: não há React, Tailwind ou `components.json` implementados. |
| Sentry MCP | Não aplicável: nenhum serviço, organização, projeto ou acesso Sentry foi escolhido. |
| Harness2 | Adaptação nativa documentada em `quality.md`; CLI/benchmarks não selecionados, sem API paga. |
| aia-harness/outros plugins Claude | Não aplicáveis ou redundantes com o cliente atual; não instalar outro agente para cumprir catálogo. |

Os guias específicos 17–23 foram avaliados contra a implementação, sem promover
propostas arquiteturais a integrações funcionais. O guia genérico de Codex sugere
full access; a escolha explícita anterior do usuário por `workspace-write` e
`on-request` foi preservada. Este setup não reconfigura as permissões globais.

## Evidências e limites

| Verificação | Resultado observado |
| --- | --- |
| Baseline `npm test --prefix prototype` | 7/7 testes passaram antes das mudanças |
| `npm run check` | Três regras locais verificadas, lint sem erros/warnings e 7/7 testes passaram |
| Regra de tamanho em `prototype/dist/` | Caso inválido acrescentado ao RuleTester e detectado; exclusão indevida do template removida |
| Integridade das skills | Oito cópias idênticas aos arquivos upstream; modo copy confirmado |
| Navegador local | Conquista: 240 → 270; resgate de 120: ticket e saldo 150; recarregar preservou ambos |
| CI | `.github/workflows/quality.yml` preparado para Windows e Ubuntu com o mesmo `npm run check`; execução remota não realizada |
| Context7 | Registro habilitado conferido via CLI; consulta real e carregamento nesta sessão não executados |
| Reinício do cliente | Não executado; um subagente novo não conta como reinício |
| Integrações de banco, contas e serviços | Não executadas: pertencem à aplicação futura |

A auditoria de dependências e as conferências finais são registradas nos artefatos
locais e no complemento de conclusão abaixo. Gates de JS não cobrem CSS/HTML,
autorização de uma aplicação futura ou métricas reais de dispositivos móveis.

## Manutenção e reaplicação

1. Execute `npm ci` e `npm run check` após obter o projeto.
2. Confira `skills-lock.json`, fontes e instruções locais antes de atualizar skills.
   O comando de inventário é `npx --yes skills@1.7.4 list --agent codex --json`.
3. Para atualização deliberada, use `npx --yes skills@1.7.4 update --project --yes`,
   confira o diff e repita os checks pertinentes. Não atualize skills globais como efeito colateral.
4. Para reaplicar a receita, leia o prompt 12 em uma revisão verificada. Mescle
   apenas o necessário; não copie todo o toolkit nem duplique os documentos canônicos,
   skills, servidores MCP, scripts ou hooks. Preserve personalizações.
5. Reavalie os itens não aplicáveis quando forem implementados Next, banco,
   autenticação, serviços ou publicação. Prisma continua sendo a decisão de ORM.
6. RTK e eventual Graphify exigem preparação de máquina separada. Instalações
   globais não são necessárias para usar os checks e instruções locais entregues.

As ações imediatas do usuário são abrir uma nova sessão para descobrir as skills
e carregar o Context7, e usar `npm run dev`/`npm run check` conforme a tarefa.

## Versionamento remoto do projeto

Em 22/10/2026, o destino solicitado para o projeto passou a ser
[RafaelDella/meu-mimo](https://github.com/RafaelDella/meu-mimo), com o remoto
`origin` em `https://github.com/RafaelDella/meu-mimo.git`. A importação inicial
usa `master`, preservando a branch já selecionada no checkout da raiz.

O conteúdo versionado inclui documentos, roadmap, protótipo completo, assets,
testes, ferramentas de qualidade e skills locais com suas atribuições.
`prototype/` entra como arquivos comuns, sem depender de submódulo. Seu Git
interno permanece somente no computador e não integra o conteúdo enviado.
Dependências, backups, capturas, credenciais e artefatos locais continuam ignorados.

A integração do GitHub disponível nesta sessão retornou falta de acesso ao
destino; a consulta pelo Git local funcionou. A conexão local foi utilizada
para configurar o remoto e preparar o envio. Os resultados de setup acima
continuam sendo o histórico anterior à importação inicial.

## M0 — preparação da implementação

Em 22/10/2026, M0 foi preparado na branch `codex/m0-contracts`, a partir de
`51fd20c`. O idealizador confirmou D01: Next.js/React/TypeScript em `web/`,
PostgreSQL/Prisma e Supabase Auth/Storage, com desenvolvimento/teste local,
sem contratação ou publicação. Versões selecionadas e escolhas técnicas
estão em `arquitetura.md`, seção 1.1; propostas de produto e dependências em
`requisitos.md`, seção 6.1. O [plano da fundação](superpowers/plans/2026-10-22-m0-fundacao.md)
detalha T01–T03 e as evidências.

Nesta sessão, a skill local `vibe-coding-toolkit`, as skills de processo e as
ferramentas Context7 foram descobertas. Foram executadas resolução e consulta
de documentação para Next, Prisma e Supabase; isso atualiza o estado de consulta
pendente no histórico do setup acima, sem alterar ou duplicar a configuração
global. Análises de produto/fundação foram delegadas somente para leitura;
o orquestrador manteve a escrita dos documentos.

O registro npm foi consultado e um ensaio `npm install --dry-run` em
`.artifacts/m0/compatibility/` resolveu a árvore sem criar dependências ou
lockfile no ensaio. A aplicação continua sem `web/` ou dependências de produção.
Next/React/TS, Prisma e Supabase não foram instalados. O engine de contêineres
não foi comprovado e a CLI Supabase não está no PATH; preparar serviços locais
é dependência de T02. T01 não exige esses serviços. Os gates atuais passaram
com as três regras locais e 7/7 testes da demonstração.

## M1/T01 — fundação da aplicação

T01 acrescenta `web/` como pacote independente, com lockfile próprio e versões
de aplicação/CSS/testes registradas em arquitetura §1.1. O parser
`typescript-eslint` 8.72.0 foi declarado diretamente para os testes de AST.
Banco, Prisma e Supabase continuam sem instalação ou serviço em T01.

O lint da raiz permanece no ESLint 10; `web/` usa ESLint 9 por compatibilidade
declarada dos plugins do preset Next. O npm informa que essa linha do ESLint
está fora de suporte; reavaliar a versão quando os plugins aceitarem a linha
suportada, sem forçar peers ou enfraquecer gates. A instalação também informou
postinstall de `unrs-resolver` não aprovado pelo npm local; lint e builds passaram
com a configuração efetiva, sem mudar permissões globais.

Context7 foi consultado para configuração Next, Tailwind/PostCSS e Playwright.
Os casos das regras existentes foram compartilhados, e novos casos usam AST
TS/TSX real. O build descartável rejeita o marcador `server-only` no cliente;
o layout normal o importa no servidor. Testes Chromium usam o build de produção,
com servidor próprio em 4301 e encerramento pelo Playwright. Capturas e traces
ficam em `web/test-results/`, ignorado pelo Git.

A inspeção de texto 200% encontrou rótulo do botão fora de sua superfície;
o teste foi fortalecido para conferir os retângulos de texto e reproduziu a
falha em 320/390 px. O reflow e os espaçamentos foram corrigidos, com os oito
cenários aprovados em seguida. A conferência não substitui leitor de tela ou
Android/iPhone reais. O workflow foi preparado para Windows/Ubuntu; execução
remota ainda não foi observada.

Conferência final de T01: `npm run check` aprovado com três autoverificações,
7/7 testes do protótipo, 5/5 testes nativos de `web/`, lint sem warnings,
tipagem e build. O navegador aprovou 8/8 cenários. Os dois lockfiles também
foram instalados com `npm ci` em snapshot limpo sem dependências/Git interno,
seguido do mesmo check agregado. A auditoria de produção de `web/` retornou
zero avisos; o relatório permanece em `.artifacts/`, fora do Git. A revisão
independente foi aprovada após a correção do CTA. T02/T03 não foram iniciadas.

## M1/T03 — componentes e composições

Em 22/10/2026, T03 acrescentou cinco componentes próprios e a rota
`/visual-check`, com três composições de dados fictícios. Não houve instalação
de pacotes ou serviços. Fontes locais têm licenças em `web/public/assets/`;
o protótipo foi preservado. O [plano da fundação, seção 9](superpowers/plans/2026-10-22-m0-fundacao.md#9-execução-de-t03--interface-de-referência)
registra execução, falhas tratadas, contraste, gates e limites.

A skill local do Vibe Coding Toolkit e as ferramentas nativas de agentes
foram usadas com dois escritores de escopo separado e dois revisores somente
leitura; o integrador executou builds/testes em série e preparou o commit.
Context7 foi consultado para React 19 (`ref` e sincronização de diálogo),
Next (Link/Image e worker Webpack), sem enviar código ou dados privados.
Fontes oficiais complementares: [React: Effect](https://react.dev/reference/react/useEffect),
[MDN: dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog),
[Next: build worker](https://nextjs.org/docs/app/guides/memory-usage#webpack-build-worker)
e [Google Fonts na revisão utilizada](https://github.com/google/fonts/tree/45e3d5269e4a17d823f6d84470bc084dc5ae46f6/ofl).

O servidor de testes aceita `WEB_TEST_PORT` (padrão 4301; T03 em 4303).
O fixture negativo agora tem configuração própria para executar o compilador
Webpack sem worker intermediário; a configuração de produção e a exigência
do diagnóstico de fronteira permanecem. Conferência final: check agregado
aprovado e 20/20 cenários Chromium. Não foi usado leitor de tela real nem
aparelho móvel real. T02 permanece pendente; M1 ainda está incompleto.
