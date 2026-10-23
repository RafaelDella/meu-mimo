# Meu Mimo — roadmap de implementação

> **Para quem executar:** trabalhar por tarefas verificáveis, com um escritor por arquivo e revisão independente somente leitura. Usar os recursos nativos descobertos no cliente e as skills disponíveis; nenhuma instalação adicional é pressuposta. Marcar caixas somente com evidência verificada.

**Objetivo:** transformar a prévia em uma aplicação privada que complete o ciclo criar loja → convidar → registrar conquista → analisar → pontuar → resgatar → realizar o mimo.

**Arquitetura:** preservar o protótipo como referência visual e implementar os fluxos reais por entregas completas. Autorização pertence ao servidor; pontos, estoque, tickets e notificações de domínio exigem persistência consistente. Prisma permanece responsável pelo acesso e pelas migrações do banco.

**Stack:** hoje, HTML/CSS/JavaScript ESM, Node.js 24 e npm. Em M0, D01 confirmou Next.js/React/TypeScript em `web/`, PostgreSQL/Prisma e Supabase Auth/Storage para desenvolvimento/teste local. Versões e escolhas técnicas estão em arquitetura §1.1; publicação e políticas pendentes mantêm seus próprios gates.

**Especificação:** [requisitos](../../../requisitos.md), [arquitetura](../../../arquitetura.md), [design](../../../design.md) e [README](../../../README.md). Operação e qualidade: [onboarding](../../onboarding.md), [setup](../../setup.md) e [quality](../../quality.md).

**Data:** 22/10/2026, atualizado em 23/10. **Estado atual:** M0 e T01–T14 entregues no recorte local; direitos, web, laboratório e recuperação foram verificados. O [plano local T14–T15](2026-10-22-t14-t15-local.md) e o [aceite](../../pilot/acceptance.md) registram execução e limites. T15 local é a próxima implementação, após o commit T14. O idealizador priorizou web/PostgreSQL locais e adiou provedores, publicação e aparelhos físicos; esses gates continuam abertos, inclusive leitor de tela real. Decisões constam em requisitos §6.1; a seção 1 preserva o ponto de partida do planejamento.

## 1. Ponto de partida e restrições

| Situação | Evidência e consequência |
| --- | --- |
| Prévia funcional da participante | `prototype/dist/` contém fontes manuais, assets, três abas, atividades, resgate, extrato e bilhete demonstrativos. Preservar essa referência. |
| Persistência de demonstração | `prototype/dist/model.js` usa `localStorage`, saldo inicial de 240 e dia em São Paulo. Esses dados e regras não migram para contas reais. |
| Fundação de qualidade existente | A raiz oferece lint, autoverificação das regras e sete testes com `node:test`. Não há build/typecheck, backend, schema Prisma ou serviços reais. |
| Decisões confirmadas | Mobile first, conta com papéis por contexto e várias lojas, Prisma, históricos no MVP, várias fotos/vídeos por resgate e intenção de retrospectiva futura. |
| Infraestrutura selecionada para implementação | D01 confirmou a base e o desenvolvimento/teste local; versões selecionadas em M0 ainda precisam de instalação/build em M1. Login, políticas e hospedagem seguem suas decisões específicas. |

Restrições globais para todas as tarefas:

- Preservar alterações locais, os sete testes de domínio e `prototype/dist/` versionado.
- Manter Node.js `>=24.12.0 <25` e npm enquanto compatíveis com a stack que for escolhida. Mudanças exigem registro canônico e verificação.
- Prisma executa somente no servidor. Validar sessão, papel, loja, participação e estado em cada acesso privado, inclusive por link direto.
- Saldo pertence à participação em uma loja; não existe saldo global entre lojas. Pendências de aprovação não são saldo disponível.
- Preservar snapshots da ocasião e corrigir pontos por movimentos compensatórios vinculados; editar o catálogo não reescreve o passado.
- Segredos, `.env`, backups e relatórios sensíveis ficam fora do Git. Exemplos de configuração não contêm valores reais.
- Interface e documentos usam português claro; manter identidade, assets e atribuições existentes.
- Não instalar hooks, trocar ORM, cliente, modelo, autenticação do agente ou permissões para cumprir uma receita genérica.

## 2. Abordagem recomendada

| Abordagem | Consequência | Avaliação |
| --- | --- | --- |
| Evolução por fluxos completos, preservando a prévia | Cada marco entrega comportamento testável para os papéis envolvidos; interface e serviços evoluem juntos. | Recomendada: permite validar privacidade e consistência antes de ampliar o produto. |
| Construir todo o backend e depois todas as telas | Contratos podem ser organizados cedo, mas os fluxos reais e o uso móvel só aparecem no fim. | Possível, com maior risco de retrabalho de integração. |
| Estender a demonstração local até parecer um produto completo | Reaproveita rapidamente a navegação, mas exige substituir suas suposições sobre identidade, persistência e pontos. | Inadequada como fundação das garantias do produto real. |

Organização confirmada em D01: criar a aplicação futura em `web/`, mantendo os comandos do protótipo. O diretório ainda não está implementado. Se a organização mudar, atualizar os caminhos e as ondas antes de delegar.

O roadmap define marcos e pacotes de trabalho. Antes da execução de cada pacote, detalhar suas interfaces, nomes de testes e comandos para as versões efetivamente escolhidas. Não gerar agora código de uma stack ainda proposta.

## 3. Marcos de entrega

| Marco | Tarefas | Entrega demonstrável | Condição para avançar |
| --- | --- | --- | --- |
| M0 · Contratos | T00 | Decisões necessárias ao MVP registradas e base atual verificada | Nenhuma proposta necessária à próxima tarefa tratada como confirmação |
| M1 · Fundação | T01–T03 | Aplicação escolhida executável, conta, autorização e componentes acessíveis | Instalação e checks reais; acesso cruzado negado; prévia preservada |
| M2 · Lojas e infraestrutura privada | T04–T06 | Lojas, convites, contexto, conversa/notificações persistidas e mídia privada | Conta com vários contextos sem vazamento; upload e eventos com repetição segura |
| M3 · Conquistas | T07–T08 | Envio → análise → crédito → contestação/anulação → extrato | Crédito/estorno únicos, recorrência correta e histórico da ocasião |
| M4 · Mimos | T09–T10 | Catálogo → resgate → combinado → realização/cancelamento | Saldo/estoque/ticket consistentes e devolução única |
| M5 · Momentos e relação | T11–T12 | Álbum privado, bilhete, reações, mural e central de novidades | Fotos e vídeos privados, falhas recuperáveis e bilhete versionado |
| M6 · Pronto para piloto | T13–T14 | Administração mínima, revisão integrada, recuperação e aceite móvel | Todos os P0 cobertos; evidências e limitações registradas |
| M7 · Piloto autorizado | T15 | Publicação controlada, acompanhamento e recuperação operacional | Autorização correspondente, ambiente conferido e fluxo real validado |
| Evolução | E01–E04 | PWA, push, metas, métricas e retrospectiva | Priorizar com uso do piloto e decisões específicas |

M3 e M4 são marcos internos de validação. O MVP descrito nos requisitos só está completo após M6: álbum, interações, notificações no app e administração mínima continuam P0.

```mermaid
flowchart LR
    A[M0 Contratos] --> B[M1 Fundação]
    B --> C[M2 Lojas e infraestrutura privada]
    C --> D[M3 Conquistas]
    D --> E[M4 Mimos]
    E --> F[M5 Momentos e relação]
    F --> G[M6 Aceite do piloto]
    G --> H[M7 Piloto autorizado]
    H --> I[Evolução]
```

Não há prazo de entrega firmado. Capacidade da equipe, orçamento, serviços e políticas de mídia ainda não estão definidos. Estimar duração por marco após T00/T01, usando a primeira entrega integrada para calibrar; paralelismo não equivale a redução garantida de prazo.

## 4. Decisões que liberam o trabalho

T00 organiza estas decisões com o idealizador; as que não forem resolvidas bloqueiam somente as tarefas dependentes. Propostas dos documentos, como saldo zero inicial, convite de sete dias e saldo negativo por estorno, precisam continuar identificadas até confirmação.

| ID | Decisão a registrar na fonte responsável | Necessária antes de |
| --- | --- | --- |
| D01 · confirmada em M0 | Next.js/React/TypeScript em `web/`, PostgreSQL/Prisma e Supabase Auth/Storage para desenvolvimento/teste local. Versões e escolhas técnicas registradas em arquitetura §1.1 após consulta a fontes oficiais; ambiente local ainda precisa ser comprovado. Nenhum custo/publicação autorizado. | T01–T02 |
| D02 | Login, recuperação/verificação da conta, retorno seguro ao convite e proteção/provisionamento administrativo sem autocadastro. | T02 |
| D03 · confirmada em T04 | Um responsável, catálogo/atividades compartilhados, saldo zero, link portador de uso único por sete dias e efeitos de pausa/encerramento em requisitos §6.1. | T04, T07, T09 |
| D04 | Início da semana, retroatividade, estados que ocupam ocorrência, alteração de fuso e limites técnicos de texto/paginação/requisições. Limites de autenticação precisam de decisão antes do respectivo fluxo. | T02 para autenticação; T04–T12 conforme o recurso |
| D05 | Contestação após gasto, saldo negativo por estorno, reabertura e recomposição; preservar tickets emitidos conforme a regra aprovada. | T08 |
| D06 · confirmada em T09 | Baixa na emissão; futuro cancelamento devolve pontos uma vez, reposição explícita desligada por padrão, pedido bloqueia realizar e recusa motivada restaura o estado anterior. Procedimento de disputa após realização fica para T14. | T09–T10; procedimento T14 |
| D07 · confirmada em T06 | Limites de fotos/vídeos, versões de evidência, lote/álbum, miniaturas e gateway local separado confirmados em requisitos §6.1. Prova sintética local não comprova câmera/galeria ou reprodução em Android/iPhone reais. | T06/T11; prova móvel ainda pendente |
| D08 · confirmada em T06 | Órfãos 24h, originais até 24h após processamento, evidência 180 dias com proteção e álbum até 12 meses após encerramento. Histórico até 24 meses, backups até 30 dias e procedimento de exportação/exclusão em T14. Proteção conservadora até integrar a origem. | T06, T11, T14 |
| D09 | Aparelhos/versões suportados, disponibilidade, limite de custo, tolerância de perda (RPO), prazo de recuperação (RTO) e operação do piloto. | T14–T15 |
| D10 | Periodicidade, elegibilidade, corte/fuso, regeneração e compartilhamento opcional da retrospectiva. | E04; não bloqueia o MVP |

Registrar decisões de produto em `requisitos.md`/`design.md` e decisões técnicas em `arquitetura.md`; comandos e evidências operacionais em `docs/onboarding.md`, `docs/setup.md` e `docs/quality.md`. O roadmap referencia essas fontes e não cria um contrato concorrente.

## 5. Pacotes de trabalho e verificação

Os caminhos abaixo são alvos propostos, relativos à raiz, e incluem testes do pacote. Cada tarefa tem um responsável pela escrita. Mudanças adicionais em configuração, dependências, esquema ou documentação canônica passam pelo orquestrador e são serializadas.

**Recursos padrão:** T04–T14 usam exclusivamente banco de teste `meumimo_tXX`, prefixo privado de arquivos `test/tXX/`, quando necessário, porta local `4310` e saída `web/.next/`, em série. Se o provedor exigir outro mecanismo, alocar projeto/schema/bucket de teste equivalente antes do despacho. Não usar produção, credenciais reais de pessoas ou portas ocupadas por outro trabalho. Fixtures são fictícias. T00/T01 definem como criar e limpar somente esses recursos de teste.

### T00 · Fechar contratos e preparar o primeiro marco

**Responsável:** orquestrador, com decisões do idealizador. **Depende de:** nenhuma.
**Arquivos:** `requisitos.md`, `arquitetura.md`, `design.md`, `docs/{setup,onboarding,quality}.md` e este roadmap. **Recursos:** leitura do checkout; sem serviços mutáveis.

- [x] Conferir estado do checkout e `npm run check`; separar implementado, confirmado e proposto.
- [x] Registrar D01–D09, ou a tarefa exata que permanece bloqueada; deixar D10 para evolução.
- [x] Detalhar T01–T03 com versões, arquivos, interfaces e comandos reais; revisar a matriz de cobertura da seção 7.
- [x] Verificar: fontes canônicas sem contradições, responsável por cada pendência e próximo pacote liberado com aceite verificável.

### T01 · Fundação executável e gates da nova aplicação

**Responsável:** fundação/integração. **Depende de:** T00 e D01.
**Arquivos:** `web/package*.json`, `web/{next.config.*,tsconfig.json,eslint.config.*,*.config.*,.env.example}`, `web/src/app/{layout.tsx,page.tsx}`, `web/tests/setup/**`, `package*.json`, `eslint.config.mjs`, `.gitignore`, `.github/workflows/quality.yml`, `docs/{setup,onboarding,quality}.md`, `README.md`. **Recursos:** instalação npm serial, porta `4301`, `web/.next/`; sem dados reais. A lista de configuração é refinada para os nomes concretos antes do despacho.

- [x] Criar somente a aplicação e ferramentas necessárias à stack confirmada, mantendo prévia e comandos atuais acessíveis.
- [x] Acrescentar scripts reais de lint/checagem de tipos/build e testes da aplicação; adaptar o gate às fronteiras servidor/navegador e a TS/TSX, preservando as três regras locais e limite de 350 linhas por arquivo de código.
- [x] Preparar o executor e as fixtures da fundação para os pacotes seguintes; manter T02/T03 em série. Banco/identidade de T02 seguem como dependência explícita ainda não provisionada.
- [x] Verificar instalação reproduzível, página inicial utilizável, build e tipos da aplicação, lint sem warnings e os sete testes atuais. Documentar os comandos adicionados e refletir a instalação de `web/` no CI.

### T02 · Conta, esquema inicial e autorização por recurso

**Responsável:** backend/dados. **Depende de:** T01, D01–D02, limites de autenticação D04, ambiente local comprovado e contratos de domínio necessários ao esquema.
**Arquivos:** `web/prisma/**`, `web/prisma.config.*`, `web/supabase/config.toml`, `web/src/server/{db,auth,authorization,audit}/**`, `web/src/app/api/auth/**`, `web/tests/integration/{auth,authorization,migrations}/**`. **Recursos:** banco `meumimo_t02`, porta `4302`, saída `web/.next/` em série; backend de identidade de teste isolado, a configurar e comprovar em T02.

- [ ] Modelar inicialmente identidade, loja, participação e permissão administrativa necessárias à autorização, conforme arquitetura §4. Entidades de domínio entram por migrações nas tarefas responsáveis; retrospectiva não é necessária agora. Evoluções do esquema continuam com um escritor por vez.
- [ ] Preparar a base histórica desde o MVP: identificadores estáveis, snapshots, origens e compensações; instantes em UTC e datas distintas de atividade, envio, aprovação, crédito, resgate, realização e estorno, apresentadas no fuso da loja.
- [ ] Implementar conta, sessão, recuperação e autorização reutilizável; contratos incluem conta, loja, participação, papel e estado. Negar administração por cadastro público.
- [ ] Verificar migração em banco vazio e evolução com dados fictícios; não recriar schemas internos de Auth/Storage. Conferir conexão/pooling e permissões efetivas do Prisma, Data API, Storage e Realtime quando aplicáveis.
- [ ] Testar chamadas diretas com usuário errado, outra loja, outro participante, sessão expirada e usuário comum tentando administrar. Validar recuperação/retorno de login sem redirecionamento indevido.

### T03 · Identidade visual e componentes acessíveis

**Responsável:** interface. **Depende de:** T01 e contrato visual existente.
**Arquivos:** `web/src/components/ui/**`, `web/src/styles/**`, `web/src/app/visual-check/**`, `web/public/assets/**`, `web/tests/e2e/ui-foundation.spec.ts`. **Recursos:** porta `4303`, saída `web/.next/` em série, dados estáticos; nenhum banco/bucket.

- [x] Reaproveitar assets/atribuições, tokens semânticos, DM Sans/DM Serif com alternativas, botões, formulários, estados e painéis com fechamento e foco corretos.
- [x] Validar três composições: Lojinha, detalhe de mimo e resumo do lojista; separar pontos disponíveis de pendentes.
- [x] Verificar 320 px, toque ≥44 × 44 px, texto a 200%, contraste, teclado, retorno/contenção de foco e movimento reduzido. A página de conferência usa somente conteúdo fictício.
- [ ] Conferir leitura com leitor de tela real; rótulos e ordem ARIA foram verificados no Chromium. Evidências e limites no plano da fundação §9.

### T04 · Lojas, participantes, convites e navegação contextual

**Responsável:** fluxo de conta/loja. **Depende de:** T02, T03 e D03–D04 aplicáveis.
**Arquivos:** `web/src/server/{stores,memberships,invitations}/**`, `web/src/app/{conta,convites,lojas}/**`, `web/src/components/{navigation,stores}/**`, `web/tests/{integration,e2e}/stores/**`, `web/prisma/**` se necessário. **Recursos:** padrão T04; identidades de teste.

- [x] Entregar base C01–C03/C05, L01/L09–L11 e navegação por papel; múltiplas lojas com busca/paginação. Mídia em T06 e conteúdo completo da lojinha em T12.
- [x] Aceitar convite preservando destino; tratar inválido, expirado, revogado, aceito, próprio lojista e participante já vinculado sem duplicação.
- [x] Aplicar pausa/encerramento desde os serviços e preservar consulta. T07–T10 integram análise/tickets reais; o marcador bloqueia encerramento até essa integração. Isolar estado de conta/loja.
- [x] Provar por HTTP conta com loja própria e duas participações e privacidade entre participantes. Conferir logout/troca de conta na UI controlada.
- [ ] Conferir convite aberto via mensageiro em Android/iPhone reais no aceite móvel T14. Em T04, provado retorno HTTP após cadastro/confirmação/login, sem aceite automático.

Implementação e evidências no [plano T04](2026-10-22-t04-lojas.md);
preparação em [lojas locais](../../stores-local.md). Nenhum serviço publicado.

### T05 · Conversas e notificações persistidas

**Responsável:** backend de relação. **Depende de:** T04.
**Arquivos:** `web/src/server/{conversations,notifications,outbox}/**`, `web/src/components/conversation/**`, `web/tests/integration/{conversations,notifications}/**`, `web/prisma/**`. **Recursos:** padrão T05; entrega local no PostgreSQL. Convite aceito é produtor real de T04; testes usam somente dados fictícios.

- [x] Definir comentários por registro/ticket e audiência participante–lojista; registrador interno preparado para T07/T09 e componente reutilizável com prévia explicitamente fictícia. Não há criação pública de assunto ou chat coletivo.
- [x] Persistir evento/outbox na transação de aceite ou comentário; entrega repetida/concorrente não duplica aviso. Consulta persistida recupera entrega atrasada; Realtime continua opcional.
- [x] Verificar autorização, deduplicação, falha após inserir aviso e antes de confirmar, retry e leitura/destino atuais. Nenhuma mensagem externa enviada.

Desenho/limite500 confirmados pelo idealizador. Evidências no
[plano T05](2026-10-22-t05-relacao.md) e operação em [T05 local](../../relation-local.md).
T07–T10 ligam conversas aos recursos reais e definem fechamento da escrita;
T12 entrega central completa, preferências e agrupamento. Operação publicada é T14.

### T06 · Mídia privada e prova de fotos/vídeos

**Responsável:** backend de mídia. **Depende de:** T05, D07–D08.
**Arquivos:** `web/src/server/media/**`, `web/src/components/media/**`, `web/tests/integration/media/**`, `web/tests/fixtures/media/**`, `web/prisma/**`; políticas de aplicação na cadeia de migrações. **Recursos:** padrão T06 e processamento de mídia de teste conforme decisão; sem mídia pessoal.

- [x] Implementar autorização de upload/consulta, metadados, vínculos internos de propósito evidência/memória e estados por arquivo. Objetos ficam privados mesmo durante envio; origem real integra em T07/T09/T11.
- [x] Tratar orientação/localização nas imagens; validar formatos/tamanhos, miniaturas e transcodificação MP4/MOV com arquivos sintéticos. Consulta/Range reautoriza a sessão e a audiência atuais.
- [x] Provar upload interrompido/retomado, conflito/duplicação, formato inválido, URL expirada, revogação e acesso direto por outro participante. Câmera cancelada/galeria são estados simulados na composição, separados da prova HTTP.
- [x] Confirmar D08 e provar limpeza de órfãos/originais, temporários abandonados e retenção protegida. Marcação lógica precede expurgo idempotente; retomada/lease atual impedem limpar trabalho ativo. Origem integra proteção e encerramento em T07/T09/T11.
- [ ] Conferir câmera/galeria e reprodução em Android/iPhone reais da matriz D09. Chromium e vídeos sintéticos não comprovam aparelhos físicos.

Desenho/D07 e D08 aprovados; implementação local verificada.
Implementação e evidências em [plano T06](2026-10-22-t06-midia.md) e operação em
[T06 local](../../media-local.md). A prova de câmera/galeria e reprodução em
Android/iPhone reais permanece no aceite móvel D09/T14.

### T07 · Atividades e envio de conquistas com crédito consistente

**Responsável:** domínio de conquistas/pontos. **Depende de:** T06, D03–D04.
**Arquivos:** `web/src/server/{activities,submissions,points}/**`, `web/src/app/lojas/[storeId]/{atividades,registros}/**`, `web/src/components/activities/**`, `web/tests/{unit,integration,e2e}/activities/**`, `web/prisma/**`. **Recursos:** padrão T07.

- [ ] Entregar L03/L04 e P02–P04: cadastro/edição/arquivo, frequência única/diária/semanal, regra manual padrão ou automática, legenda e uma foto opcionais.
- [ ] Guardar pontuação/regra da ocasião; considerar data da atividade, envio e fuso da loja. Crédito automático, extrato e evento são consistentes; envio manual apenas cria pendência.
- [ ] Verificar limite por ocorrência, virada do dia/semana, aparelho em outro fuso, edição de regra após envio, toque duplo e tentativas simultâneas. Envio manual não aumenta saldo disponível; automático credita uma única vez.

### T08 · Análise, contestação, estorno e extrato

**Responsável:** domínio de conquistas/pontos. **Depende de:** T07 e D05.
**Arquivos:** `web/src/server/{submissions,points}/**`, `web/src/app/lojas/[storeId]/{registros,extrato}/**`, `web/src/components/{submissions,points}/**`, `web/tests/{integration,e2e}/points/**`, `web/prisma/**`. **Recursos:** padrão T08.

- [x] Entregar L05/P05 e extrato: aprovar, contestar com motivo/resposta/complemento, manter, anular e reabrir preservando eventos anteriores.
- [x] Diferenciar estado da análise e dos pontos. Contestar crédito existente não o remove; anulação/recomposição seguem D05, com compensação única e impacto claro antes de confirmar.
- [x] Entregar filtros/paginação por período/tipo e origem autorizada do movimento, disponíveis pelo potinho e pela navegação da loja. Ganhos, estornos e recomposições são separados; Meus mimos, débitos/devoluções e tickets serão integrados em T09/T10.
- [x] Verificar aprovações/anulações simultâneas e repetidas, aritmética de saldo negativo identificada, reabertura sem crédito duplicado, reconciliação do saldo com o extrato e histórico após renomear/arquivar atividade.

D05 e os limites foram confirmados antes da implementação. Prova local: 175 HTTP,
270 Chromium, migração com crédito T07 anterior preservado e revisão independente.
T08 não introduz débito fictício. A prova com gasto real e ticket preservado
está no plano T09. Comandos em [T08 local](../../points-local.md).

### T09 · Catálogo, resgate transacional e histórico de tickets

**Responsável:** domínio de mimos/pontos. **Depende de:** T08 e D06.
**Arquivos:** `web/src/server/{rewards,redemptions,points}/**`, `web/src/app/lojas/[storeId]/{mimos,tickets}/**`, `web/src/components/{rewards,tickets}/**`, `web/tests/{integration,e2e}/redemptions/**`, `web/prisma/**`. **Recursos:** padrão T09.

- [x] Entregar L06/L07 e P06–P09: catálogo editável, categorias, recadinho, custo e disponibilidade; confirmação com custo/saldo restante e mensagem de quanto falta.
- [x] Validar participação, loja, saldo e estoque; emitir ticket, débito, reserva e evento na mesma operação, com chave de repetição e estratégia de concorrência explícita.
- [x] Preservar nome/custo/instruções da ocasião e histórico paginado por período/estado; contador de navegação considera somente tickets a realizar.
- [x] Verificar dois resgates com saldo para um, disputa pelo último item entre participantes, resposta perdida após confirmação e edição/arquivamento posterior do mimo. Falha não deixa débito ou estoque reservado sem ticket.

D06 e limites confirmados antes de implementar. Provas locais: 211 HTTP
(36 novos +175 regressões), 382 Chromium (112 novos +270 regressões), check,
migração vazia/evolutiva com dez migrações e 26 tabelas RLS. Anulação após gasto
real preservou o ticket e produziu saldo negativo. Revisão independente encerrada;
comandos em [T09 local](../../rewards-local.md). Realização/cancelamento e álbuns
continuam nas etapas seguintes; aparelhos físicos e leitor de tela não observados.

### T10 · Combinado, realização e cancelamento

**Responsável:** domínio de tickets. **Depende de:** T09 e D06.
**Arquivos:** `web/src/server/{redemptions,points}/**`, `web/src/app/lojas/[storeId]/tickets/**`, `web/src/components/tickets/**`, `web/tests/{integration,e2e}/tickets/**`, `web/prisma/**`. **Recursos:** padrão T10.

- [x] Entregar L08/P09 com conversa e linha do tempo: aguardando combinar, combinado, realizado, cancelamento solicitado e cancelado/estornado.
- [x] Pedido em análise impede realização; recusa com motivo restaura estado anterior. Lojista pode iniciar cancelamento; estorno e eventual reposição de estoque obedecem ao contrato aprovado.
- [x] Verificar realizar duas vezes, cancelar duas vezes, realizar concorrendo com cancelamento, tickets em loja pausada/relação encerrada e devolução que não conta como conquista. Tickets não expiram no MVP e realização não debita de novo.

T10: `check`, doze migrações e 249 HTTP reais aprovados. Chromium executou os
454 cenários: 453 passaram na repetição final e um convite antigo falhou ao
carregar um chunk com `ERR_NO_BUFFER_SPACE`; passou isoladamente em 320/390.
Os 72 cenários novos passaram, com foco/200% e privacidade. Revisões independentes
encerradas após provas de regressão; contratos em [tickets locais](../../tickets-local.md).

### T11 · Álbum privado por ticket

**Responsável:** fluxo de momentos. **Depende de:** T10, T06 e D07–D08.
**Arquivos:** `web/src/server/albums/**`, `web/src/components/albums/**`, `web/src/app/lojas/[storeId]/tickets/**`, `web/tests/{integration,e2e}/albums/**`, `web/prisma/**`. **Recursos:** padrão T11 e pipeline de mídia de teste.

- [x] Lojista seleciona/revisa/envia/publica várias fotos e vídeos; legenda/ordem, progresso, falha/tentativa por arquivo, publicação explícita dos prontos e novos lotes posteriores.
- [x] Participante vê somente mídias publicadas no próprio ticket, com ampliação de fotos e player com controles, sem som automático. Remoção própria exige confirmação e respeita retenção.
- [x] Verificar três fotos e dois vídeos, falha em um vídeo, retomada e nova tentativa sem duplicação; uma novidade agrupada por publicação. Outro ticket do mesmo mimo tem álbum independente.
- [x] Confirmar que publicar/remover mídia ou adicionar depois da realização não muda pontos, estoque ou estado do ticket; acesso a arquivo/miniatura de outra participação é negado.

T11: treze migrações, `check` e 276 HTTP reais passaram. Foram executados 562
Chromium em grupos: 561 passaram e um histórico antigo sofreu suspensão de rede
no ambiente; repetição focal passou em 320/390. Os 108 novos passaram, assim como
a regressão StrictMode no Next dev. Revisões encerradas após reprodução/correção;
capturas a 200% examinadas. Contratos em [álbum local](../../albums-local.md).

### T12 · Relação, novidades e telas iniciais completas

**Responsável:** fluxo de relação. **Depende de:** T11 e T05.
**Arquivos:** `web/src/server/{notes,reactions,notifications,dashboards}/**`, `web/src/components/{notes,reactions,feed,notifications,dashboards}/**`, `web/src/app/{notificacoes,lojas/[storeId]/pessoas,lojas/[storeId]/mural,lojas/[storeId]/resumo}/**`, `web/src/app/lojas/[storeId]/page.tsx`, `web/tests/{integration,e2e}/relationship/**`, `web/prisma/**`. **Recursos:** padrão T12.

- [x] Entregar bilhete individual editável com versões/leitura entre dispositivos, coração e cartão; sem confirmação de leitura ao lojista. Recadinho do catálogo permanece distinto do bilhete privado.
- [x] Completar reações/comentários e mural privado sobre registros/tickets, conforme design §15; reações não aprovam atividade nem realizam ticket.
- [x] Entregar C04 e preferências: loja/autor/evento/leitura/destino, agrupamento de interações e autorização atual ao abrir outra loja. Uso não depende de push.
- [x] Integrar L02 com checklist inicial, registros pendentes, mimos a realizar, participantes, acontecimentos recentes e atalhos, usando consultas autorizadas. Montar P01 completa com saudação, saldo/pendências, atividades, vitrine e bilhete da participação; substituir as composições fictícias de T03 por dados reais.
- [x] Verificar loja vazia e em uso, contadores após aprovação/resgate/realização e troca de loja/papel. O resumo agrega somente a loja gerenciada; a Lojinha não revela saldos, bilhetes ou acontecimentos de outros participantes.
- [x] Verificar abrir versão antiga durante envio de nova, troca de conta, item de outra loja, acesso revogado e interrupção das consultas seguida de recuperação autorizada. Nenhum participante acessa bilhete/mural alheio.

T12: quatorze migrações, checks e revisão independente verificados. Foram
cobertos 319 casos HTTP reais e 672 cenários Chromium, com correções e repetições
focais registradas no [plano T12](2026-10-22-t12-relacao-paineis.md).
Consulta visível de trinta segundos; sem alegação de Realtime ou prova física.

### T13 · Administração mínima e diagnóstico

**Responsável:** operação da plataforma. **Depende de:** T12 e D02/D09 aplicáveis.
**Arquivos:** `web/src/server/admin/**`, `web/src/app/admin/**`, `web/tests/{integration,e2e}/admin/**`, `web/src/server/audit/**`, `web/prisma/**`. **Recursos:** padrão T13; conta administrativa fictícia provisionada pelo procedimento aprovado.

- [x] Entregar A01–A04: contagens, busca/listas de contas e lojas, detalhe de metadados e pausa/reativação com motivo, alcance e auditoria.
- [x] Verificar ausência de promoção por autocadastro, tentativa de administrar como usuário comum e ações auditadas; administrador não ganha acesso cotidiano a fotos, pontos, análises ou tickets privados.
- [x] Conferir logs úteis para falhas/decisões, sem tokens, arquivos ou conteúdo de conversas; distinguir suspensão operacional de bloqueio de segurança conforme contrato.

T13: quinze migrações, checks, revisão independente e 356 casos HTTP distintos
cobertos por execução completa e repetição focal. A regressão Chromium passou
com 736 cenários, sem skips. Ocorrências e limites no
[plano T13](2026-10-22-t13-administracao.md). Publicação permanece adiada.

### T14 · Aceite integrado e recuperação antes do piloto

**Responsável:** orquestrador/QA, com revisões independentes de segurança e UI somente leitura. **Depende de:** T13 e D08–D09.
**Arquivos:** `web/tests/e2e/pilot/**`, `docs/{quality,onboarding,setup}.md`, `docs/pilot/**`, configurações de CI afetadas. **Recursos:** padrão T14; cópia descartável de banco/arquivos para restauração; Android/iPhone da matriz. Relatórios sensíveis ficam fora do Git.

- [ ] Executar o ciclo completo com lojista, dois participantes e conta que alterna papéis/lojas; cobrir todos os cenários P0 da seção 5 de requisitos.
- [ ] Revisar caminhos efetivos de Prisma, Data API, Storage e Realtime; repetir operações concorrentes, timeout após confirmação, sessões expiradas e isolamento de caches.
- [ ] Conferir tarefas dos três papéis no celular: 320 px sem rolagem horizontal, toque ≥44 px, texto 200%, teclado/foco/leitor de tela, estados vazios/erro, movimento reduzido, áreas seguras, câmera/galeria, autenticação e convite via mensageiro.
- [ ] Medir desempenho em laboratório com mídia representativa e preparar medição móvel real: metas de p75 LCP ≤2,5 s, INP ≤200 ms e CLS ≤0,1. Laboratório não comprova percentil de tráfego real.
- [ ] Restaurar banco e arquivos em ambiente separado; verificar RPO/RTO, permissões, compatibilidade de migrações com dados existentes e recuperação de publicação com falha.
- [ ] Executar os checks documentados, resolver achados confirmados e registrar evidências/limitações. Aprovar o marco somente com os P0 cobertos; ausência de dispositivo ou serviço de teste fica como pendência explícita.

### T15 · Publicação e piloto controlado

Recorte posterior confirmado: primeiro entregar a operação web persistente local,
com supervisor, saúde, manutenção e comandos em [T14–T15 local](2026-10-22-t14-t15-local.md).
Os itens publicados abaixo conservam suas dependências e permanecem adiados.

**Responsável:** orquestrador/operação. **Depende de:** T14 e autorização de publicação, serviços/custo e migrações reais.
**Arquivos:** configuração do provedor escolhido, `docs/pilot/**`, `docs/{setup,onboarding,quality}.md`. **Recursos:** ambientes nomeados e autorizados, secrets no serviço apropriado; ações serializadas.

- [ ] Preparar versão revisável, variáveis por ambiente, migrações revisadas, backup/recuperação e checklist operacional concreto antes da autorização final de publicação.
- [ ] Com a autorização correspondente, aplicar o procedimento aprovado, verificar saúde e executar o ciclo com contas de piloto autorizadas, sem importar estado da demonstração.
- [ ] Acompanhar falhas, entregas pendentes e metas com o volume disponível; registrar limitações de amostra. Priorizar correções e evolução com evidência de uso.

## 6. Orquestração por ondas

Referência aplicada: [planejamento, prompt 04](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/prompts/04-brainstorm-to-plan.md), [ondas paralelas, prompt 05](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/prompts/05-parallel-wave-dispatch.md) e [guia de orquestração](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/tools/02-subagent-orchestration.md), na revisão já adotada pelo projeto. Planejamento e revisão foram feitos com recursos nativos, preservando modelo e permissões da sessão.

| Onda | Tarefas e responsáveis | Regra de integração |
| --- | --- | --- |
| 0 | T00 · orquestrador | Consolidar decisões e contratos |
| 1 | T01 · fundação | Um escritor para dependências/configuração/CI |
| 2 | T02 · backend/dados; T03 · interface | Em série no mesmo checkout; T03 pode preceder T02 se identidade/serviços ainda estiverem pendentes |
| 3 | T04 · conta/loja | Integrar identidade, contexto e navegação |
| 4 | T05 · relação | Definir conversa e eventos que o domínio consumirá |
| 5 | T06 · mídia | Provar privacidade e pipeline antes de usar arquivos nos registros |
| 6 | T07 · conquistas/pontos | Cadastro, envio e crédito automático |
| 7 | T08 · conquistas/pontos | Análise, compensação e extrato |
| 8 | T09 · mimos/pontos | Resgate usa o contrato estável da carteira |
| 9 | T10 · tickets | Fechar realização/cancelamento antes do álbum |
| 10 | T11 · momentos | Integrar mídia, ticket e notificação agrupada |
| 11 | T12 · relação | Completar bilhete, mural, central, Lojinha e resumo do lojista |
| 12 | T13 · operação | Administração mínima |
| 13 | T14 · integração/QA | Revisões somente leitura podem ocorrer em paralelo; checks com recursos compartilhados ficam em série |
| 14 | T15 · operação | Somente após autorização correspondente |

O backend de T02 não consome componentes de T03; a interface de T03 usa fixtures e não consome seus serviços. Ambos dependem dos contratos/configuração de T01 e são serializados neste checkout, inclusive builds e geração de tipos. Paralelismo futuro exige checkouts completos e recursos isolados comprovados; portas e `distDir` distintos não bastam. Alteração de arquivo compartilhado nunca é exceção para manter uma onda paralela.

Para cada despacho: informar objetivo, fontes, arquivos permitidos, dependências, recursos concretos, aceite e comandos. Se arquivos/recursos/dependências ainda forem incertos, considerar dependência de tudo que já foi listado e serializar até esclarecer.

Implementadores verificam e relatam arquivos/contratos alterados; não fazem commits. O orquestrador confere integração e somente ele opera Git quando autorizado. Sem commits, revisar arquivos atuais e snapshots registrados; não inventar `HEAD` ou base de PR. Revisores não editam, não aplicam correções automáticas e não criam novos revisores. Só avançar depois de verificar a onda e tratar os achados confirmados.

## 7. Rastreabilidade e foco de revisão

| Requisitos funcionais | Pacotes responsáveis |
| --- | --- |
| RF-01, RF-02 | T02, T04, T13 |
| RF-03, RF-04, RF-19 | T04, T10, T14 |
| RF-05, RF-06, RF-08, RF-17 | T06–T08 |
| RF-07, RF-09 | T05, T08 |
| RF-10, RF-11, RF-23 | T09–T10 |
| RF-12 | T10 |
| RF-13 | T05, T10, T12 |
| RF-14, RF-15 | T05, T12 |
| RF-16 | T03–T04, T07–T09, T12 |
| RF-18 | T02 e todos os serviços privados; validação integrada T14 |
| RF-20 | T13 |
| RF-25, RF-26 | T06, T11–T12 |
| RF-21, RF-22, RF-24 · P1 | E01, E02, E04 |

| Requisitos não funcionais | Pacotes responsáveis |
| --- | --- |
| RNF-01, RNF-07, RNF-09 | T03, cada fluxo com UI, T14 |
| RNF-02, RNF-10 | T02, T04, T06, T12–T14 |
| RNF-03, RNF-04 | T02, T05, T07–T11 |
| RNF-05, RNF-20, RNF-21 | T06, T11, T14 |
| RNF-06 | T04, T06–T12, T14 |
| RNF-08 | T03, T06, T14–T15 |
| RNF-11 | T02 e tarefas de domínio, T13–T14 |
| RNF-12, RNF-13 | T00–T02, T14–T15 |
| RNF-14, RNF-16 | T00/D04/D07/D08, T04–T12, T14 |
| RNF-18, RNF-19 | T02, T07–T11, T14 |
| RNF-15, RNF-17 · P1 | E01, E03 |

Cinco situações prioritárias para revisão independente; os testes pertencem aos pacotes indicados:

1. Sessão válida tentando abrir arquivo, registro ou ticket de outra relação: negar também o acesso direto, miniatura e canal de atualização (T02/T06/T11/T14).
2. Resposta perdida depois de crédito/resgate/cancelamento confirmado: recuperar resultado com a mesma identificação sem repetir efeitos (T07–T10).
3. Virada do período, alteração de regra e anulação após gasto: preservar ocorrência, regra histórica e saldo reconciliável conforme contrato (T07–T08).
4. Publicação parcial e retomada de vídeo após perda de acesso: preservar itens prontos, revalidar autorização e não duplicar mídia/aviso (T06/T11).
5. Nova versão de bilhete chegando enquanto a anterior é aberta, seguida de troca de conta: manter leitura por versão e impedir conteúdo residual (T04/T12).

## 8. Evolução após o piloto

| ID | Entrega proposta | Dependências e aceite |
| --- | --- | --- |
| E01 | PWA e push opcionais | T15; definir cache/atualização/descarte por conta e loja, pedir permissão no contexto, respeitar preferências e abrir destino autorizado. Navegador continua funcional sem instalação ou push. |
| E02 | Meta de mimo | T15; escolha por participação com progresso de saldo daquela loja, sem impedir resgate de outros mimos. |
| E03 | Métricas de produto | T15 e política de coleta; medir criação de loja, aceite, primeiro registro/aprovação/resgate/realização sem coletar textos, fotos ou vídeos. Distinguir das medições de desempenho P0. |
| E04 | Retrospectiva mobile | T15, D10 e base histórica já capturada; métricas por participação, período, fuso, corte e versão, com cancelamentos/compensações corretos. Reembolso não vira conquista; resgate não implica realização. Seleção e prévia explícitas antes de compartilhar mídia/bilhetes. |

Planos/cobrança, colaboradores, transferência, múltiplas fotos por registro de atividade, suporte privado completo, exclusão de conta com automação completa, temas e recursos nativos exigem priorização própria. Não criar sistemas genéricos de analytics ou eventos para antecipar essas possibilidades.

## 9. Evidências deste planejamento e próximo passo

- Leitura das fontes canônicas e conferência dos scripts, regras, workflow, modelo e sete testes do protótipo.
- Duas análises independentes somente leitura: cobertura de produto/design e dependências/riscos técnicos. A revisão final de consistência identificou a falta de responsável pela integração real de L02; T12 passou a incluir o resumo do lojista e a Lojinha completa, com arquivos e critérios de contexto.
- `npm run check` executado em 22/10/2026: três regras locais verificadas, lint sem erros/warnings e 7/7 testes aprovados. Isso verifica a base atual; não comprova os serviços futuros.
- Skill local do Vibe Coding Toolkit descoberta no cliente e consultada, com os fluxos de planejamento/orquestração; skills locais de planejamento, brainstorming, revisão e verificação usadas de forma proporcional ao pedido documental.
- Na elaboração inicial do roadmap, versões e provedores ainda não estavam escolhidos. M0 confirmou D01, selecionou versões e executou consultas reais ao Context7 e às fontes oficiais, registradas no plano da fundação. Isso atualiza a descoberta inicial sem alegar instalação ou integração já concluída.

O estado atual está no início deste documento e nos planos de execução de cada
entrega. T14 foi verificada localmente; T15 local é a próxima implementação após seu
fechamento. D06 e os desenhos locais até T15 foram confirmados. Os limites
e gates restantes mantêm suas dependências em
requisitos §6.1. A aprovação do roadmap não autoriza publicação, cobrança ou
migração em ambiente real.
