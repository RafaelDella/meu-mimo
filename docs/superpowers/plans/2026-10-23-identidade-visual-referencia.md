# Aproximação da identidade da prévia — plano de implementação

> **Execução:** nativa nesta sessão, preservando as alterações locais. Revisão independente somente leitura ao final, conforme requesting-code-review.

**Objetivo:** aproximar a aplicação da composição no celular da referência indicada pelo usuário, usando a identidade já especificada em `design.md`, seção 3.1.

**Arquitetura:** conservar Next.js, os contratos e a autorização existentes. Compartilhar a marca, ícones e potinho entre a apresentação, a prévia fictícia e as telas reais. Reutilizar o gatinho e as quatro ilustrações originais, sem dependências adicionais.

**Tecnologias:** Next.js 16.4.2, React 19.3.1, TypeScript, CSS e SVG locais.

**Especificação:** `design.md`, seções 1–4, e pedido explícito de 23/10/2026 para máxima proximidade da referência.

## Restrições e aceite

- Manter `#FFF8FB`, `#FCE8F0`, `#F2A7C4` e `#B23A68`, fontes locais DM Sans/DM Serif Display e a aparência de papelaria afetiva.
- Não alterar dados, saldo, APIs, autenticação, persistência ou migrações.
- Prévia continua identificada como fictícia; valores reais vêm das mesmas propriedades e respostas.
- Stickers não cobrem números, textos, fotos pessoais ou controles.
- Links e botões continuam com foco visível e alvo mínimo de 44 px.
- Não publicar nem modificar o site externo de referência.
- Preservar a alteração preexistente em `README.md`.

## Foco da revisão

Texto a 200%, nomes e saldos extensos, uso em 320/390 px, navegação por teclado e retorno do foco após fechar diálogos. Estados de erro, pendência e saldo negativo devem permanecer legíveis.

### 1. Identidade compartilhada

Arquivos: `web/src/components/ui/{mimo-icon,points-summary}.tsx`, `web/src/styles/{tokens,ui,globals}.css`.

- [x] Desenhar ícones de laço, coração, brilho e navegação em SVG, decorativos e sem alterar nomes acessíveis.
- [x] Compor o potinho com o gatinho original, reservando espaço real para a imagem e permitindo quebra de saldos longos.
- [x] Aplicar a marca em minúsculas e laço, bordas delicadas e sombras suaves.

### 2. Composições e aplicação

Arquivos: `web/src/app/{page,visual-check/visual-preview}.tsx`, `web/src/styles/{visual-check,stores}.css`, `web/src/components/navigation/store-navigation.tsx`, `web/src/components/rewards/{reward-display.tsx,rewards.module.css}`, `web/src/components/notifications/relationship.module.css`.

- [x] Apresentar o celular à direita no desktop, com conteúdo sem altura fixa e adaptação à largura móvel.
- [x] Reutilizar as ilustrações originais em cartões com cabeçalho pastel e divisória de ticket.
- [x] Substituir tons bege residuais das relações pelos tokens rosa, mantendo as cores funcionais dos estados.
- [x] Registrar a aplicação da direção em `design.md` e a autoria dos SVGs em `web/public/assets/README.md`.

### 3. Verificação

- [x] Executar `npm run check`, sem o supervisor local em execução.
- [x] Executar Playwright para fundação, UI, painéis, navegação, notas e catálogo nas duas larguras móveis.
- [x] Conferir imagens em desktop e celular, incluindo texto 200%, teclado, diálogo e movimento reduzido.
- [x] Revisar o diff de forma independente e corrigir achados confirmados.
- [x] Reiniciar o supervisor anteriormente ativo e mostrar a prévia local.

## Resultado da verificação — 23/10/2026

`npm run check` passou: regras, lint, sete testes do protótipo, tipos,
62 testes de web e build. Depois dos ajustes de legibilidade, lint e build
foram repetidos com sucesso. A rodada final de Chromium passou nos 122 casos
selecionados em 320/390 px (47,3 s), incluindo as oito suítes: fundação,
componentes, extrato, catálogo, painéis, bilhetes, reações e novidades.

A revisão independente identificou um P2: a coluna do gatinho estreitava
rótulos em 320 px com texto 200%. O teste de regressão confirmou a falha
antes da correção (a palavra “Disponíveis” ocupava duas linhas) e passou
depois. Uma consulta ao contêiner faz a imagem ir para uma linha própria
quando falta largura. Os testes adicionais conferem ausência de sobreposição
e palavras partidas com saldos extensos positivos e negativos. A revisão
da correção não encontrou problema residual concreto.

Capturas locais e ignoradas pelo Git: `.artifacts/visual-identity/previa-desktop.png`
e `previa-celular.png`; os detalhes de texto 200% estão em `web/test-results/`.
O supervisor anterior foi restaurado e retornou `LOCAL_READY` em 4301.
Não foram executadas migrações nem nova prova de integração de banco, pois
esta mudança é de apresentação. Aparelhos reais e leitor de tela não foram
verificados nesta adaptação.

## Evidência de referência

O endereço externo exigiu login no navegador disponível. A reprodução usa os arquivos originais da demonstração em `prototype/dist/`, identificados por `design.md` e `prototype/ASSETS.md`. Não foi feita comparação autenticada com a publicação atual.
