# Resumo da loja e Pessoas no desktop

Continuação da organização desktop solicitada em 23/10/2026. Manter a paleta,
papelaria, gatinho, tipografia e componentes atuais, sem novos contratos.

## Composição escolhida

O Resumo destaca números, registros para cuidar e mimos a realizar. Checklist
e apresentação ocupam apoio lateral quando couberem; acontecimentos vêm depois
das pendências. Uma composição com todos os cards equivalentes conservaria a
disputa atual de atenção. A escolha de implementação prioriza a próxima ação
com as mesmas fontes de dados, sem inventar totais ou indicadores.
Ao abrir todos os acontecimentos, a lista paginada substitui a prévia para
evitar repetir os mesmos eventos.
Expandir ou paginar leva o foco ao título dos acontecimentos, evitando que
ele fique num botão removido ou desabilitado pela consulta.

Pessoas usa uma sequência de cartões compactos, com nome, papel e situação
explícita, abertura da relação em destaque e encerramento em área secundária.
Isso facilita comparar pessoas e encontrar a ação da mesma linha; uma tabela
com todas as ações comprimiria nomes e mensagens no celular. Os filtros e a
paginação atuais permanecem completos.

No detalhe da pessoa, acessos a conquistas, resgates e mural precedem os
conteúdos extensos. Contadores e momentos recentes ocupam a área principal;
potinho compacto e bilhete ficam no apoio, depois dos momentos na ordem do
documento. O saldo é individual e atual; encerramento continua permitindo
consulta do histórico e das pendências existentes.

## Aceite e limites

- Em 1440 × 900, acessos às pendências do Resumo e à relação de uma pessoa
  aparecem na primeira tela, inclusive com apresentação extensa da loja.
- Situação ativa/encerrada é textual. Abertura e encerramento têm hierarquia
  distinta, preservando confirmação, recuperação, erro e retorno de foco.
- Buscar, filtrar e paginar continuam usando os contratos existentes. Não
  apresentar total de participantes ativos a partir de uma página filtrada.
- Nomes de 80 caracteres, apresentação/bilhete extensos, saldo negativo acima
  de MAX_SAFE_INTEGER, estados vazios/erro, teclado, 200%, 320/390 e desktop
  preservam leitura, acesso e ausência de rolagem horizontal.
- Preservar negação de acesso, atualizações sem roubar foco e rascunhos de
  bilhetes. Não alterar a Lojinha do participante, banco, APIs ou permissões.
