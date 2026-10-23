# Meus mimos e tickets no desktop

Continuação da reorganização desktop autorizada em 23/10/2026. O objetivo é
encontrar os vales e entender o próximo passo de cada ticket com menos rolagem,
mantendo a identidade de papelaria, o lacinho, as ilustrações e os tokens atuais.

## Composição escolhida para esta continuação

Manter os cards e usar colunas que respondem à largura disponível, seguindo
Lojinha e Atividades. Uma tabela reduziria a presença dos vales e das prévias de
álbum; abrir o detalhe em um painel acrescentaria navegação e estado fora deste
recorte. A escolha de layout é de implementação dentro do pedido de continuidade.

Em Meus mimos, abertura compacta e navegação precedem a lista. Filtros de período
e estado distribuem-se em linha quando couberem. O filtro de pessoa do lojista
continua completo. Contador e potinho ocupam uma coluna de apoio, depois da lista
na ordem do documento. O contador mantém o total independente dos filtros.

No detalhe, nome, código, situação e custo da ocasião ficam num cabeçalho
compacto. Próximos passos e combinado antecedem os textos completos da ocasião.
A coluna principal conserva detalhes da ocasião, álbum e conversa; o apoio reúne
saldo atual e histórico. Valores históricos e saldo atual permanecem identificados.
Cancelamento, devolução e realização conservam os diálogos e regras existentes.

As colunas só aparecem quando o contêiner tem largura suficiente. No celular e
com texto ampliado, empilham seguindo a mesma ordem de leitura. Não usar sticky
ou esconder conteúdo para reduzir a rolagem. Estado é expresso em texto e badge,
sem depender da cor; links continuam links e ações continuam botões.

## Aceite e limites

- Em 1440 × 900, o primeiro acesso ao ticket e as ações de um ticket aberto
  ficam inteiros na primeira tela com dados usuais e textos longos da ocasião.
- Texto a 200%, nomes de 80 caracteres, números extensos, cancelamento em análise
  e estados terminais preservam legibilidade e controles em 320/390/1120/1280/1440.
- Filtros, paginação, retorno ao histórico/extrato/mural, foco de diálogos,
  recuperação de intenção, negação de acesso e audiência continuam funcionando.
- O período invertido mantém os filtros atuais, associa o erro ao campo e foca
  a data final para permitir correção.
- Sem nova dependência, API, migração, dado persistido ou mudança financeira.
  Conferência controlada de UI não comprova novamente Auth/banco ou aparelho real.
