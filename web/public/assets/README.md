# Assets da aplicação

`mimo-kitten.png` é uma cópia sem alterações do sticker gerado com ImageGen
no protótipo. `coffee.svg`, `envelope.svg`, `gift.svg` e `takeout.svg` reutilizam
os desenhos originais de `prototype/dist/illustrations.js`, com um elemento
SVG externo para uso como arquivo. A origem está em `prototype/ASSETS.md`.

A adaptação visual de 23/10/2026 preserva esses arquivos. Os ícones decorativos
de laço, coração, brilho, lojinha, atividades, presente e pessoas estão em
`src/components/ui/mimo-icon.tsx`, desenhados em SVG a partir da linguagem do
protótipo. Eles acompanham rótulos de texto nos controles; o gatinho permanece
decorativo, com espaço reservado no potinho.

`journal.svg` (caderninho de conquistas) e `ticket.svg` (vale com laço) foram
desenhados localmente para a extensão da identidade a todas as telas em
23/10/2026. Usam as cores da marca, contornos framboesa e recortes brancos.
`mimo-page.tsx` compartilha as composições, cabeçalhos e estados vazios. Esses
SVGs são decoração; rótulos, valores e estados permanecem em texto acessível.
O ícone da aplicação em `src/app/icon.svg` usa o mesmo lacinho rosa da marca.

## Biblioteca compartilhada de mimos e atividades

Em 23/10/2026 foram desenhados vinte SVGs adicionais: `cinema`, `dinner`,
`picnic`, `stars`, `games`, `music`, `relax`, `flowers`, `book`, `dessert`,
`pizza`, `art`, `puzzle`, `camera`, `map`, `beauty`, `cozy`, `car`, `jar` e
`clock`. Preservam o viewBox 170 × 150, rosa/branco, traço framboesa de 2,5 px,
corações e brilhos dos quatro originais, sem modificar aqueles arquivos.

O catálogo `src/contracts/illustrations.ts`, a renderização `MimoIllustration`
e o seletor `IllustrationSelect` são compartilhados por mimos e atividades.
A galeria `/visual-check/icones` permite conferir os 24 desenhos com rótulos.
Identificadores, usos e persistência estão em
[`docs/illustrations.md`](../../../docs/illustrations.md).

## Fontes locais

DM Sans (variável, normal) e DM Serif Display (regular) vêm do repositório
[Google Fonts](https://github.com/google/fonts/tree/45e3d5269e4a17d823f6d84470bc084dc5ae46f6/ofl),
revisão `45e3d5269e4a17d823f6d84470bc084dc5ae46f6`, consultada em 22/10/2026.
Os binários TTF originais são redistribuídos sem modificação, sob SIL Open
Font License 1.1. Os arquivos `fonts/dmsans-OFL.txt` e
`fonts/dmserifdisplay-OFL.txt` acompanham cada família e seus créditos.

Fontes: [DM Sans](https://github.com/google/fonts/tree/45e3d5269e4a17d823f6d84470bc084dc5ae46f6/ofl/dmsans)
e [DM Serif Display](https://github.com/google/fonts/tree/45e3d5269e4a17d823f6d84470bc084dc5ae46f6/ofl/dmserifdisplay).
O CSS usa `font-display: swap` e alternativas Arial/Georgia; o navegador e o
build não precisam consultar serviços de fontes.
