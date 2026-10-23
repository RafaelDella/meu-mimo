# Extrato e Mural no desktop

Continuação da organização desktop solicitada em 23/10/2026. Preservar a
identidade de papelaria, rosa, creme, tipografia, gatinho e componentes atuais.

## Composição

Usar a mesma organização responsiva das telas anteriores: conteúdo principal
antes do apoio na ordem do documento, com colunas somente quando couberem.
Uma tabela no extrato comprimiria origem, autoria e ajustes em telas pequenas;
um mural com várias colunas dificultaria acompanhar a sequência e as conversas.
A escolha de implementação é manter movimentos agrupados por dia e o mural
em uma sequência única de cards, compactando filtros e metadados.

No Extrato, título, período/fuso e filtros precedem os movimentos. Potinho
compacto, consulta de tickets e explicação dos tipos ficam no apoio. O saldo
continua atual e independente do período; para o lojista, só aparece quando
há uma participação aplicada, nunca um saldo agregado. Valores assinados,
origens e compensações permanecem completos, sem somar apenas a página.

No Mural, os filtros ocupam uma superfície delimitada. O filtro de pessoas
ganha disposição própria em largura suficiente; itens por página passa para
a linha de controle da lista. Cards priorizam nome, situação e acessos à
origem/conversa antes da prévia de mídia. Resumo, mídia, reações e conversa
continuam disponíveis, sem truncar conteúdo. O estado usa texto e badge.

## Aceite

- Em 1440 × 900, a primeira origem do extrato e o acesso do primeiro item
  do mural cabem na primeira tela, tanto para participante como para lojista.
- Filtros legíveis; datas e seletor de pessoa com pelo menos 180px nesse cenário.
- Período invertido mantém a URL aplicada, associa a mensagem à data final
  e direciona o foco para correção.
- Nomes longos, saldo negativo/extenso, cinquenta itens, 200% de texto,
  320/390/1120/1280/1440px, teclado e movimento reduzido preservam os controles.
- Filtros, paginação, retorno à origem, reações, conversa, atualização e
  revogação de acesso conservam os contratos atuais.
- Sem dependências, migrações, API nova, alteração financeira ou publicação.
