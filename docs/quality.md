# Qualidade e revisão

## Comandos canônicos

| Comando na raiz | O que verifica |
| --- | --- |
| `npm run lint` | JavaScript ESM/CommonJS, preset recomendado do ESLint e regras locais, sem warnings |
| `npm run lint:rules` | Casos válidos e inválidos das três regras do toolkit com RuleTester |
| `npm test` | Testes de domínio e persistência já existentes no protótipo |
| `npm run check` | Autoverificação de regras, lint e testes, interrompendo na primeira falha |
| `npm audit` | Avisos do registro sobre dependências, incluindo ferramentas de desenvolvimento |
| `npm audit --omit=dev` | Avisos de dependências de produção; atualmente não há nenhuma |

Não existem build nem typecheck: os arquivos estáticos são entregues diretamente,
sem TypeScript ou bundler. Não há scripts fictícios para produzir um resultado verde.

## Regras adotadas

O ESLint usa `@eslint/js` recomendado, globais distintos para Node e navegador e
o plugin local `quality`, derivado da revisão do toolkit registrada no setup.
O limite é 350 linhas por arquivo JavaScript, incluindo testes. O gate do navegador
proíbe console direto e importações estáticas de `node:*`, `prisma` e `@prisma/client`.
O console do servidor de desenvolvimento e dos verificadores continua apropriado.

`prototype/dist/` é fonte escrita à mão. A adaptação removeu a exclusão genérica de
`dist` da regra de tamanho e acrescentou um caso de regressão no RuleTester.
Dependências, skills vendorizadas, artefatos e capturas não entram no lint do produto.
CSS/HTML e importações dinâmicas não são cobertos por esses gates; exigem revisão
de interface e de fronteiras quando alterados.

As regras de console e acesso a dados do toolkit também têm autoverificação,
mas não se exige logger de produção nem se configura uma camada de banco inexistente.
Não foram instalados Biome, React, Drizzle ou Vitest para reproduzir exemplos de
outra stack. O runner de testes continua sendo `node:test`.

## Aceite por mudança

Defina comportamento e falhas relevantes antes de implementar. Para corrigir
um defeito, reproduza e prove a regressão quando viável. Não escreva testes que
apenas repitam alterações triviais ou apague proteções para passar nos checks.

Alterações de UI exigem conferência de navegação, teclado, foco, diálogos,
estados vazios, persistência, celular e movimento reduzido. Use dados locais
de demonstração. Mudanças futuras de autenticação, saldo, mídias e banco devem
adotar os critérios de [requisitos.md](../requisitos.md) e [arquitetura.md](../arquitetura.md).

Revise o diff e os chamadores afetados. Mudanças relevantes recebem uma revisão
independente quando disponível, somente leitura e com cenário concreto para cada
achado. Corrija os achados confirmados e repita apenas os checks afetados.
Registre limitações; ausência de achados não prova segurança absoluta.

## Revisão de segurança reutilizável

Fonte e invocação: leia a seção Prompt de
[13-security-review.md na revisão adotada](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/prompts/13-security-review.md)
e solicite revisão somente leitura do intervalo Git ou dos arquivos explicitados,
com relatório privado fora do repositório. Redija evidências sem segredos.
Sem commits, não invente `HEAD`, base de PR ou um intervalo de revisão.

O protótipo confia em estado local de demonstração. Ele não oferece autorização
de servidor, isolamento de contas ou garantia financeira. Uma implantação real
exige serviços e testes próprios; este setup não os simula.

## Avaliar e melhorar o trabalho do agente

Modo adotado: **adaptação nativa do método inspirado no Harness2**, dentro do Codex.
Não executa o framework Harness2 nem seus benchmarks. Preserva o cliente,
autenticação, modelo e permissões da sessão.

Procedimento reutilizável:

1. Leia o [prompt 14](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/prompts/14-harness-evaluation.md)
   e o [prompt 15](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/prompts/15-harness-improvement.md).
2. Use uma cópia descartável fora do projeto, sem credenciais ou dados reais.
   Mantenha entradas e avaliador fora dos arquivos permitidos ao agente de teste.
3. Confira descoberta de instruções/comandos, recuperação de uma decisão canônica
   e revisão somente leitura; registre ações observadas e checks independentes.
4. Uma falha concreta pode justificar uma única candidata pequena, comparada
   com a mesma entrada, aceite e checks. Não enfraqueça limites ou o avaliador.
5. Adote somente uma melhoria comprovada e autorizada. Registre fonte, data,
   escopo, evidência e o evento que exigirá revalidação em `docs/setup.md`.

Sem falha observada, mantenha o procedimento sem fabricar uma experiência.
Um subagente novo prova apenas um contexto novo, não um reinício do aplicativo.
Casos de pausa, conflitos de recursos e ferramentas ausentes ficam como não
executados quando não houver observação. Não instale o CLI Harness2, um proxy,
uma API paga, memória externa ou hooks para executar esse procedimento.
