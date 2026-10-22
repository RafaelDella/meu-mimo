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
- Fontes externas indisponíveis: a interface tem fontes de sistema alternativas.
- Skill nova não descoberta: abra uma nova sessão do cliente e confira sua origem.
  A configuração de um MCP não altera a lista de ferramentas de uma sessão já aberta.

O servidor usa somente `127.0.0.1`, sem acesso a produção. Encerre com `Ctrl+C`.
Não há banco para preparar nem migrações para executar nesta base.

## Recuperação e continuidade

O backup anterior à adoção está em `.artifacts/toolkit-setup/before-setup.zip`,
ignorado pelo Git, junto do manifesto de hashes dos arquivos preexistentes.
Recupere apenas o arquivo necessário após comparar alterações posteriores;
não sobrescreva o checkout inteiro com um backup antigo.

Ao retomar trabalho, leia `AGENTS.md` e o documento responsável, confira
`git status --short` e rode os checks pertinentes. Um relato anterior de sucesso
não substitui a inspeção do checkout atual.
