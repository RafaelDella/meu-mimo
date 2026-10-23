# Biblioteca de ilustrações

A aplicação compartilha 24 desenhos entre o cadastro de mimos e o cadastro de
atividades. A atividade também permite “Sem ilustração”. O seletor mostra uma
amostra da escolha; o desenho não substitui nomes, pontos ou estados em texto.
Confira todos em [`/visual-check/icones`](http://127.0.0.1:4301/visual-check/icones).

## Catálogo e direção de arte

O catálogo canônico está em `web/src/contracts/illustrations.ts`. Os arquivos
ficam em `web/public/assets/`, renderizados pelo componente `MimoIllustration`.
`IllustrationSelect` é o mesmo controle nos dois formulários. Contratos e
validação das APIs usam a mesma lista, sem aceitar URLs ou nomes arbitrários.

| Identificador | Rótulo | Exemplos de uso |
| --- | --- | --- |
| gift | Presente | Surpresa, desejo da lista, pequeno presente |
| coffee | Café | Café na cama, bebida favorita, pausa |
| takeout | Comidinha | Delivery, lanche, degustação |
| envelope | Cartinha | Carta, bilhete, envelopes “abra quando” |
| cinema | Cinema | Filme, série, caixa temática |
| dinner | Jantar | Jantar, cozinhar juntos, aprender receita |
| picnic | Piquenique | Passeio com cesta, preparar lanches |
| stars | Lua e estrelas | Observar o céu, acampar, descansar |
| games | Jogos | Jogar, aprender um jogo |
| music | Música | Dançar, cantar, praticar instrumento |
| relax | Relaxamento | Massagem, cafuné, pausa de autocuidado |
| flowers | Flores | Buquê, plantinha, cuidar das plantas |
| book | Livro | Ler, estudar, visitar livraria |
| dessert | Docinho | Sobremesa, doce favorito, confeitar |
| pizza | Pizza | Montar pizzas, noite de pizza |
| art | Arte | Pintar, desenhar, criar um presente |
| puzzle | Quebra-cabeça | Montar, aprender, praticar um hobby |
| camera | Câmera | Fotografar, preparar álbum, gravar lembranças |
| map | Passeio | Caminhar, conhecer um lugar, date |
| beauty | Beleza | Unhas, cabelo, produtos e acessórios |
| cozy | Aconchego | Conforto, pantufas, tarde aconchegante |
| car | Transporte | Passeio de carro, acompanhar compromisso |
| jar | Potinho de amor | Motivos, mensagens, pequenos bilhetes |
| clock | Tempo e memórias | Cápsula do tempo, nostalgia, tempo dedicado |

Os quatro originais permanecem intactos. Os vinte novos SVGs seguem seu
viewBox 170 × 150, contorno framboesa `#B23A68` de 2,5 px, rosa `#F2A7C4`,
branco e detalhes afetivos. Não dependem de fontes de ícones nem de serviços
externos. Os arquivos são desenhos locais, sem scripts ou recursos remotos.

## Persistência e evolução

A migração aditiva `20261023005000_shared_illustrations` amplia as listas de
Activity, ActivitySubmission, Reward e Redemption. Conserva as outras
condições dos checks, RLS, grants e dados existentes. A cadeia passa a ter
dezessete migrações; as dezesseis anteriores permanecem sem alterações.
Os snapshots de conquistas e tickets preservam o desenho da ocasião.

Antes de usar novas escolhas em um banco existente, a migração precisa ser
aplicada pelo responsável autorizado, com os escritores parados, conforme
os comandos de migração do ambiente em [operação local](pilot/local.md).
Para T14, o comando de desenvolvimento é
`npm --prefix web run db:migrate:dev:t14`; o de integração é
`npm --prefix web run db:migrate:integration:t14`. Não aplicar migração sem a
autorização correspondente.

Novas ampliações devem acrescentar o arquivo e a entrada no catálogo, além
de evoluir as quatro listas no banco por outra migração aditiva. Verificar
desenho, seleção, APIs e snapshots dos dois domínios antes de disponibilizar.
Nenhum exemplo desta biblioteca cria atividades, mimos ou pontos sozinho.
