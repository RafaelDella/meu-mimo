# Organização desktop de Meus mimos e tickets

> **Execução:** nativa nesta sessão, com revisão independente somente leitura.

**Objetivo:** priorizar lista de vales e próximos passos do ticket, preservando
a identidade visual e os contratos atuais.

**Arquitetura:** composição dos componentes existentes com CSS Modules e
container queries, sem duplicar conteúdo por breakpoint. Potinho compacto
optativo; estilos de layout limitados à área de tickets.

**Tecnologias:** Next.js 16.4.2, React 19.3.1, TypeScript e CSS, sem dependências.

**Especificação:** [desenho desta continuação](../specs/2026-10-23-desktop-mimos-tickets-design.md).

## Restrições e foco da revisão

Preservar snapshots, permissões, transições, estorno, álbum e conversa. Não
alterar banco nem contratos. Conferir nomes/textos longos, saldo negativo ou
acima de MAX_SAFE_INTEGER, cancelamento em análise, estados terminais e
independência entre contador e filtros. Teclado, foco, celular e movimento
reduzido fazem parte do aceite. Servidores, build e typegen são serializados.

## Tarefas

- [x] Reproduzir a distância até os tickets e até os próximos passos em
  `web/tests/e2e/tickets/desktop-layout.spec.ts`, reutilizando fixtures existentes;
  capturar a composição anterior e confirmar falhas relevantes no build atual.
- [x] Reorganizar `rewards/reward-area.tsx`, `rewards/reward-summary.tsx`,
  `tickets/ticket-list.tsx` e `tickets/ticket-people.tsx`: lista antes do apoio, abertura e potinho compactos,
  filtros responsivos, erro de período associado e foco na data final.
- [x] Reorganizar `tickets/ticket-detail.tsx` e `ticket-display.tsx`: resumo do
  vale, badge de estado compartilhado, ações antes dos textos da ocasião e
  histórico em apoio. Estilos em `tickets/tickets.module.css`.
- [x] Conferir os testes novos e a regressão de tickets, resgates, álbuns,
  extrato e navegação. Exercitar 320/390 e desktop com texto 200% e teclado;
  verificar imagens decodificadas e ausência de rolagem horizontal.
- [x] Atualizar `design.md`, executar `npm run check`, solicitar revisão
  independente somente leitura e corrigir achados confirmados. Registrar
  evidências; restaurar o supervisor inicialmente ativo.

## Fontes e evidências

- Guias locais de CSS do Next 16.4.2 consultados. Context7 oferece até 16.2.9;
  usado como referência complementar de CSS Modules, sem substituir a versão
  instalada. Web Interface Guidelines da Vercel consultadas em 23/10/2026.
- Web Interface Guidelines: [fonte consultada](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md).
- Saúde inicial: PostgreSQL, Auth, Storage, Next, mídia e outbox em `ready`.
  Supervisor parado pelo comando canônico antes de build, typegen e testes.
- Os dois testes de hierarquia falharam no build anterior: primeiro acesso ao
  ticket e registro do combinado fora do viewport em 1440 × 900. Capturas de
  referência: `web/.artifacts/desktop-tickets-{lista,detalhe}-antes.png`.
- A primeira composição ainda cortava o acesso na lista. Cards foram
  compactados; o link passou a preceder data secundária e prévia do álbum,
  sem margem automática que o empurrasse quando o card vizinho fosse maior.
- A inspeção visual identificou campos comprimidos. Asserções reproduziram
  datas com 145px e seletor de pessoa com aproximadamente 153px. O ajuste
  conserva pelo menos 180px nesses campos no cenário desktop de 1440px,
  mantendo o acesso ao ticket na primeira tela. O botão de busca foi abreviado
  visualmente, preservando seu nome acessível e o comportamento.
- `npm run check` final aprovado: regras, lint, sete testes de domínio,
  geração de tipos/TypeScript, 62 testes nativos web e build de produção.
  Log local ignorado: `.artifacts/desktop-mimos-check-final.log`.
- Regressão Chromium: **372/372 aprovados**, em cerca de 4,9 minutos, antes
  do último refinamento de largura dos campos. Com `WEB_TEST_PORT=4303`:
  `npm --prefix web run test:e2e -- tests/e2e/tickets tests/e2e/redemptions tests/e2e/albums tests/e2e/points/statement.spec.ts tests/e2e/relationship/desktop-layout.spec.ts tests/e2e/illustrations.spec.ts`.
  Log: `.artifacts/desktop-mimos-regression.log`.
- Após o refinamento, **34/34 aprovados**: os 24 casos novos e dez do histórico,
  em Chromium320/390. Com `WEB_TEST_PORT=4303`:
  `npm --prefix web run test:e2e -- tests/e2e/tickets/desktop-layout.spec.ts tests/e2e/redemptions/history.spec.ts`.
  Log: `.artifacts/desktop-mimos-final.log`. Inclui estados terminais, pedido
  de cancelamento, álbum com miniatura, card vizinho, saldo negativo extenso,
  erro de período associado, diálogo por teclado e texto 200% em
  1120/1280/1440, além de 320/390 com movimento reduzido.
- Revisão independente somente leitura conferiu a composição, chamadores e
  ajustes finais; nenhum defeito adicional concreto permaneceu apontado.
- Capturas fictícias, com imagens decodificadas, em
  `web/.artifacts/desktop-tickets-{lista,lista-lojista,detalhe}-chromium390-viewport.png`.
  Imagens e logs permanecem ignorados pelo Git. A conferência controlada de UI
  não comprova novamente Auth/banco, aparelho físico ou leitor de tela.
  Nenhuma migração ou mudança de contrato foi feita.
- Supervisor restaurado por `local:web`, com `LOCAL_READY` em 4301.
  `local:health` confirmou PostgreSQL, Auth, Storage, Next, mídia e outbox
  em `ready`, sem códigos de erro.
- Antes dos commits, `npm run check` e os mesmos 34 testes de layout e
  histórico foram repetidos e aprovados. Logs locais ignorados:
  `.artifacts/desktop-mimos-commit-check.log` e
  `.artifacts/desktop-mimos-commit-e2e.log`.
