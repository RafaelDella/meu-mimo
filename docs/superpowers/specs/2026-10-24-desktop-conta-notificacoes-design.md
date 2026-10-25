# Minha conta e Notificações no desktop

Pedido: continuar a melhoria de UX desktop, mantendo a identidade e usando
stickers/ícones existentes. As escolhas abaixo são de implementação, sem nova
decisão de produto ou alteração dos contratos de autenticação/notificações.

## Diagnóstico e direção

A conta autenticada reutiliza o cartão de entrada: perfil, preferências por loja,
saída e MFA ficam numa coluna estreita e longa. A central de novidades empilha
cabeçalho, busca/seletor, categorias e cartões, com ações de mesma ênfase.

Foram consideradas decoração isolada, reorganização dos componentes existentes
e novas páginas/rotas. Escolhida a reorganização: resolve a hierarquia com o
controlador de sessão, permissões e APIs já usados. Sem dependências novas.

## Minha conta

Separar a apresentação autenticada da entrada, mantendo login/cadastro/recuperação
com a composição atual. Título Minha conta, status da sessão e navegação para
Minhas lojas/Novidades no cabeçalho. Perfil e preferências na coluna principal;
MFA e saída no apoio, com finalidade e controles claros. No celular, empilhar
na ordem de leitura. Journal/gato/envelope são decoração, sem capturar cliques.

Preservar salvamento/reconciliação de perfil, rascunhos em memória, e-mail somente
consulta, troca de conta, MFA, QR/chave manual e administração. A árvore privada
continua oculta/inativa durante revalidação. Recuperação restrita nunca monta
perfil/preferências. Foco após entrada, senha salva e saída continua no título.

## Notificações

Continuar usando o nome Novidades. Cabeçalho compacto, contador global de grupos
com atenção e navegação. Filtros por loja/categoria em apoio à esquerda quando
houver espaço, lista à direita. Resultados com título/contagem do filtro e cartões
de leitura rápida: loja/categoria/data, autor e acontecimento, não lidas e situação
do contador. Abrir novidade é a ação principal; marcar grupo como lido é secundária.
Não há nova ordenação, contagem derivada da página ou filtro não suportado.

Contador global e total filtrado são identificados separadamente. Erro/atualização
mantém honestidade sobre dados antigos; vazio tem sticker e próxima ação útil.
Preservar throughVersion observada, novas entregas não lidas, aviso silenciado,
diálogo da loja/papel e ausência de confirmação de bilhete ao ler novidade.
Uma ação de limpar filtros deve reiniciar também o seletor e a página, sem alterar
preferências nem fazer leitura automática. Paginação mantém foco e parâmetros.

Preferências agrupam opções em alvos de toque com orientação curta, sem mudar
silenciamento social, aprovação automática, histórico, UUID/retry ou conflitos.
Seleção de loja é explícita; não escolher uma loja automaticamente.

## Aceite

Desktop 1280/1440 × 900, celular 320/390, texto 200%, movimento reduzido, teclado,
foco, erro/vazio/carregamento, contexto revogado e trocas de sessão. Estilos
isolados para não modificar mural/lojinhas. Stickers locais, rosa/creme/serifas,
ícones SVG existentes e texto independente da decoração. Testes de UI controlados
e integração focal real das regras afetadas; sem fixtures privadas no Git.
