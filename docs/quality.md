# Qualidade e revisão

## Comandos canônicos

| Comando na raiz | O que verifica |
| --- | --- |
| `npm run lint` | Base e protótipo JavaScript ESM/CommonJS, ESLint 10 e regras locais, sem warnings; exclui `web/` |
| `npm run lint:rules` | Casos válidos e inválidos das três regras do toolkit com RuleTester |
| `npm test` | Testes de domínio e persistência já existentes no protótipo |
| `npm run web:lint` | Aplicação/configuração/testes TS/TSX e JS de `web/`, ESLint 9, preset Next e regras locais |
| `npm run web:typecheck` | Geração de tipos de rotas e `tsc --noEmit`, incluindo testes TS |
| `npm run web:test` | Testes nativos de fronteira e regras, com AST TypeScript/TSX real |
| `npm run web:test:integration` | Inicia produção em 4302 e testa HTTP contra a stack Supabase real preparada; sem reutilizar servidor |
| `npm --prefix web run test:integration:t05` | Domínio T05 em 4310, regressões T02/T04 e conversas/outbox/notificações reais com falhas e entrega concorrente |
| `npm --prefix web run test:integration:t06` | Domínio T06 em 4310, processo de mídia 4311, Storage privado, pipeline real e regressões T02/T04/T05 |
| `npm --prefix web run test:integration:t07` | Atividades, calendário/DST, concorrência, ledger, foto real e regressões anteriores no domínio T07, com Next4310/mídia4311 |
| `npm --prefix web run test:integration:t08` | Análise, complementos, compensações, extrato, mídia real e regressões no domínio T08, com Next 4310/mídia 4311 |
| `npm --prefix web run test:integration:t09` | Catálogo, emissão/débito/estoque atômicos, histórico de tickets e regressões no domínio T09, em série |
| `npm --prefix web run db:migrate:check` | Banco vazio, evolução com dados fictícios preservados, RLS e permissões efetivas |
| `npm run web:build` | Build real de produção Next |
| `npm run web:test:e2e` | Smoke do build em Chromium a 320/390 px; requer browser instalado |
| `npm run check` | Gates da base e lint/tipos/testes/build de `web/`, em série e interrompendo na primeira falha |
| `npm audit` | Avisos do registro sobre dependências, incluindo ferramentas de desenvolvimento |
| `npm audit --omit=dev` | Avisos da base; para a aplicação usar também `npm --prefix web audit --omit=dev` |

O protótipo continua estático, sem build. A aplicação possui build/typecheck
próprios e lockfile independente; instale os dois pacotes antes do check agregado.
O navegador é uma conferência adicional ao `check` e também roda no workflow.
Os testes em `web/tests/integration/` ficam fora do runner padrão, para que o
check sem serviços não execute suítes de banco acidentalmente. O comando
próprio exige a stack de [identidade local](identity-local.md), migrações e
build atualizado. Estado/serviço ausente ou pasta sem suítes causa falha;
não há skips ou substituição de Auth/banco por mocks nessa prova.

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
Não foram instalados Biome, Drizzle ou Vitest. React pertence à aplicação escolhida;
o runner nativo continua sendo `node:test`. Os mesmos casos das três regras são
compartilhados entre RuleTester 10 da raiz e RuleTester 9 da aplicação. Casos
adicionais usam parser TypeScript/TSX real.

O lint de `web/` proíbe imports privados em módulos com `use client`, incluindo
imports/exports e importações dinâmicas de caminho estático, e restringe acesso
direto a dados nas camadas de apresentação. Caminhos calculados e código de
terceiros não ficam provados seguros por essa análise. Um build descartável deve
falhar com o diagnóstico de `server-only` ao tentar importá-lo no cliente; o build
normal importa o mesmo marcador pelo layout de servidor e deve passar.

Os testes de navegador verificam carregamento sem serviços, toque, teclado/foco,
texto 200%, larguras móveis, ausência de erros e movimento reduzido. Chromium
emulado não substitui Android/iPhone reais nem conferência com leitor de tela.

T03 acrescenta seis cenários por largura em `/visual-check`: três composições,
saldos distintos e ordem semântica; diálogo com Tab/Shift+Tab, Fechar/Escape e
retorno do foco; ticket sem persistir ou descontar pontos; campo com rótulo,
orientação, erro e correção; texto 200% sem cortar ações/modal; desktop e
movimento reduzido. A suíte também rejeita requisições externas e mutantes.
As capturas ficam em `web/test-results/`; o servidor usa `WEB_TEST_PORT` ou
4301 por padrão. A árvore ARIA verifica rótulos/ordem, sem simular fala de
leitor de tela. Os tokens têm contraste calculado; isso não prova toda a
interface em todas as condições de uso.

T02 separa a prova HTTP real dos estados de interface: o Playwright controla
respostas da API somente nos casos de formulário/erro e QR de `/conta`.
Esses casos verificam rótulos, teclado, foco, texto 200%, movimento reduzido,
larguras 320/390 e imagem decodificada; não provam autenticação. A suíte HTTP
usa Auth, PostgreSQL e Mailpit reais para PKCE, recuperação, renovação,
revogação, suspensão, MFA, isolamento e limites atômicos, inclusive concorrentes.
O JWT expirado da fixture usa a chave HMAC legada local: o Auth precisa aceitar
o par vigente e rejeitar a variante expirada explicitamente por expiração;
depois, o refresh é realizado pelo provedor e seus cookies são conferidos.

## Aceite por mudança

T04 acrescenta 22 testes HTTP reais (48 contando a regressão de identidade) e
46 casos Chromium (74 no total, em 320/390). Cobrem criação/convite repetidos e
concorrentes, dois participantes isolados, limites por conta, pausa/encerramento,
cadastro/callback de convite e perfil próprio. UI inclui 503 → 429 → recuperação,
foco após confirmar pausa/encerramento/revogação, respostas atrasadas, troca de
conta por BroadcastChannel e ocultação durante revalidação. Os testes de UI usam
respostas controladas; a identidade/persistência são comprovadas na suíte HTTP.
Evidências, revisão e limites no [plano T04](superpowers/plans/2026-10-22-t04-lojas.md).

T05 acrescenta 17 cenários HTTP reais de conversas/notificações e uma composição
de conversa em memória. O consumidor é testado diretamente e por CLI separado,
com runtime restrito; os testes de falha não disputam com worker em background.
Constraints temporárias de fixtures provocam rollback no produtor e na entrega,
inclusive após inserir aviso e antes de marcar evento. Consultas comprovam
recuperação de entrega atrasada e autorização atual de item, contador e destino.
Estados visuais não substituem essas provas de serviço/persistência. Execução,
revisão e regressões no [plano T05](superpowers/plans/2026-10-22-t05-relacao.md).

T06 acrescenta 36 testes HTTP/pipeline: partes idempotentes, audiência,
Storage direto negado, checksum real, formatos/EXIF/rotação, MP4/MOV/silêncio,
Range e reprodução com Chromium autenticado, CAS de lease e expurgo de remoção
explícita, D08 com relógio/lease, temporários após queda e caminho canônico para
UUID recebido em maiúsculas. Arquivos são
sintéticos gerados localmente. Uma prova adicional encerrou e reiniciou o broker,
retomou partes persistidas sem duplicação e processou a fila em outro processo.
A UI em memória é separada das provas de serviço. Câmera/galeria e reprodução
em aparelhos reais continuam pendentes.

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

T09 acrescenta 36 HTTP reais (211 com regressões) e 112 Chromium (382 no total).
As provas cobrem saldo/último estoque concorrentes, emissão idempotente e rollback
de cada efeito, snapshot após edição/arquivo, gasto real seguido de anulação,
histórico/DST/filtros, contador e privacidade entre pessoas. Chromium cobre
reload/resposta perdida, três abas, paginação de 50, Unicode, erros associados,
foco/teclado, 320/390 e texto 200%. A evolução preserva dados T07/T08 e nega
emissão gratuita, reserva sem ticket e auditoria administrativa tardia.
Evidências, revisão e limites no [plano T09](superpowers/plans/2026-10-22-t09-catalogo-resgates.md).

T10 acrescenta 38 casos HTTP reais (249 com regressões), com realização versus
cancelamento, devolução única do custo congelado, reposição explícita e rollback
de cada efeito. A prova de evolução verifica doze migrações, privilégios
restritos e preservação da cadeia financeira. A guarda SQL rejeita motivos
formados só por espaços Unicode ou caracteres de controle, além dos limites da
API. No navegador, o histórico conserva foco ao mudar de página e a recuperação
de intenção usa UUID sem persistir textos privados. Evidências e limites no
[plano T10](superpowers/plans/2026-10-22-t10-realizacao-cancelamento.md).

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

## Evidência de T07

T07 passou check (7+9 testes, lint/tipos/build), migrações/permissões, 138 casos
HTTP reais locais e 166 cenários Chromium a 320/390. Os 37 HTTP e 30 Chromium
novos cobrem calendário/DST, concorrência, rollback, privacidade, revisão e
recuperação de envio; os demais são regressões. A revisão independente foi
seguida de reprodução/correção dos achados, incluindo sessão/foco e meia-noite
repetida. Após o ajuste final de CSS restrito ao resumo, check e os 30 Chromium
afetados passaram novamente. Capturas normais/200% e scan de segredos conferidos.
Detalhes e limites no [plano T07](superpowers/plans/2026-10-22-t07-atividades.md).

T08 passou `check` com 7+9 testes, lint/tipos/build, prova de migração com crédito
T07 anterior à evolução e privilégios efetivos, 175 HTTP (37 T08 e 138 regressões)
e 270 Chromium (104 T08 e 166 regressões) em 320/390. Após mudar a ordenação da
consulta de evidências, os cinco HTTP de autorização/mídia passaram novamente.
As capturas de anulação, complemento e extrato normal/200% foram examinadas.

Revisão independente identificou paginação após 50 fotos, descarte do extrato
após perda de acesso e foco após remover o acionador da decisão. As regressões
falharam antes e passaram depois das correções, incluindo 401/403/404. A prova
SQL também rejeita evento órfão, anulação sem estorno e aprovação sem crédito.
Um seletor ambíguo de paginação foi restringido ao histórico antes da suíte final.
Detalhes no [plano T08](superpowers/plans/2026-10-22-t08-analise-extrato.md).

Saldo negativo após gasto e preservação de tickets exigem a integração T09;
T08 prova estorno real, aritmética assinada e apresentação controlada. Leitor
de tela, aparelhos físicos, CI remoto e publicação continuam não observados.

## Verificação de T11

Álbuns usam o pipeline real de mídia e tickets reais também nas regressões T06.
As provas cobrem seleção explícita, três fotos/dois vídeos, lote parcial, ordem
e legenda imutáveis, remoção autoral, recuperação e corridas com cancelamento.
A evolução preserva a cadeia financeira e as coleções anteriores; runtime não
altera itens/eventos nem apaga auditoria.

Retenção deve ser verificada antes da manutenção: um álbum vencido sem hold
não pode retornar bytes, legendas ou metadados, inclusive para UUIDs válidos
especiais. O teste nil falhou antes e passou depois do filtro explícito vazio.
Na UI, remoção confirmada precisa ocultar imediatamente mesmo se a consulta
seguinte falhar; revisão mantém miniatura/duração e a galeria informa publicação.
Evidências e limites no [plano T11](superpowers/plans/2026-10-22-t11-album.md).

## Verificação de T12

A leitura do bilhete deve confirmar a versão exibida e nunca aparecer nos
DTOs do lojista. Rascunho mantém sua versão de base quando outra edição chega.
Reações usam estado desejado e replay; adicionar/trocar/remover não altera
ledger, estoque, análise ou ticket. Mural consulta somente origens recebidas
e mídia publicada dentro da retenção atual.

Grupos preservam Notification por evento; leitura até a versão observada não
lê entregas posteriores. Silenciar muda atenção sem modificar `readAt` ou
ocultar decisões financeiras. A consulta automática deve preservar foco,
descartar respostas de outra conta/loja, recuperar comentários/contexto após
retorno à aba e reaproveitar os snapshots de reações no mural de cinquenta itens.

Provas SQL, HTTP, Chromium e revisão independente são registradas no
[plano T12](superpowers/plans/2026-10-22-t12-relacao-paineis.md).
T12 foi verificada em SQL, HTTP real e Chromium, com as ocorrências e repetições
focais descritas no plano. Capturas controladas e
simulação de conectividade não substituem aparelhos físicos, leitor de tela,
transporte Realtime ou publicação, adiados pelo idealizador.
