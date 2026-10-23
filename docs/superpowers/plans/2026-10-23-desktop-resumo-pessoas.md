# Organização desktop do Resumo e de Pessoas

> **Execução:** nativa nesta sessão, com revisão independente somente leitura.

**Objetivo:** priorizar pendências da loja, consulta das pessoas e próximos
passos da relação, preservando a identidade atual.

**Arquitetura:** componentes atuais com CSS Modules e container queries;
composição principal/apoio sem duplicação por breakpoint.

**Tecnologias:** Next.js 16.4.2, React 19.3.1, TypeScript e CSS existentes.

**Especificação:** [desenho desta continuação](../specs/2026-10-23-desktop-resumo-pessoas-design.md).

## Restrições e revisão

Preservar o trabalho de convites. Builds, typegen e servidores são coordenados
em série; a tarefa de convites já controla os serviços. Não alterar dados,
Prisma, contratos, APIs ou a Lojinha do participante. Conferir vazios, falhas,
nomes longos, bilhete/descrição extensos, participação encerrada, saldo
individual negativo/extenso e ações por teclado sem perda do rascunho.

## Tarefas

- [x] Reproduzir a composição anterior com fixtures existentes e novos testes
  em `web/tests/e2e/relationship/people-desktop.spec.ts`; capturar referência.
- [x] Reorganizar Resumo em `dashboards/store-dashboard.tsx` e classes novas
  de `dashboard.module.css`, sem mudar o início do participante.
- [x] Organizar lista, filtros, situação e ações em `stores/store-people.tsx`
  e novo `people.module.css`. Preservar confirmação e recuperação do encerramento.
- [x] Organizar `dashboards/person-dashboard.tsx`: acessos antes de conteúdo
  extenso, momentos antes do apoio na ordem do documento, potinho compacto.
- [x] Conferir capturas, teclado, celular/200%, filtros, paginação, estados,
  revalidação e regressões; obter revisão independente somente leitura.
- [x] Atualizar somente seção 3.5 de `design.md`, executar checks afetados e
  registrar evidências/limites, coordenando a retomada dos serviços.

## Evidências

- Guias locais de CSS Modules do Next 16.4.2 consultados. Context7 oferece até
  16.2.9 e serve como referência complementar.
- [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
  consultadas em 23/10/2026.
- `npm run check` aprovado: regras/lint, sete testes de domínio, lint web,
  TypeScript, 64 testes web e build de produção. Log local ignorado pelo Git:
  `.artifacts/resumo-pessoas-check.log`. A primeira tentativa revelou uso de
  `Array.at` no teste, incompatível com o alvo TypeScript atual; o teste passou
  a usar índice, sem alterar a configuração do projeto, e o check completo
  foi executado novamente com sucesso.
- Baseline executado no build anterior em 1440 × 900: três casos falharam
  pelos problemas esperados (mimo fora da primeira tela, situação ausente na
  lista e momentos após o saldo). Capturas inspecionadas em
  `web/.artifacts/desktop-resumo-pessoas-*-chromium390-viewport-antes.png`.
  Relatório local: `.artifacts/resumo-pessoas-baseline.log`. Esses arquivos
  são ignorados pelo Git.
- Revisão independente somente leitura concluída, sem achados de produto.
  O teste do bilhete espera uma nova versão do servidor antes de conferir
  rascunho e foco. A revisão do ajuste de foco ao expandir/paginar os
  acontecimentos também não encontrou defeitos.
- Os 20 casos de `people-desktop.spec.ts` passaram nos dois projetos Chromium
  em 40,5 segundos. Cobrem desktop 1440 × 900, celular 320/390, larguras
  1120/1440, texto em 200%, movimento reduzido, nomes longos, saldo negativo
  extenso, recuperação de falha, filtros/paginação, encerradas, confirmação
  por teclado e revalidação sem perder rascunho/foco. As capturas novas do
  Resumo, lista e detalhe foram inspecionadas e comparadas ao baseline.
  Log: `.artifacts/resumo-pessoas-e2e.log`. São testes com APIs simuladas;
  não substituem integração real de autenticação ou persistência.
- Regressão combinada aprovada: 210/210 casos em 4,1 minutos, incluindo
  `relationship` sem repetir o arquivo novo, `stores/management`,
  `stores/account-context` e os três arquivos `invitation-codes` de entrada,
  gestão e concorrência, conforme a coordenação com a outra tarefa. Lista
  exata dos 18 arquivos em `.artifacts/resumo-pessoas-regression-files.txt`;
  resultado em `.artifacts/resumo-pessoas-regression.log`. Foram 230/230
  cenários E2E aprovados no build comum, sem pulos.
- `git diff --check` dos arquivos rastreados desta continuação aprovado.
- O supervisor e os servidores já estavam sob controle da tarefa de convites;
  os ensaios foram serializados com autorização do usuário. O baseline usou o
  build anterior antes de gerar o build desta continuação. Depois do check
  comum e das regressões, os serviços foram devolvidos à tarefa de convites
  para o ensaio de recuperação e a retomada do supervisor. Esta entrega não
  afirma que o supervisor já tenha sido retomado.
