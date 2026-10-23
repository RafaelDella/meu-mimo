# Biblioteca de ilustrações — plano de implementação

> **Execução:** nativa nesta sessão, com revisão independente somente leitura.

**Objetivo:** disponibilizar os vinte ícones aprovados e os quatro originais
na mesma biblioteca de mimos e atividades.

**Arquitetura:** catálogo tipado compartilhado, SVGs locais, componente de
seleção e renderização comum; migração aditiva das listas de valores aceitos.

**Tecnologias:** Next.js 16.4.2, React 19.3.1, TypeScript, CSS e PostgreSQL/Prisma.

**Especificação:** [desenho aprovado](../specs/2026-10-23-biblioteca-ilustracoes-design.md).

## Restrições e foco da revisão

Preservar alterações locais, arquivos originais, valores e snapshots. Atividade
continua aceitando string vazia; mimo exige um ícone conhecido. URL e nomes
desconhecidos continuam recusados. Não remover validações ao ampliar os checks.
Manter rótulos, foco, bloqueio durante envio e reflow no celular/200%.

## Etapas

1. [x] Criar vinte SVGs em `web/public/assets/` e o catálogo em
   `web/src/contracts/illustrations.ts`, com `Illustration` e `isIllustration`.
2. [x] Usar o catálogo em contratos/validação de mimos e atividades. Criar
   `MimoIllustration` e `IllustrationSelect` em `components/ui/`; integrar os
   dois formulários e as apresentações existentes, com amostra selecionada.
3. [x] Criar `/visual-check/icones` e documentar assets e direção visual.
4. [x] Acrescentar migração `20261023005000_shared_illustrations`, preservando
   as quatro restrições integralmente exceto pelas listas de ilustrações.
5. [x] Exercitar a evolução descartável e a aceitação/rejeição dos identificadores;
   cobrir seleção/salvamento e snapshots nos dois formulários via Chromium.
6. [x] Executar `npm run check`, `db:migrate:check` e os testes de navegador
   afetados em série; renderizar e examinar galeria e formulários.
7. [x] Solicitar revisão independente somente leitura, corrigir achados reais,
   registrar evidências e a situação da aplicação da migração local.

## Fontes consultadas

Guias locais de Image/CSS do Next 16.4.2 e Context7 para Image/SVG (v16.2.9,
última versão disponível no catálogo). Os guias instalados prevalecem.

## Evidências

Os vinte SVGs foram renderizados junto aos quatro originais e examinados em
`.artifacts/illustrations-contact-sheet.png`. Todos usam o mesmo viewBox e
paleta; arquivos originais preservados.

`npm run check` passou pelas regras, lint da base/web, sete testes de domínio,
Prisma/typegen/TypeScript e 60 de 62 testes nativos web. Dois testes de
`tests/pilot/processes.test.mjs` encontraram um supervisor ativo e retornaram
`LOCAL_ALREADY_RUNNING`, interrompendo o agregado antes do build. Não houve
alteração do supervisor nem remoção manual de locks/journal/chaves.
O diagnóstico inicial `PROCESS_IDENTITY_MISMATCH` foi registrado; mais tarde
o supervisor respondeu `ready` e foi parado pelo comando canônico para os
ensaios em série. Log completo: `.artifacts/illustrations-check.log`.

Após as correções finais, `npm --prefix web run lint` e
`npm --prefix web run build` passaram. O build inclui a galeria nova e a
verificação TypeScript. Logs `illustrations-lint.log`/`illustrations-build.log`.

`npm --prefix web run db:migrate:check` passou em banco exclusivo descartável:
evolução pelas dezessete migrações, dados/snapshots, RLS, políticas, grants,
aceitação de todos os desenhos, vazio apenas em atividades, rejeição de URL,
nome desconhecido e pontos/custo zero. As outras condições dos quatro CHECKs
também foram comparadas com as definições anteriores e são idênticas.
Log: `.artifacts/illustrations-migration.log`.

Passaram 66 casos Chromium, em 320/390 px: `illustrations.spec.ts`,
`redemptions/{form,catalog}.spec.ts` e
`activities/{management,edit-boundary,submission}.spec.ts`. Cobrem os dois
seletores, os 24 desenhos decodificados, vazio opcional, teclado/foco, 200%,
movimento reduzido, bloqueio durante envio, recuperação e snapshots.
Log: `.artifacts/illustrations-e2e.log`.

A revisão independente identificou a falta do desenho histórico da conquista.
O teste falhou no build anterior (`illustrations-snapshot-red.log`) e passou
após renderizar o snapshot no card e no detalhe. O teste mantém `book` no
snapshot e `jar` na atividade atual, incluindo o objeto da resposta controlada,
para distinguir as duas fontes. O outro ajuste de revisão reforçou essa prova.

O usuário autorizou explicitamente migrar os bancos T14 locais. O comando
`db:migrate:integration:t14` aplicou a migração e o comando
`db:migrate:dev:t14` confirmou dezessete migrações sem pendências no destino
`meumimo_t14_dev`. Logs `illustrations-apply-{integration,development}.log`.
Os três testes HTTP focais em `integration/redemptions/illustrations.test.mjs`
passaram com Auth/PostgreSQL reais: configuração, resgate, snapshots, registro
de atividade, validações e saldo. Log: `illustrations-integration.log`.

O supervisor fica parado para a validação agregada e os commits coordenados
pelo chat de auditoria de UX; não foram feitos commits, push ou alterações
no índice por esta tarefa. Aparelhos físicos e leitor de tela não foram
verificados; os limites das provas Chromium permanecem explícitos.
