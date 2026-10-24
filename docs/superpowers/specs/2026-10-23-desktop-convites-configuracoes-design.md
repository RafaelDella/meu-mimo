# Convites e Configurações da loja no desktop

Continuação da organização desktop solicitada em 23/10/2026. Preservar
paleta, tipografia, papelaria, componentes e Visor segmentado aprovados.

## Composição

Convites separa criação e consulta em duas colunas quando houver espaço.
O formulário vem primeiro no documento. O convite recém-gerado aparece no
início da coluna de consulta, antes do histórico, mantendo o foco explícito
no título da confirmação. Cada cartão identifica situação, validade e usos;
compartilhar tem precedência visual sobre revogar. Revelar/ocultar usa o mesmo
botão para preservar o foco de teclado.

A opção de manter todos os cartões em sequência conservaria a lista abaixo
do formulário extenso. Abas esconderiam a consulta enquanto se cria um convite.
A composição escolhida nesta implementação mostra ambos no desktop e empilha
no celular, sem um fluxo novo nem duplicação por breakpoint.

Configurações separa identidade/apresentação da gestão de estado. O formulário
ocupa a área principal; pausa/retomada e encerramento ficam em cartões de apoio
distintos. As confirmações e a recuperação por consulta permanecem completas.
Uma loja encerrada apresenta os dados para consulta, sem formulário editável.
Um formulário único com todas as ações conservaria a proximidade atual entre
salvar, pausar e encerrar.

## Aceite e limites

- Em 1440 × 900, gerar convite e consultar o primeiro convite ficam na
  primeira tela; o convite recém-gerado e suas ações também ficam acessíveis.
- Em Configurações, salvar dados, pausar/retomar e encerrar têm hierarquia e
  agrupamentos distintos, sem mudar autorização ou regras de domínio.
- Preservar datas no fuso da loja, confirmação de horário AT, usos ilimitados,
  política imutável, mesmo operationId/corpo após falha incerta, Retry-After,
  revogação após usos, links legados e fallback de cópia/compartilhamento.
- Preservar erro, carregamento, vazio, pausa da plataforma, consulta de loja
  encerrada, paginação e atualização sem perder os campos em edição.
- Conferir teclado, foco, Escape, nomes de 80 caracteres, apresentação de 280,
  texto em 200%, movimento reduzido e larguras 320/390/1120/1440.
- Não alterar contratos, backend, Prisma, migrações, autenticação, permissões
  ou dados reais. Não mudar a entrada por código do participante; estilos
  compartilhados exigem regressão dessa entrada.
