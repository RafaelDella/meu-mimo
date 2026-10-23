# Identidade em todas as telas — plano de implementação

> **Execução:** nativa nesta sessão, com revisão independente somente leitura ao final.

**Objetivo:** estender a identidade aprovada em 23/10 às telas da aplicação, incluindo login, cadastro, recuperação, atividades e Meus mimos, mantendo o lacinho rosa como logo.

**Arquitetura:** componentes de apresentação compartilhados para marca, composição de título e estados vazios; SVGs locais para caderninho e vale-presente. Os contratos, respostas, autorizações e valores permanecem nas mesmas fontes. Os módulos de conta, lojas, atividades, tickets, relação, mídia e administração adotam os tokens existentes.

**Tecnologias:** Next.js 16.4.2, React 19.3.1, TypeScript, CSS e SVG, sem dependências novas.

**Especificação:** `design.md` §1–4 e pedido explícito do usuário nesta continuação. A direção visual foi aprovada após a primeira adaptação.

## Aceite e revisão

- Lacinho rosa, marca em minúsculas, DM Serif Display/DM Sans, fundos rosa suave, ações framboesa e cartões de papelaria em todas as áreas.
- Login, cadastro e recuperação mantêm rótulos, validação, autofill, carregamento e erros. A decoração muda sem modificar os fluxos de autenticação.
- Atividades usam ilustrações locais nos lugares dos emojis decorativos, respeitando o sticker escolhido no cadastro.
- Meus mimos, detalhes de tickets e estados vazios recebem acabamento de vale-presente; estados e valores continuam explícitos.
- Convites, conta, lojas, novidades, conversas, álbuns e administração compartilham marca e acabamento. Administração tem decoração mais discreta, como no cânone.
- Imagens são decorativas, reservam espaço no layout e não cobrem textos, valores, controles ou mídia pessoal.
- Conferir 320/390 px, desktop, texto 200%, teclado/foco, diálogos, movimento reduzido, estados vazios e falhas de API.
- Preservar alterações preexistentes, não publicar nem executar migrações.

## Etapas

1. [x] Criar `mimo-page.tsx`, SVGs de atividades/tickets e estilos compartilhados em `mimo.css`; atualizar o ícone do app para o lacinho.
2. [x] Aplicar a marca e as composições em conta, lojas, convites, novidades, administração e página indisponível.
3. [x] Aplicar stickers, estados vazios e acabamento em atividades, mimos, tickets e módulos complementares.
4. [x] Atualizar `design.md` e `web/public/assets/README.md`.
5. [x] Executar checks agregados e testes de navegador das áreas afetadas; gerar capturas com dados fictícios.
6. [x] Solicitar revisão independente somente leitura, corrigir achados confirmados e repetir checks afetados.
7. [x] Restaurar o supervisor local anteriormente ativo e mostrar a tela de conta.

## Evidências

`npm run check` passou: sete testes de domínio, 62 testes de web, regras,
lint, tipos e build. Lint e build foram repetidos após os últimos ajustes
de conta, navegação e tipografia dos campos, com sucesso.

A conferência visual identificou a palavra “Atividades” dividida em 320 px.
Uma asserção no teste existente reproduziu a falha no build anterior
(duas linhas em vez de uma). O ajuste permite redistribuir os links sem
partir palavras. A abertura da conta foi compactada no celular, preservando
reflow a 200% e mantendo a composição com gatinho maior no desktop.

A primeira rodada completa teve 741 aprovações e um timeout de cinco segundos
na abertura da prévia de mídia, ainda no estado inicial “Conferindo os arquivos
autorizados…”. O mesmo caso passou seis vezes no mesmo build, três em cada
largura, sem mudar lógica, prazo ou asserções. Não se concluiu uma causa para
essa espera isolada. O contexto foi preservado em
`.artifacts/identity-telas/media-timeout.md`. A rodada completa final está
registrada em `.artifacts/identity-telas/e2e-final.log`.

No estado final, a suíte completa teve 741 aprovações e um timeout, desta vez
na abertura inicial do convite (320 px), antes do aceite. O caso passou nas
seis repetições isoladas, três por largura, sem alterações de lógica ou dos
limites dos testes; log em `.artifacts/identity-telas/invitation-repeat.log` e
contexto em `invitation-timeout.md`. Portanto não se declara a rodada completa
como inteiramente aprovada. A causa dessas esperas isoladas de inicialização
não foi determinada nesta adaptação de apresentação.

O teste de navegação passou com a correção no build final. Capturas adicionais
conferiram login e catálogo de atividades no desktop a 1280 px e os formulários
em 320/390 px com texto 200%. O supervisor foi restaurado, retornou
`LOCAL_READY` e `local:health` confirmou todos os componentes em `ready`.

A revisão independente somente leitura não encontrou problema concreto
no diff e nos refinamentos finais. Não substitui a verificação de navegador.
Capturas de login, cadastro, atividades e Meus mimos com dados fictícios ficam
em `.artifacts/identity-telas/`; relatórios e capturas são ignorados pelo Git.
Aplica-se o limite da prova em Chromium: aparelhos reais e leitor de tela não
foram verificados. Não houve migrações ou alterações de API/autenticação.
