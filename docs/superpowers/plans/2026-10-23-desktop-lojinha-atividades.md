# Organização desktop da Lojinha e das Atividades

> Execução nativa nesta sessão, conforme autorização para implementar a auditoria. Revisão independente somente leitura ao final, prevista pela skill requesting-code-review. Sem commits das alterações locais preexistentes.

**Objetivo:** tornar a navegação compacta e antecipar a vitrine e a lista de atividades, preservando a identidade visual atual.

**Arquitetura:** manter componentes, contratos e permissões existentes. Usar CSS Modules para a composição das páginas e modificadores optativos para potinho e introdução compactos no desktop. A largura ampliada pertence somente ao workspace da loja.

**Stack:** Next.js 16.4.2, React 19.3.1, TypeScript, CSS e Playwright existentes, sem dependências novas.

**Referência aprovada:** auditoria nesta conversa e pedido de implementação de 23/10/2026; `design.md`, seções 3.1, 7, 11 e 18.

## Limites e aceite

- Preservar alterações locais, paleta, fontes, gatinho, ilustrações, bilhete e os três/quatro acessos principais por papel.
- Não mudar API, banco, autorização, valores, retenção, confirmação ou persistência.
- Desktop em 1440 × 900: nome da loja com tipografia até 20 px, itens de navegação em linha e acessos auxiliares utilizáveis; nomes extensos não causam overflow.
- Lojinha: saudação e saldo separado entre disponível/análise, seguidos da vitrine; atividades e conteúdo de apoio vêm depois.
- Atividades: abas/filtros/lista antes do resumo na ordem do documento; no desktop, saldo e resumo ficam em uma coluna de apoio. No celular, seguem a lista.
- Preservar loading/erro/negativo, foco, bilhete privado e revalidação; não duplicar conteúdo para compor breakpoints.
- Conferir 320/390 px, desktop, texto 200%, teclado e movimento reduzido.

## Pontos de revisão

- Nome de 80 caracteres com e sem espaços, sem cobrir links nem cortar o acesso pelo teclado.
- Saldo negativo e acima de Number.MAX_SAFE_INTEGER continua exato; análise não é saldo disponível.
- Alternar registros não desmonta o resumo; refresh não perde foco nem mistura contas.
- Sidebar longa em janela baixa pode rolar com foco visível.
- As classes novas não alteram a apresentação, conta, prévia ou potinhos de outros fluxos.

## Tarefas

- [x] Reproduzir em testes Playwright o título excessivo, a vitrine distante e a lista de atividades abaixo do resumo.
  Arquivo novo: `web/tests/e2e/relationship/desktop-layout.spec.ts`. Reutilizar fixtures de relacionamento, recompensas e atividades. Executar contra o build anterior e confirmar falhas pertinentes.
- [x] Compactar navegação desktop e ampliar somente o workspace para 80rem, com lateral de 15rem. Arquivos: `stores.css`, `relationship.module.css`, `store-workspace.tsx`. O componente de navegação existente foi preservado; CSS alinha os itens em linha.
- [x] Reordenar a Lojinha e adicionar apresentação compacta optativa ao potinho. Arquivos: `store-dashboard.tsx`, novo `dashboards/dashboard.module.css`, `points-summary.tsx`, `ui.css`.
- [x] Compor lista e apoio de Atividades em colunas no desktop. Arquivos: `activity-list.tsx`, `activities.module.css`, `mimo-page.tsx`, `mimo.css`.
- [x] Atualizar `design.md` com o comportamento implementado e esta referência; registrar comandos/resultados aqui.
- [x] Parar o supervisor antes dos checks; executar `npm run check` e testes E2E de navegação, relacionamento, atividades e pontos afetados, em série. Revisar diff, conferir interface real e restaurar a operação local.

## Fontes e evidências

- Documentação instalada em `web/node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` consultada. Context7 disponível; catálogo oferece Next até 16.2.9, usado apenas como referência complementar para CSS Modules. A versão instalada 16.4.2 permanece a fonte da versão.
- Antes da edição, `local:health`: ready para PostgreSQL, Auth, Storage, Next, mídia e outbox.
- Regressões reproduzidas no build anterior: título de 44px; links de mimo/atividade fora da primeira tela; catálogo depois do saldo no celular.
- `npm run check`: aprovado, incluindo lint/regras, sete testes de domínio, tipos, 62 testes nativos de web e build.
- A revisão independente somente leitura apontou perda de largura em Atividades a 200% em desktop. Um teste reproduziu catálogo com cerca de 61px. A composição passou a usar container queries nomeadas: 66rem no workspace e 50rem na área de atividades; com texto ampliado, as colunas empilham. O revisor confirmou a correção na leitura final.
- Após os ajustes finais: `web:lint`, `web:typecheck` e `web:build` aprovados. Os sete cenários novos passaram em Chromium, incluindo 1120/1280/1440 com texto 200%, janela baixa, nomes extensos, saldo negativo e inteiro acima de MAX_SAFE_INTEGER.
- Regressão de navegador: **336/336 aprovados**, nos projetos Chromium320/390, em cerca de 2,4 minutos. Comando em `web/`, com `WEB_TEST_PORT=4303`: `npm exec -- playwright test tests/e2e/stores tests/e2e/relationship tests/e2e/activities tests/e2e/points tests/e2e/redemptions/navigation.spec.ts tests/e2e/tickets/accessibility.spec.ts tests/e2e/ui-foundation.spec.ts`.
- Capturas com dados fictícios e imagens decodificadas: `web/.artifacts/desktop-lojinha-chromium390.png` e `web/.artifacts/desktop-atividades-chromium390.png`. A prova da Lojinha exige o link “Ver mimo” inteiro na primeira tela em 1440 × 900. As capturas permanecem ignoradas pelo Git.
- A validação controlada de UI não comprova novamente Auth/banco, aparelho real ou leitor de tela. Não houve mudança de contratos nem migração.
- Conferência no navegador com a mesma loja local encerrada da auditoria, em 1440 × 900: nome lateral passou de 44px para 18px; título da vitrine passou de aproximadamente 1.610px para 542px; título do catálogo de atividades, de 1.072px para 429px. Estado de encerramento e dados existentes preservados. Viewport temporário restaurado depois da inspeção.
- Supervisor reiniciado com `local:web`: `LOCAL_READY`. `local:health` final: ready para PostgreSQL, Auth, Storage, Next, mídia e outbox. A aplicação permanece em `http://127.0.0.1:4301`.

Na validação integrada antes dos commits, já com a biblioteca compartilhada de
ilustrações, `npm run check` passou completo: sete testes de domínio, 62 testes
nativos web, lint, tipos e build. Com `WEB_TEST_PORT=4303`, as suítes
`relationship/desktop-layout.spec.ts` e `illustrations.spec.ts` passaram nos
28 casos Chromium320/390. Logs locais ignorados: `.artifacts/git-delivery-check.log`
e `.artifacts/git-delivery-e2e.log`. Os fontes permaneceram iguais entre o início
e o fim dessa verificação; o supervisor ficou parado durante os ensaios.
