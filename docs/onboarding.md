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
O protótipo não exige banco. A identidade de T02 usa a stack local abaixo.

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

T01 e as composições estáticas continuam sem exigir banco ou credenciais.
Para cadastro, login, recuperação, MFA e APIs privadas, siga
[identidade local](identity-local.md): engine Docker Linux, stack reservada,
bootstrap e migrações Prisma. D02 e os limites de autenticação D04 foram
confirmados pelo idealizador; D03 e os limites D04 aplicáveis a T04 também foram
confirmados. As demais propostas continuam pendentes.
`web:test:integration` executa HTTP contra os serviços reais, separado do
check sem serviços; ausência de estado, serviço ou suíte é falha.

Para lojas/participações/convites, siga [T04 local](stores-local.md).
O domínio usa bancos separados da identidade e testes em 4310; o Auth continua
na mesma stack local. Não execute os drivers de integração em paralelo.

Para conversas/outbox/notificações, siga [T05 local](relation-local.md).
O consumidor de desenvolvimento roda em terminal separado; a integração testa
falhas/concorrência de modo determinístico e não inicia worker em background.

Para fotos/vídeos, siga [T06 local](media-local.md). O processo de mídia e o Next
têm ambientes separados. A integração inicia o gateway em 4311 e o Next em
4310, com Storage privado e arquivos sintéticos; não execute drivers em paralelo.
D07 e D08 foram confirmadas. A origem deverá atualizar proteção/encerramento
na mesma transação do domínio; a proteção padrão é conservadora.

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

Para atividades e registros reais, siga [T07 local](activities-local.md).
O preparo seleciona desenvolvimento T07; integração usa outro banco e namespace
de mídia. Execute os modos e builds em série, preservando o estado dos anteriores.

O backup anterior à adoção está em `.artifacts/toolkit-setup/before-setup.zip`,
ignorado pelo Git, junto do manifesto de hashes dos arquivos preexistentes.
Recupere apenas o arquivo necessário após comparar alterações posteriores;
não sobrescreva o checkout inteiro com um backup antigo.

Ao retomar trabalho, leia `AGENTS.md` e o documento responsável, confira
`git status --short` e rode os checks pertinentes. Um relato anterior de sucesso
não substitui a inspeção do checkout atual.
