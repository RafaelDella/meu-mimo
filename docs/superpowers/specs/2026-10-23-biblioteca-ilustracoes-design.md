# Biblioteca compartilhada de ilustrações

O usuário aprovou em 23/10/2026 os vinte desenhos abaixo, com reutilização dos
quatro originais, e pediu uma biblioteca disponível em mimos e atividades.

## Direção e abordagens

A abordagem escolhida amplia os SVGs locais existentes. Mantém o viewBox
170 × 150, branco/rosa, contorno framboesa de 2,5 px, corações e brilhos.
Fontes de ícones prontas não preservariam os desenhos; imagens raster não são
necessárias para ampliar esta família vetorial. Não há dependências novas.

Os novos temas são cinema, jantar, piquenique, lua e estrelas, jogos, música,
relaxamento, flores, livro, docinho, pizza, arte, quebra-cabeça, câmera,
passeio, beleza, aconchego, transporte, potinho de amor e tempo e memórias.
Presente, café, comidinha e cartinha mantêm seus arquivos e identificadores.

## Comportamento e aceite

- Um catálogo de identificadores/rótulos alimenta os contratos, a validação
  das APIs e o mesmo seletor nos dois formulários.
- O seletor conserva o controle nativo com rótulo, teclado e foco, acrescenta
  uma amostra decorativa e permite ausência de ilustração nas atividades.
- Cards, conquistas e tickets usam o identificador da configuração ou do
  snapshot da ocasião. Editar o catálogo não muda o histórico.
- Uma galeria em `/visual-check/icones` apresenta os 24 desenhos com rótulos.
- Migração aditiva amplia somente as listas das quatro restrições existentes:
  Activity, ActivitySubmission, Reward e Redemption. Preserva todos os demais
  campos, checks, RLS, grants e dados; não reescreve SQL aplicado.
- Prova de evolução em banco descartável, validação das APIs e formulários em
  Chromium a 320/390 px, teclado, 200%, estados bloqueados e movimento reduzido.
- Migração em banco de uso diário exige autorização correspondente. A criação
  dos arquivos e os ensaios descartáveis integram o trabalho aprovado.

Não são cadastrados mimos ou atividades, atribuídos pontos ou alteradas contas
existentes. O protótipo conserva seus quatro exemplos; a biblioteca integra a
aplicação real em `web/`.
