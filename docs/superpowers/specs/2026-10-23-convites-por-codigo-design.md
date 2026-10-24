# Convites por código — desenho aprovado

**Data:** 23/10/2026. **Estado:** desenho aprovado pelo idealizador com o
**Visor segmentado**. A execução de todas as fases locais foi autorizada em
seguida, depois da preparação do plano; publicação continua fora do escopo.
**Base:** convites de T04 e cadeia atual de migrações, incluindo ilustrações
compartilhadas. As alterações locais de mimos/tickets estão fora deste escopo.

## Intenção e decisões da conversa

Permitir que o lojista gere um código curto, compartilhe com alguém e controle
até quando e por quantas pessoas ele pode ser usado. A pessoa informa o código
na busca e confirma que deseja participar da lojinha identificada.

Confirmado pelo idealizador nesta conversa:

- O sistema gera o código curto; o lojista não escolhe seu texto.
- Cada convite tem seu código. Uma lojinha pode ter vários convites independentes.
- O lojista define data limite e quantidade máxima de usos, com opção de usos
  ilimitados.
- A pessoa vê uma confirmação antes de entrar na lojinha.
- A apresentação deve lembrar um autenticador, como Steam Guard; sugestões
  visuais são bem-vindas.

As regras detalhadas abaixo foram aprovadas junto com este desenho. O
[plano executável](../plans/2026-10-23-convites-por-codigo.md) detalha as
decisões técnicas e a execução. Aprovação não significa recurso já implementado.

## Situação atual comprovada por leitura

`web/src/server/invitations/service.ts` gera links revogáveis com sete dias e um
único aceite. O token é HMAC, o banco guarda seu hash e `operationId` permite
recuperar a mesma URL após falha de conexão. A participação é única por conta e
loja. Aceite, auditoria e outbox são transacionais, com bloqueio da loja.

`Invitation` guarda um único aceitante e a notificação usa a chave
`invitation.accepted:<invitationId>`. Reutilizar o convite requer separar os
usos; apenas acrescentar um contador perderia o histórico e os eventos seguintes.

`stores-hub.tsx` pesquisa nomes apenas nas participações autorizadas da conta.
A nova resolução por código será exata e não criará um diretório público.
Pausa da loja/plataforma, encerramento, suspensão e retirada de acesso já têm
contratos que devem ser preservados.

As regras anteriores estão em D03 de `requisitos.md` e em `design.md` §16.2.
A aprovação deste desenho autoriza preparar sua evolução documental; não
transforma a proposta em comportamento já implementado.

## Abordagens consideradas

| Abordagem | Benefício | Custo/limite | Resultado |
| --- | --- | --- | --- |
| Um código por convite | Prazos, cotas e revogação independentes; atende convite individual e de grupo | Requer histórico de usos por convite | Escolhida pelo idealizador |
| Um código vigente por loja | Gestão mais simples | Trocar/revogar afeta todos os destinatários; uma política por vez | Não escolhida |

Dentro da abordagem escolhida, recomenda-se evoluir `Invitation`, mantendo o
link como outra forma de abrir o mesmo convite. Um sistema paralelo de códigos
duplicaria regras de autorização, pausa, aceite e notificação.

## Fluxo e linguagem

### Quem gerencia

Em **Convites**, escolher validade e usos e tocar em **Gerar convite**.
Padrão proposto: **sete dias e uma nova participação**, preservando o padrão
restritivo atual. Validade oferece data/hora personalizada e **Sem vencimento**;
usos oferece inteiro de 1 a 1.000.000 ou **Ilimitados**. São escolhas independentes.
Um convite pode vencer amanhã e aceitar ilimitadas pessoas até lá.

A data usa o fuso da loja, exibido junto do campo. O servidor recebe um instante
inequívoco com offset, armazena UTC e rejeita passado e horário civil inexistente
ou ambíguo sem resolução explícita. A expiração ocorre em `agora >= expiresAt`,
usando o relógio do banco no aceite. Alterar o fuso de exibição não desloca o
instante já gravado. O formulário deve permitir conferir a data antes de gerar.

Após gerar, exibir código grande, copiar código, copiar/compartilhar link,
validade, usos realizados e limite. Na listagem, apresentar metadados e ação
autorizada para revelar/copiar novamente a credencial. Código permanece estável.
Nesta etapa, prazo e cota são imutáveis: revogar e gerar outro substitui uma
política. Revogar após usos bloqueia entradas futuras e preserva quem já entrou.

### Quem recebe

1. Em **Minhas lojas**, digitar ou colar o código em **Buscar loja ou código** e
   enviar com Enter ou **Buscar**. A consulta não ocorre a cada tecla.
2. Encontrando o convite, abrir confirmação com nome/apresentação autorizados
   da loja, remetente e conta conectada: **Quer fazer parte desta lojinha?**
3. Oferecer **Agora não** e **Participar da lojinha**. Recusar não consome uso.
4. O servidor revalida tudo e cria a participação. Sucesso abre a loja correta,
   atualiza a central/seletor e começa com saldo zero, conforme o domínio atual.

O código nunca confirma entrada automaticamente. A confirmação da pessoa é o
aceite; não se acrescenta uma fila de aprovação posterior pelo lojista.
Pessoa já participante recebe **Abrir lojinha**; proprietário recebe
**Gerenciar lojinha**, preservando papel e vínculo existentes sem consumo.

A central continua autenticada. O link compartilhado pode abrir a apresentação
mínima já permitida antes do login; cadastro/login preserva o destino e exige
confirmação posterior. A nova busca por código exige conta autenticada.

Uma consulta que também possa ser nome mantém os resultados autorizados da
busca atual. Reconhecer o formato do código não exclui a pesquisa por nome.
Sem código correspondente, a busca por nome continua funcionando. Sem qualquer
resultado, orientar a conferir o nome/código, sem sugerir outras lojas privadas.
Filtro de papel/estado da lista não bloqueia a resolução de um convite válido.

### Aparência de autenticador

Proposta visual: cartão de convite com tipografia monoespaçada grande,
caracteres agrupados, espaço generoso e rótulo **Código de convite**.
Usar a paleta de papelaria do Meu Mimo e contraste/foco dos componentes atuais.
Foi escolhido o **Visor segmentado**, com dez casas visuais, organizadas em
dois grupos de cinco. O Cartão de acesso permaneceu somente como alternativa
explorada na prévia.

Nos dois casos, a entrada é um único campo acessível: aceita colar o código
inteiro, seleção, Backspace, leitor de tela e letras/números. Não criar dez
inputs nem usar `type=number`. A barra de busca continua sendo uma busca.
O aspecto segmentado pode aparecer na confirmação e no cartão de gestão.

O código permanece estável até revogar/vencer/esgotar. A interface não apresenta
rotação periódica, anel de 30 segundos nem instrução de autenticação em dois
fatores. Prazo aparece por data/hora; usos por texto. A prévia é fictícia e não
executa autenticação, busca real ou criação de participação.

Modal reaproveita `ui/dialog.tsx`: foco inicial no título/ação segura, Tab e
Shift+Tab contidos, Escape, fechar e retorno ao campo de busca. Resposta tardia
não abre o convite de uma busca anterior; trocar conta ou perder sessão limpa
o conteúdo privado. Em conexão incerta, consultar a participação existente
antes de oferecer nova tentativa. Testar 320/390 px, desktop, texto 200% e
movimento reduzido; não adicionar animação obrigatória.

## Regras de uso e disponibilidade

| Situação | Comportamento recomendado |
| --- | --- |
| Primeiro aceite válido de nova pessoa | Uma participação, um uso e um evento de notificação |
| Buscar, abrir prévia ou cancelar | Zero usos |
| Novo login/abertura de quem já participa | Zero usos; abrir o vínculo existente |
| Mesma pessoa repete ou usa dois códigos | Um vínculo e apenas o primeiro ingresso consome uso |
| Convite com cota esgotada | Bloquear novos ingressos; informar esgotamento |
| Convite vencido ou revogado | Bloquear novos ingressos, preservando participantes atuais |
| Loja pausada pelo lojista/plataforma | Impedir geração/novos ingressos; preservar consulta e revogação |
| Loja encerrada | Impedir novos ingressos; manter histórico autorizado |
| Participação encerrada ou acesso retirado | Convite não reativa nem contorna a restrição |
| Conta suspensa/suprimida ou sessão revogada | Negar a ação e descartar conteúdo privado |
| Vence/esgota/revoga enquanto a confirmação está aberta | Revalidar no aceite e explicar a indisponibilidade |

Ilimitado refere-se a novas participações, não ao número de logins ou à
expiração. Sair da tela, encerrar participação ou retirar acesso não devolve
usos já consumidos. Revogar convite não expulsa participantes.

Prévia expõe somente o que já é permitido: loja, apresentação, remetente e
estado necessário. Não expõe lista de participantes, saldos, registros,
bilhetes, tickets, e-mail alheio ou quantidade de usos a quem recebe.
Contagem detalhada é exclusiva da gestão do lojista.

## Limites dos módulos propostos

Manter Next.js 16.4.2, React 19.3.1, TypeScript, Prisma 7.10.1, PostgreSQL e
Supabase Auth existentes. Nenhum serviço ou pacote novo é necessário.

| Módulo | Responsabilidade | Arquivos principais |
| --- | --- | --- |
| Contratos e política | Configuração, estados, normalização temporal e DTOs explícitos | `web/src/contracts/invitations.ts` novo; compatibilidade em `contracts/stores.ts`; `server/invitations/{validation,policy}.ts` novos |
| Credenciais | Gerar/normalizar código, digest, colisões e recuperação autorizada | `server/invitations/code.ts` novo; preservar `token.ts` |
| Gestão de convites | Criar/listar/revelar/revogar com autorização e repetição segura | `server/invitations/management.ts` novo; rotas atuais de loja |
| Resolução e aceite | Prévia mínima e ingresso transacional comum a código/link | `server/invitations/{resolve,acceptance}.ts` novos; adaptar `preview.ts` e fachada `service.ts` |
| Persistência e eventos | Política, usos, consistência, auditoria, outbox por ingresso | `web/prisma/schema.prisma`; migração nova; `server/outbox/events.ts`; integração de notificações |
| Interface | Formulário, cartão, busca, confirmação e estados de falha | `components/stores/store-invitations.tsx`, `stores-hub.tsx`, `invitation-screen.tsx`; novos componentes focados no convite |
| Direitos e verificação | Exportação por audiência, migração, fixtures e regressões | `scripts/pilot/rights-export-data.mjs`; `scripts/check-migrations.mjs`; testes de stores/notificações/pilot |

O plano detalhado deve confirmar os caminhos finais sem reorganizar áreas não
relacionadas. `service.ts` pode manter exports compatíveis para os chamadores
existentes. Contratos são a fronteira; cliente não importa código de servidor.

## Persistência, credenciais e concorrência

### Convite e usos

Evoluir `Invitation` com uma versão/modalidade que distingue link legado e novo
convite por código; política com `expiresAt` anulável, `maxUses` anulável e
`useCount`, digest do pedido de criação e metadados de geração do código.
`null` representa ausência de limite; zero não representa ilimitado.

Adicionar `InvitationUse`, com identificador, convite, loja, perfil,
participação e instante. Usos são imutáveis. Restrições devem garantir que
convite e participação pertencem à mesma loja, que a participação corresponde
ao perfil, e que a mesma participação não gera dois ingressos. Contador e
registros são atualizados juntos, com `useCount >= 0` e, se finito,
`useCount <= maxUses`. Runtime não pode fabricar uso sem o vínculo correto.

Adicionar referência opcional de uso em outbox, com evento único por uso novo.
Preservar eventos/chaves antigos e revalidar audiência/destino do lojista.
O segundo participante do mesmo código deve produzir seu próprio aviso.

### Formato e recuperação

Proposta técnica: dez símbolos de alfabeto com 32 caracteres
`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, exibidos como `7KQ9M-4TX2P`.
São 50 bits de espaço; a proteção depende também de limites de tentativa.
Aceitar minúsculas, espaços externos, um hífen de agrupamento ou o formato
compacto. Não aceitar consulta por prefixo, aproximação nem substituição de
caracteres inválidos. A lista geral guarda/devolve somente metadados.

Usar HMAC com separação de domínio para geração e digest de consulta, sem
guardar código bruto. A geração recuperável parte do identificador da operação
e contexto do convite; um discriminador persistido resolve colisões. Índice
único global e novas tentativas limitadas tratam colisões, sem trocar o código
de um convite já criado. O plano deve especificar o algoritmo e o limite exato.
Repetir `operationId` com configuração diferente devolve conflito.

Reutilizar a custódia do segredo de convites existente, derivando domínios
distintos para geração/consulta. Não rotacionar o segredo como parte desta
entrega. O runbook deve registrar que uma rotação futura exige preservar chaves
anteriores ou revogar explicitamente convites afetados, inclusive links atuais.
Não incluir códigos/tokens/digests em auditoria, eventos, diagnósticos ou exportação.

### Resolução e transação

Busca autenticada proposta: `POST /api/lojas/buscar`, corpo com `q`, papel,
estado e paginação. Um serviço de composição reaproveita a pesquisa de nomes
autorizados e, se o formato corresponder, a resolução exata do código. Retorna
`stores` paginado e `invitation` com a prévia mínima ou `null`, sem mutar o
convite. Assim, um nome que coincida com o formato não perde seus resultados.
O GET atual de lojas continua compatível; o formulário passa a usar o POST.
`POST /api/convites/aceitar-codigo` recebe `{ code }` e usa o serviço comum de
aceite. Rotas de link continuam válidas. Não enviar o código por query string
nem guardar o conteúdo em `localStorage`. O serviço de composição não decide
política ou permissões: essas continuam nos módulos de lojas e convites.

Limite específico proposto: dez resoluções por minuto por conta, com espera
explícita via 429/`Retry-After`, além dos limites atuais do domínio. Aceites por
código compartilham esse orçamento para impedir contorno pela rota de mutação.
Requisições inválidas também contam. Aceite continua sujeito ao limite atual
de 30 mutações/minuto/conta. Nenhum cabeçalho de IP arbitrário é confiável.
Limite agregado de entrada deve ser tratado antes de exposição pública; o
escopo atual continua local em loopback. Não publicar esta evolução por efeito
colateral. A rota pública legada mantém sua fronteira e não ganha códigos curtos.

No aceite, reutilizar a ordem perfil/sessão → loja → vínculo/convite. Dentro da
transação, conferir identidade, acesso, vínculo existente, pausas, encerramento,
revogação, relógio do banco e cota. Criar participação, uso, contador, auditoria
e evento na mesma transação. Falha em qualquer efeito faz rollback de todos.
Nenhuma chamada externa ocorre dentro dela. Revogar disputa o mesmo bloqueio.
Na última vaga, somente uma nova pessoa pode ingressar.

Após resolver a credencial e revalidar identidade/acesso, quem já possui vínculo
ativo abre sua loja sem consumir ou depender da disponibilidade para novos
ingressos. O comportamento não concede acesso novo a convite inválido.

## Compatibilidade e direitos

- Criar migração aditiva; não editar SQL já aplicado. Há migrações posteriores
  a T14 no checkout: inspecionar a cadeia real, sem fixar sua contagem pelo índice.
- Links antigos permanecem com sete dias/um uso e mesmos tokens. Não emitir
  códigos curtos retroativamente nem alterar suas políticas sem ação explícita.
- Copiar aceites históricos para `InvitationUse`, preservando perfil,
  participação e data. Não emitir notificações retroativas no backfill.
- Preservar colunas de aceite singular como compatibilidade dos convites
  legados; novos códigos usam somente o histórico de usos. Constraints e
  produtores precisam distinguir as modalidades, inclusive revogação após uso.
- Novos aceites de links antigos também registram uso; a fachada conserva seus
  DTOs/erros legados. Eventos antigos mantêm suas chaves e novos ingressos são
  deduplicados por uso, sem reenviar eventos já processados.
- Novas tabelas recebem RLS/grants restritos no schema `app`, sem acesso direto
  por anon/authenticated e sem service role no Next. Validar permissão efetiva.
- Exportação do lojista inclui os metadados e usos autorizados da sua loja; a
  da pessoa inclui apenas seu próprio ingresso, sem revelar outros aceitantes
  ou a credencial do convite. Aplicar supressão por autoria já existente.
- Backup/restore continuam abrangendo a base inteira; revisar tabelas esperadas
  e provas de restauração, fixtures e limpeza para o novo histórico.
- Separar explicitamente a nova fase no verificador de migrações: hoje o último
  intervalo aberto captura todas as migrações posteriores às ilustrações.

## Modularização da entrega e orquestração proposta

As etapas abaixo organizam o trabalho. Sua implementação local foi autorizada
pelo idealizador depois da aprovação do desenho e da preparação do plano.

1. **Contrato e evolução dos dados:** fixar DTOs, política, migração e prova de
   preservação dos links/dados. Saída revisável: invariantes e migração testada.
2. **Gestão e ingresso por código:** geração recuperável, limites, resolução,
   aceite, revogação e eventos. Saída revisável: jornada HTTP real, incluindo
   concorrência, rollback e duas pessoas no mesmo convite.
3. **Experiência do lojista e participante:** configurações, cartão no estilo
   escolhido, busca e confirmação comum ao link. Saída revisável: jornada com
   teclado/celular/erro de conexão, sem respostas antigas de outra conta.
4. **Fechamento integrado:** direitos, restauração, documentação canônica e
   regressões atuais. Saída revisável: evidências locais e limitações registradas.

O integrador é o único escritor de schema/migração/contratos compartilhados e
serializa builds, typegen, servidores e ensaios. Uma vez fixados os contratos,
backend e interface podem receber agentes com arquivos exclusivos. Revisores
independentes são somente leitura. Não executar duas suítes/servidores que
disputam Next 4310/mídia 4311. Não misturar as alterações de tickets em andamento.
O plano registra a divisão final de escritores e as evidências da execução.

## Aceite e validação futura

- [ ] Gerar dois convites na mesma loja com códigos diferentes e políticas independentes.
- [ ] Recuperar a mesma operação e código; configuração diferente causa conflito.
- [ ] Normalização aceita colar/caixa/hífen previstos e rejeita códigos parciais.
- [ ] Colisão simulada não troca convite anterior nem expõe dados de outra loja.
- [ ] Validade finita/sem vencimento e cota finita/ilimitada funcionam combinadas.
- [ ] Buscar, prévia, recusar, repetir e proprietário não gastam usos.
- [ ] Várias contas disputando a última vaga nunca ultrapassam a cota.
- [ ] Mesma pessoa usando dois convites cria um vínculo/uso/evento no total.
- [ ] Vencer, revogar e pausar durante confirmação são revalidados no banco.
- [ ] Revogar após vários usos impede novos ingressos e preserva participantes.
- [ ] Suspensão, sessão revogada, supressão e acesso retirado continuam negando ação.
- [ ] Falha ao escrever uso/auditoria/outbox desfaz também vínculo e contador.
- [ ] Dois ingressos pelo mesmo convite notificam o lojista uma vez por ingresso.
- [ ] Nenhum participante consulta usos/lista de outros; código não aparece em exportações/logs.
- [ ] Limites contam erros e não podem ser contornados pelo aceite direto.
- [ ] Migração preserva links, aceites, outbox e dados financeiros/mídia existentes.
- [ ] Busca por nome, filtros e navegação atuais continuam funcionando.
- [ ] Confirmação funciona a 320/390 px, desktop, texto 200%, teclado e movimento reduzido.
- [ ] Troca de conta e resposta tardia descartam prévia/ação do contexto anterior.
- [ ] Retorno de cadastro/login pelo link exige aceite e abre a lojinha correta.

Expandir testes HTTP reais em `web/tests/integration/stores/`, notificações,
administração e pilot/direitos, e Playwright em `web/tests/e2e/stores/`.
O plano executável definirá comandos e isolamento do novo modo local, mantendo
dev/shadow/integração separados. Parar a web antes de checks compartilhados.

Na implementação: `npm run check`, prova de migrações e integração da cadeia
atual, E2E afetados e ensaio real autorizado. Nesta fase documental, conferir
somente coerência do desenho, caminhos e funcionamento isolado da prévia.
Nenhum resultado de teste da aplicação é alegado por este documento.

## Fora do escopo e decisões aprovadas

Não acrescentar código escolhido pelo lojista, diretório de lojas, convite por
e-mail, concessão de papel de lojista/admin, bônus de pontos, reabertura de
participação ou revisão do mecanismo de login. Não publicar nem migrar banco
real durante o planejamento.

Foram aprovadas as recomendações: **sem vencimento** como
opção; padrão de **sete dias/um uso**; **usos = novos participantes**; **dez
caracteres em dois grupos**; política imutável com revogação/novo convite; e
confirmação suficiente para entrar, sem aprovação posterior do lojista.
A composição escolhida foi o **Visor segmentado**.

## Referências técnicas consultadas

Foram consultados o código instalado e Context7 disponível nesta sessão para
Prisma. O retorno misturou versões; o trecho explicitamente v7 confirma as
transações interativas e suas opções. As verificações da versão 7.10.1 instalada
e do PostgreSQL local continuam necessárias na implementação.
[Transações no Prisma v7](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions).
O desenho reutiliza o bloqueio já adotado pelo projeto, sem pressupor que o
ORM faça retry automático ou que uma prévia reserve a vaga.

## Revisão desta proposta

Uma revisão independente somente leitura conferiu o desenho contra o projeto
e não apontou perguntas materiais adicionais para preparar o plano. O
idealizador aprovou posteriormente o desenho e escolheu o Visor segmentado.

A prévia isolada foi conferida em Chromium nas larguras 320/390/736, com temas
claro/escuro: duas composições, busca, recusa, confirmação e erro. Houve inspeção
visual das capturas móveis. Essa prova não valida a aplicação real, o modal
React, o banco, a autenticação ou aparelhos físicos.
