# T04 — lojas, participantes e convites

**Estado:** aprovado pelo idealizador em 22/10/2026, nas quatro confirmações
de D03, convites, limites D04 e complemento operacional.
**Base:** `cb5bfc0`; execução local, sem publicação ou mensagens externas.
**Fontes:** [roadmap](../plans/2026-10-22-roadmap-implementacao.md#t04--lojas-participantes-convites-e-navegação-contextual),
[requisitos](../../../requisitos.md#61-registro-de-decisões-de-m0) e
[design](../../../design.md#16-privacidade-convites-e-encerramento).

## Resultado esperado

Uma conta cria várias lojas e participa de outras. A central separa os papéis,
oferece busca/paginação e identifica loja e papel durante a navegação.
O lojista cria e configura sua loja, administra pessoas e gera/revoga links.
A pessoa convidada vê somente a apresentação autorizada, autentica-se na conta
que escolher, confirma o aceite e entra na loja correta. Histórico permanece
privado quando uma loja ou participação é encerrada.

C01/C05 aproveitam Auth, recuperação, MFA e logout de T02 e acrescentam perfil
e acesso à central. C02/C03 e L01/L09–L11 recebem fluxos reais de loja/convite.
Identidade visual padrão permite criar sem enviar avatar/capa; upload e
notificações usam seus pacotes responsáveis T05/T06. Não mostrar pontos,
análises, tickets ou preferências fictícios como dados implementados.

## Abordagem

Manter Next Route Handlers, Prisma/PostgreSQL e Auth existentes. DTOs públicos
ficam em `web/src/contracts/`; autorização, transações e consultas no servidor.
Essa evolução preserva a base confirmada em D01 e os gates de T02.
Mover as mutações para RPC SQL criaria outra fronteira de serviço e mais
contratos; não há necessidade observada que justifique essa mudança em T04.

O integrador serializa schema, migrações, dependências, builds, servidores e
testes. Backend, UI e novos testes recebem arquivos exclusivos; revisões
independentes são somente leitura. Nenhum implementador faz commit.

## Decisões de produto confirmadas

As regras aprovadas são: um responsável por loja, lojista sem pontuar na
própria loja, definições compartilhadas, saldo inicial zero; convite revogável,
uso único e sete dias; pausa bloqueia novos convites/registros/resgates;
encerramento exige resolver análises pendentes e preserva histórico/tickets.
Limites aplicáveis: nomes 80, apresentação 280, descrições 1.000, listas 20/50,
leitura 120/min e mutação 30/min por conta; mudança de fuso antes do primeiro
registro/ticket. Semana/retroatividade e demais políticas permanecem futuras.

Complemento aprovado para eliminar ambiguidades do fluxo:

- Link compartilhável, sem e-mail destinatário persistido, consumido pelo
  primeiro aceite autenticado válido. Não enviar convite automaticamente.
- Pausa bloqueia geração e aceite de convites; o lojista pode retomar a loja.
- Encerramento de loja/participação é final nesta etapa; um convite não
  reativa relação encerrada. A consulta privada continua disponível.
- Convite já aceito pela mesma conta devolve a participação existente;
  outra conta não obtém acesso. Quem já participa abre a loja sem duplicação;
  o próprio lojista recebe “Gerenciar loja”.

Esses pontos foram confirmados explicitamente pelo idealizador; os demais
itens D04 e D05–D09 continuam com suas dependências originais.

## Dados, segurança e concorrência

Loja recebe apresentação, fuso e estado/datas. Participação ganha encerramento
separado de `accessRevokedAt`; encerrar não retira o acesso ao histórico.
Convite mantém hash do token imprevisível, expiração, revogação, aceite e vínculo.
O token bruto só compõe o link entregue na geração; não entra em auditoria.
Identidade e papel não são aceitos do corpo da requisição.

Criação da loja e vínculo de lojista são atômicos. Restrições no banco devem
garantir um responsável e impedir duplicação de papel por perfil/loja após
verificar compatibilidade dos dados existentes. Aceite, consumo do convite e
criação da participação usam uma transação, com bloqueios e revalidação de
loja/convite/vínculo. Revogar, pausar e encerrar disputam os mesmos recursos.
Repetições e tentativas concorrentes precisam devolver resultados consistentes.

Mutações exigem identidade, origem exata, JSON limitado, no-store e autorização
revalidada na transação. O runtime recebe somente os grants necessários;
AdminGrant, suspensão e DDL continuam bloqueados. Novas tabelas ficam em `app`,
com RLS/grants e sem Data API pública. Preview do convite revela apenas nome/
apresentação da loja, identidade de quem convida e estado necessário ao aceite.

Registros/tickets ainda não existem. T04 deve distinguir esse fato de uma
consulta de pendências implementada: definir o ponto de integração de T07/T08
e apresentar as consequências atuais sem inventar contagens/saldos. Os módulos
futuros de T07/T08 e T09/T10 precisam acrescentar suas verificações na mesma transação de ciclo
de vida antes de liberar registros ou tickets; ausência dessa integração é
um bloqueio de aceite desses módulos.
O contrato é `withStoreTransaction(identity, storeId, operation)`, que bloqueia
loja antes de participação/convite, e `assertLifecycleDependencies(tx, scope)`.
T04 não tem registros/tickets para consultar; o serviço deve declarar esse
estado e os próximos pacotes devem integrar seus dados reais nesse contrato.
Lojista pode encerrar uma participação e participante pode encerrar a própria.

Criação de loja usa operationId UUID e digest do pedido; repetição devolve o
mesmo resultado sem criar outra loja. Convite usa UUID de operação como ID e
token imprevisível derivado por HMAC com chave privada e separação de contexto;
somente seu hash fica no banco. Assim o proprietário pode recuperar o mesmo
link após perda da resposta, sem armazenar token bruto. Rotação/versionamento
da chave deve ser resolvido antes da publicação em T14.

## Contexto e navegação

A URL identifica a loja. Respostas antigas são abortadas/descartadas ao mudar
conta ou loja; estado privado não fica em cache público ou armazenamento global.
Rascunhos ficam na árvore da tela e são descartados ao trocar o contexto.
Cabeçalho mostra loja/papel e leva à central; participantes não veem outras
pessoas, convites ou configurações. Logout/troca de conta preserva apenas o
destino validado do convite, sem preservar dados privados da sessão anterior.

Busca/listas usam ordem estável, paginação validada e filtros autorizados.
Encerradas têm caminho explícito de consulta, separado da lista ativa.
Confirmar encerramento/revogação antes da mutação, mostrar espera/erro e
consultar o resultado se a resposta se perder; não alegar sucesso antecipado.

## Recursos e aceite

Reutilizar somente os serviços locais comprovados da stack `meumimo-t02`,
mantendo Auth no banco interno `postgres`. Isolar domínio/fixtures de T04 em
`meumimo_t04`, com desenvolvimento/shadow próprios e aplicação de teste 4310.
Preservar o modo T02 em `postgres`/4302. Credenciais administrativas ficam no
processo de fixtures/migrações, sem entrar no Next ou no Git.
O modo T04 tem artefatos/estado próprios; suas fixtures distinguem a conexão
de domínio daquela que consulta Auth em `postgres`. A allowlist Auth inclui
4310, mantendo 4301/4302. Migração evolutiva preserva perfis, lojas e vínculos
anteriores, inclusive autoria sem papel, e verifica as novas invariantes.

Provar migração vazia/evolutiva e permissões; conta com loja própria e duas
participações; dois participantes isolados; convite anônimo → autenticação →
aceite explícito; estados de convite/loja/vínculo e concorrência; pausa/
encerramento em chamadas diretas; busca/paginação e troca de conta sem resíduos.
Preservar os 7 testes do protótipo e os gates de T01–T03, incluindo 26 HTTP de
identidade. UI: 320/390, teclado/foco, toque, texto 200%, movimento reduzido,
erros e estados vazios. Chromium emulado não comprova mensageiros/aparelhos
reais nem leitor de tela; registrar essas limitações.
