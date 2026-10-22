# Assets da aplicação

`mimo-kitten.png` é uma cópia sem alterações do sticker gerado com ImageGen
no protótipo. `coffee.svg`, `envelope.svg`, `gift.svg` e `takeout.svg` reutilizam
os desenhos originais de `prototype/dist/illustrations.js`, com um elemento
SVG externo para uso como arquivo. A origem está em `prototype/ASSETS.md`.

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
