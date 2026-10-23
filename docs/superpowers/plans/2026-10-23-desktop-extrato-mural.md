# Organização desktop do Extrato e do Mural

> **Execução:** nativa nesta sessão, com revisão independente somente leitura.

**Objetivo:** aproximar filtros, registros e ações principais, preservando a
identidade e os contratos existentes.

**Arquitetura:** CSS Modules e container queries nos componentes atuais.
Extrato com coluna de apoio; mural com uma sequência única e filtros próprios.

**Tecnologias:** Next.js 16.4.2, React 19.3.1 e TypeScript, sem dependências novas.

**Especificação:** [composição desta continuação](../specs/2026-10-23-desktop-extrato-mural-design.md).

## Restrições e revisão

Preservar alterações da tarefa de convites no checkout. Não alterar Prisma,
contratos, permissões, ledger, API ou consumidores. Serializar build/typegen,
testes e servidores. Usar comandos canônicos e preservar o estado dos serviços
sob coordenação da tarefa que já os havia parado.
Conferir saldo atual versus período, valores negativos acima de MAX_SAFE_INTEGER,
compensações, pessoas com nomes longos, conversas abertas, mídia publicada,
paginação de cinquenta itens e descarte dos dados após perda de acesso.

## Tarefas

- [x] Reproduzir a hierarquia anterior com fixtures existentes em
  `web/tests/e2e/points/desktop-layout.spec.ts` e
  `web/tests/e2e/relationship/feed-desktop.spec.ts`; capturar referência.
- [x] Reorganizar `points/statement-area.tsx`, `statement-balance.tsx`,
  `statement-people.tsx` e `statement.module.css`. Manter consultas/URLs,
  agrupar a leitura dos movimentos e associar/focar erro do período.
- [x] Reorganizar `feed/feed-area.tsx`, `feed-card.tsx`, `person-filter.tsx`
  e novo `feed.module.css`, sem alterar os estilos compartilhados de outras
  telas. Usar o badge existente e preservar reações, mídia e conversa.
- [x] Verificar layout desktop/celular/200%, teclado, filtros, origem e
  regressões de extrato, mural, atualização, privacidade e tickets.
- [x] Atualizar `design.md`, obter revisão independente somente leitura,
  corrigir achados e executar os checks afetados. Liberar os serviços para
  a continuação dos ensaios de convites.

## Fontes e evidências

- Guias CSS locais do Next 16.4.2 e Context7 consultados; o Context7 oferece
  até 16.2.9, usado apenas como referência complementar de CSS Modules.
- [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
  consultadas em 23/10/2026.
- A tarefa de convites já havia parado o supervisor por `local:stop`;
  `local:health` confirmou `stopped` antes desta execução. Builds, testes e
  retomada dos serviços são coordenados entre as duas tarefas, com autorização
  explícita do usuário.
- Baseline em Chromium390/1440 × 900: três falhas de acesso fora do viewport
  (Extrato participante/lojista e Mural lojista), um caso aprovado. Log local
  ignorado: `.artifacts/desktop-extrato-mural-red.log`. Capturas anteriores em
  `web/.artifacts/desktop-{extrato-participante,mural-lojista}-antes.png`.
- Lint direcionado dos seis componentes e dos dois arquivos novos de testes
  aprovado.
- `npm run check` comum aprovado, executado pela tarefa de convites com fontes
  congeladas e log completo conferido nesta sessão:
  `.artifacts/convites-check.log`. Inclui regras/lint, sete testes do protótipo,
  typegen/TypeScript, 64 testes nativos web e build de produção. A primeira
  rodada falhou em um teste novo de convites; a repetição aprovada inclui a
  correção e todas as fontes finais desta UX.
- Revisão independente somente leitura não confirmou defeito novo importante.
  O papel explícito de lista foi acrescentado aos movimentos, preservando
  semântica diante do reset visual existente. A condição do Safari foi
  conferida na [documentação do list-style](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/list-style#accessibility).
  Safari/VoiceOver não foram executados localmente.
- As quatro capturas desktop foram examinadas, com controles legíveis e
  primeiras ações inteiras no viewport. Os testes novos foram ajustados para
  localizar selects pelo papel/nome acessível e distinguir badge de option.
  O teste focal da miniatura passou com grant, PNG, lazy loading e decode;
  log `.artifacts/desktop-mural-preview.log`.
- Regressão Chromium320/390: **291/292 aprovados**, em 3,8 minutos, com
  `WEB_TEST_PORT=4303` e
  `npm --prefix web run test:e2e -- tests/e2e/points tests/e2e/relationship tests/e2e/tickets/desktop-layout.spec.ts tests/e2e/redemptions/history.spec.ts`.
  Log `.artifacts/desktop-extrato-mural-regression.log`. A única falha esperava
  a imagem lazy do potinho a 200% sem rolar até ele, agora abaixo da lista no
  celular. `points/statement.spec.ts` passou a chegar ao potinho antes de
  verificar o carregamento; nenhuma fonte do produto precisou de correção.
- Rodada final: **54/54 aprovados**, em 50,4 segundos, incluindo os 26 casos
  novos e toda a regressão do extrato. Com `WEB_TEST_PORT=4303`:
  `npm --prefix web run test:e2e -- tests/e2e/points/statement.spec.ts tests/e2e/points/desktop-layout.spec.ts tests/e2e/relationship/feed-desktop.spec.ts`.
  Log `.artifacts/desktop-extrato-mural-final.log`. `tsc --noEmit` e lint dos
  arquivos afetados passaram novamente depois dos ajustes dos testes;
  log `.artifacts/desktop-extrato-mural-types-lint.log`.
- Capturas desktop em
  `web/.artifacts/desktop-{extrato,mural}-{participante,lojista}-chromium390-viewport.png`.
  Capturas de celular/200% do extrato e mural também examinadas; controles,
  valores completos, estado e ações permanecem disponíveis sem rolagem
  horizontal. Imagens e logs são locais ignorados, com dados fictícios.
- Servidor de testes encerrado e serviços liberados para os ensaios de
  convites, preservando o supervisor já parado. Sua retomada fica coordenada
  com aquela tarefa; não foi iniciada outra instância concorrente.
- As provas de UI controlada não repetem Auth/banco/Storage reais nem
  aparelhos físicos. Não foram alterados contratos ou regras financeiras
  por esta continuação de UX.
- Antes dos commits, os mesmos 54 E2E foram repetidos e aprovados em
  35,3 segundos; TypeScript e lint dos arquivos afetados também passaram.
  Logs locais ignorados: `.artifacts/desktop-extrato-mural-commit-e2e.log` e
  `.artifacts/desktop-extrato-mural-commit-types-lint.log`. A entrega Git
  inclui somente o Extrato, o Mural e sua documentação; alterações de convites
  e sua seção de `design.md` permanecem na tarefa correspondente.
