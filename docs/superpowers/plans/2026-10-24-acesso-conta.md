# Plano de implementação — acesso à conta

**Objetivo:** clareza visual e funcional em cadastro/login, usando a identidade
atual e verificando os fluxos reais. Execução sequencial neste checkout.

**Arquitetura:** manter o controlador de sessão e APIs existentes; extrair a
apresentação do formulário se necessário para manter responsabilidades pequenas.
Stickers locais e ícones SVG, React 19.3.1 e Next 16.4.2, sem dependências novas.

## Tarefas

- [x] Ler contratos, fluxos e estilos; capturar baseline e verificar processos.
- [x] Registrar auditoria, escolhas e aceite no documento de direção.
- [x] Reorganizar `conta/page.tsx`, `account-panel.tsx`, formulário e
  `styles/account.css`: modos claros, senha visível opcional, pendência e confirmação.
- [x] Atualizar `tests/e2e/account.spec.ts` e acrescentar casos de estado,
  erros, duplicação, retorno interno e acessibilidade. Executar antes/depois.
- [x] Reutilizar `tests/pilot-browser/recovery.spec.ts`, que já prova cadastro,
  confirmação, senha recuperada e acesso real. Conferir o novo estado de e-mail.
- [x] Executar `npm run check`, UI de conta/contexto e integração focal de Auth.
  Executar o novo navegador real com conta sintética e cleanup existente.
- [x] Inspecionar capturas desktop/celular e solicitar revisão independente
  somente leitura; tratar achados e registrar evidências/limites.
- [x] Retomar `local:web` pela custódia canônica e confirmar saúde/rota para teste.

## Fontes e limites

`web-design-guidelines` e diretrizes oficiais Web Interface Guidelines consultadas;
Context7 React 19.3.0 e react.dev para refs/foco. O catálogo não possui 19.3.1:
não foi assumida uma API nova entre patches. Auth/backend não troca contrato.
Evidências locais em `.artifacts/` e relatórios privados do harness, fora do Git.

## Evidências em 24/10/2026

- Baseline de conta: 8/8 aprovados, log `account-baseline.log`.
- Primeiro ciclo ampliado: 24 aprovações e duas falhas esperadas no novo teste
  de recuperação confirmada em outra aba (`account-ui-first.log`). A confirmação
  antiga ocultava a nova senha. Estado corrigido ao reconhecer/mudar sessão;
  recuperação restrita também tem precedência sobre a confirmação visual.
- A revisão independente identificou essa falha e a ausência de foco após
  login/senha salva/saída. Foram corrigidas e cobertas por testes específicos;
  a revisão estática das correções terminou sem outros achados concretos.
- `npm run check` completo aprovado após as correções de sessão/foco
  (`account-check-final.log`). A correção responsiva posterior alterou somente
  CSS; build repetido com sucesso (`account-build-responsive.log`).
- Conta, novos fluxos e contexto de sessão: 28/28 Chromium aprovados em
  320/390 px (`account-ui-final.log`), incluindo desktop 1440 × 900, texto 200%,
  teclado, foco, envio lento/repetido, erros, MFA e troca de conta. Capturas
  desktop/celular inspecionadas. Lint direcionado repetido e aprovado.
- A retomada do Docker encontrou socket AF_UNIX órfão, erro 1920, compatível
  com [docker/for-win#15064](https://github.com/docker/for-win/issues/15064).
  Após a parada canônica forçada do Desktop que falhou ao iniciar, o diretório
  exato `docker-secrets-engine` foi preservado inteiro com sufixo datado.
  Conferidos pai absoluto, ausência de link no diretório e único filho
  `engine.sock` de zero bytes. Nenhum segredo, volume ou banco foi apagado.
  O Desktop foi iniciado novamente pelo CLI; Engine 29.9.2 respondeu e
  `local:start` confirmou stack saudável e portas restritas a loopback.
- Integração focal `test:integration:t14 -- tests/integration/auth.test.mjs`:
  6/6 aprovados, sem skips (`account-auth-http.log`). Provados e-mail obrigatório,
  PKCE/retorno interno, cookies privados, ausência/adulteração de sessão,
  revogação/suspensão e recuperação restrita antes da troca de senha.
- Navegador real `test:web:real -- recovery.spec.ts`: 2/2 aprovados em 24,8 s,
  sem mocks ou skips (`account-auth-real-browser.log`). Cadastro, confirmação
  pelo Mailpit, acesso negado antes de trocar senha, senha antiga rejeitada,
  senha nova aceita, loja persistida e descarte de rascunho após logout em outra
  aba. Fixture sintética e cleanup existentes, sem cadastrar conta do usuário.
- Última inspeção do estado de e-mail motivou apenas a cor do contorno de foco
  do título, que passa a usar o token da marca em vez do padrão do navegador.
  Build aprovado novamente (`account-build-final.log`), seguido de 4/4 casos
  focais de confirmação/foco e texto 200% (`account-focus-final.log`).
- `local:web` arquivou o supervisor anterior encerrado pela custódia canônica,
  executou o backup devido e emitiu `LOCAL_READY`. `local:health` de 13:28:18Z
  retornou exit 0/status `ready`, todos os seis componentes prontos e códigos
  vazios. Capturas do app real sem sessão em desktop/celular inspecionadas,
  sem erros de página. Aplicação mantida em `http://127.0.0.1:4301/conta`.

Leitor de tela e aparelhos físicos não foram verificados. O teste real usa
o correio local; entrega de e-mail em produção depende do ambiente publicado.

## Entrega Git

Commit e push solicitados pelo usuário depois da implementação. A entrega foi
separada em interface/estados com testes e documentação de auditoria/evidências.
O lint dos sete arquivos TypeScript afetados foi repetido e aprovado antes do
commit, com a web parada pelo supervisor. A seleção inclui somente os onze
arquivos desse escopo; credenciais e artefatos operacionais continuam fora do Git.
