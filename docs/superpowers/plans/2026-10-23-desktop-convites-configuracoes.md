# Organização desktop de Convites e Configurações

> **Execução:** nativa nesta sessão, com revisão independente somente leitura.

**Objetivo:** tornar criação/consulta de convites e edição/estado da loja mais
claros no desktop, mantendo a identidade atual.

**Arquitetura:** componentes existentes, CSS Modules e container queries;
sem dependências ou contratos novos. Uma única árvore de conteúdo por tela.

**Tecnologias:** Next.js 16.4.2, React 19.3.1, TypeScript e CSS existentes.

**Especificação:** [composição desta continuação](../specs/2026-10-23-desktop-convites-configuracoes-design.md).

## Restrições e revisão

A tarefa de convites concluiu a implementação funcional e entregou a escrita
dos componentes de apresentação nesta continuação. Preservar suas alterações
locais e a seção 16.2 de `design.md`. Supervisor ativo em 4301; parar pelo
comando oficial antes de baseline, build/typegen e testes com servidor. Retomar
e confirmar `local:health` ao concluir. Não executar migrações nem novos ensaios
de banco/recuperação por esta mudança de apresentação.

Conferir especialmente: formulário com data personalizada e horário ambíguo;
revelação/ocultação sem perder foco; rascunho após falha/revalidação; pausa da
plataforma e loja encerrada; código, link e metadata extensos em texto ampliado.

## Tarefas

- [x] Criar `web/tests/e2e/stores/desktop-management.spec.ts` com fixtures
  sintéticas, capturas e testes da composição/teclado, mantendo os helpers.
  Rodar os dois casos desktop iniciais no build anterior e conferir o baseline.
- [x] Reorganizar `store-invitations.tsx`, `invitation-policy-form.tsx`,
  `invitation-code-card.tsx` e classes de `invitation-codes.module.css`:
  criação/consulta em colunas, resultado no topo da consulta, cartões compactos
  e revogação separada. Manter callbacks e contratos; estabilizar o botão de
  revelar/ocultar em vez de remover o elemento que contém o foco.
- [x] Reorganizar `store-settings.tsx` com novo `settings.module.css`:
  identidade, estado e encerramento distintos; dados de loja encerrada somente
  para consulta. Não alterar o formulário compartilhado ou a lógica de ações.
- [x] Executar lint direcionado e `npm run check`, revisar capturas novas e
  obter revisão independente somente leitura. Corrigir os achados confirmados.
- [x] Executar o arquivo novo e regressões de `stores`: gestão, contexto,
  hub, convites legados e os três arquivos invitation-codes join/management/races.
- [x] Registrar somente seção 3.6 de `design.md`, evidências e limites neste
  plano; retomar supervisor e verificar saúde/página reais.

## Evidências e limites

- Guia local de CSS do Next 16.4.2 e documentos canônicos de lojas consultados.
- [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
  consultadas em 23/10/2026. Regras são aplicadas ao escopo desta continuação,
  sem introduzir dependências, contratos ou um fluxo de navegação novo.
- A implementação funcional de convites permanece como base desta composição;
  arquivos locais anteriores serão preservados. Testes de UI usam APIs
  simuladas, sem representar nova prova de autenticação ou persistência.
- Referência oficial de `useId` consultada pelo Context7. O índice oferece
  React 19.3.0, sem resultado específico nessa versão para a consulta; a
  documentação oficial React.dev foi usada como referência complementar ao
  React 19.3.1 instalado.
- Baseline no build anterior: dois casos desktop falharam pelos problemas
  esperados, com capturas inspecionadas. A consulta do primeiro convite ficava
  abaixo do formulário; a ação de pausar estava parcialmente fora da tela.
  Log local: `.artifacts/desktop-gestao-baseline.log`. Capturas anteriores em
  `web/.artifacts/desktop-gestao-*-chromium390-viewport-antes.png`.
- Revisão independente dos deltas em relação aos snapshots originais,
  somente leitura, concluída sem regressões concretas. O teste com resposta
  lenta confirmou perda de foco por `disabled` no botão de revelar nos dois
  projetos; o controle passou a usar `aria-disabled` com guarda de ação e
  aparência de espera. A revisão desse ajuste também não encontrou defeitos.
  O teste verifica foco durante a resposta lenta e Enter repetido sem outro
  GET. A primeira rodada registrou 26 aprovações e as duas falhas de foco em
  `.artifacts/desktop-gestao-focus-red.log`; a rodada corrigida passou.
- `npm run check` executado novamente após a correção e aprovado: regras/lint,
  sete testes de domínio, lint web, TypeScript, 64 testes web e build de produção.
  Log local: `.artifacts/desktop-gestao-check.log`.
- Capturas desktop de Convites, resultado gerado e Configurações inspecionadas:
  criação, consulta, compartilhamento, salvamento e estado cabem na primeira
  tela em 1440 × 900. As imagens e logs são ignorados pelo Git.
- A rodada completa de `tests/e2e/stores` passou: 132/132, incluindo os 28 casos
  novos e 104 regressões, nos dois projetos Chromium. Inclui os três arquivos
  de convites por código, links legados, criação/edição, contexto de conta,
  recuperação incerta, prazo AT/DST, copiar/compartilhar e confirmações de estado.
  Log: `.artifacts/desktop-gestao-stores-e2e.log`.
- As capturas de celular foram reposicionadas no conteúdo em teste e os dois
  casos responsivos executados novamente com sucesso, sem alterar o produto.
  Código, ações e formulário foram inspecionados em 320 px/texto 200%, sem
  rolagem horizontal. Log: `.artifacts/desktop-gestao-mobile-captures.log`.
  Lint direcionado repetido após esse ajuste de captura e aprovado.
- Supervisor retomado com `local:web`: `LOCAL_READY` e `local:health` com
  exit 0/status `ready`, PostgreSQL/Auth/Storage/Next/mídia/outbox prontos e
  códigos vazios. `/lojas` respondeu HTTP 200. Aplicação disponível em
  `http://127.0.0.1:4301/lojas` para os testes manuais do usuário.
- `git diff --check` do escopo rastreado aprovado. A entrega Git foi solicitada
  depois da implementação, separando a base funcional de convites, a organização
  desktop e esta documentação. A seleção foi revisada sem incluir artefatos locais.
