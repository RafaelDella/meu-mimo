# Preparação e operação local

## Pré-requisitos

Use Node.js 24.12 ou superior da série 24. O ambiente verificado usa Node.js
24.12.0 e npm 11.19.1. `.nvmrc` registra essa versão; não é necessário instalar
um gerenciador de versões para usar o Node já disponível.

Na raiz do checkout:

```sh
node --version
npm --version
npm ci
npm --prefix web ci
npm run check
npm run dev
```

O desenvolvimento continua em `prototype/`, com os mesmos comandos existentes:
`npm run dev` e `npm test` dentro dessa pasta. Os scripts da raiz encaminham
essas operações sem criar um workspace ou mudar o gerenciador de pacotes.

## Primeiro fluxo de conferência

1. Abra `http://127.0.0.1:4173` com dados de demonstração.
2. Abra Atividades e registre uma conquista; confirme o crédito no potinho.
3. Confira que a mesma atividade não pode ser registrada duas vezes no dia.
4. Resgate um mimo com saldo suficiente e confira ticket e débito.
5. Recarregue e confirme que o estado permaneceu naquele navegador.
6. Use Perfil → Recomeçar demonstração para limpar somente o estado da prévia.

Teste também navegação por teclado, retorno do foco dos diálogos, largura de
320 pixels e preferência de movimento reduzido ao alterar a interface.
Os registros de conferências anteriores estão em [prototype/QA.md](../prototype/QA.md).

## Diagnóstico

- Porta 4173 ocupada: encerre apenas o servidor local que você iniciou ou confira
  qual aplicação está usando a porta. Não termine processos de outros trabalhos.
- Falha ao baixar dependências: confira a rede do cliente e o registro do npm.
  Não altere permissões globais ou use instalação forçada para ocultar o problema.
- Estado inesperado: reinicie a demonstração pelo perfil. A chave local é
  `meu-mimo-v1`; dados de outro navegador não são sincronizados.
- Fontes indisponíveis: `web/` serve DM Sans/DM Serif localmente, com fontes
  de sistema alternativas; o protótipo preserva seu carregamento existente.
- Skill nova não descoberta: abra uma nova sessão do cliente e confira sua origem.
  A configuração de um MCP não altera a lista de ferramentas de uma sessão já aberta.

O servidor usa somente `127.0.0.1`, sem acesso a produção. Encerre com `Ctrl+C`.
Não há banco para preparar nem migrações para executar nesta base.

## Continuidade após M0

A base de Next.js/React/TypeScript em `web/`, PostgreSQL/Prisma e Supabase
Auth/Storage foi confirmada em M0. T01 implementa a aplicação sem serviços;
os contratos e dependências estão no
[plano da fundação](superpowers/plans/2026-10-22-m0-fundacao.md).

Após instalar os dois pacotes, `npm run web:dev` atende em 4301, enquanto
`npm run dev` continua atendendo a demonstração em 4173. Não inicie builds,
geração de tipos ou outra tarefa Next ao mesmo tempo neste checkout.

```sh
npm run web:typecheck
npm run web:build
npm --prefix web exec -- playwright install chromium
npm run web:test:e2e
```

O teste de navegador usa o build de produção e recusa reutilizar servidor existente.
No Linux, `playwright install --with-deps chromium` também prepara bibliotecas
do sistema necessárias. A CLI está no pacote, sem instalação global.

T01 não exige banco ou credenciais. T02 exige as decisões de acesso e um
ambiente local de Supabase comprovado. Em M0 foi encontrado um shim npm chamado
`docker`, sem comprovação de Docker Engine/CLI real, e nenhuma CLI Supabase no
PATH. Preparar esse ambiente é uma dependência explícita de T02, sem instalação
global automática. Isso não bloqueia a fundação ou as composições estáticas.

## Conferir a interface de T03

Com `npm run web:dev`, abra `http://127.0.0.1:4301/visual-check`.
Os botões dos mimos mostram diálogos de exemplo; o formulário confere apenas
o campo em memória. Recarregar descarta essa edição, sem criar um mimo.
Assets e licenças estão em `web/public/assets/README.md`.

Para testar em 4303 usando PowerShell, após o build e sem outro servidor nessa porta:

```powershell
$env:WEB_TEST_PORT = '4303'
npm run web:test:e2e
Remove-Item Env:WEB_TEST_PORT
```

O padrão continua 4301 quando a variável não existe. `WEB_TEST_PORT` aceita
somente inteiros de 1024 a 65535. Todos os testes usam a mesma saída `.next/`,
por isso mudar a porta não autoriza builds concorrentes.

## Recuperação e continuidade

O backup anterior à adoção está em `.artifacts/toolkit-setup/before-setup.zip`,
ignorado pelo Git, junto do manifesto de hashes dos arquivos preexistentes.
Recupere apenas o arquivo necessário após comparar alterações posteriores;
não sobrescreva o checkout inteiro com um backup antigo.

Ao retomar trabalho, leia `AGENTS.md` e o documento responsável, confira
`git status --short` e rode os checks pertinentes. Um relato anterior de sucesso
não substitui a inspeção do checkout atual.
