# T13 — administração mínima e diagnóstico

Estado: desenho, alcance e limites confirmados pelo idealizador em 22/10/2026,
com autorização para implementar após T12 e fazer commit. D02 permanece confirmada.
Este documento não declara implementação, execução de testes ou autorização
de publicação. T13 depende da conclusão de T12.
Builder check independente concluído: nenhuma lacuna material adicional para
planejar a implementação.

## Objetivo e referências

Entregar A01–A04 para operar contas e lojas por metadados, contagens e ações
identificáveis. O administrador recebe uma experiência própria; não recebe
uma participação implícita em qualquer loja nem acesso às relações privadas.

Fontes lidas: [roadmap T13](../plans/2026-10-22-roadmap-implementacao.md),
[requisitos](../../../requisitos.md) RF-20, RNF-02/11/14 e D02/D09,
[design A01–A04](../../../design.md), seção 12,
[arquitetura](../../../arquitetura.md), seção 3.1, e
[provisionamento existente](../../identity-local.md), “Administração separada”.
O desenho preserva Next/React/TypeScript, Prisma/PostgreSQL e Auth locais.
Não acrescenta serviço, dependência ou credencial administrativa ao Next.

## Base observada e abordagem

`requireAdminAccess` já exige sessão válida, ausência de recuperação, grant
administrativo não revogado e identidade verificada AAL2. O grant é
provisionado ou revogado por conexão administrativa separada; não existe
cadastro público ou API de promoção. TOTP e confirmação em `/conta` já existem.
Esses controles permanecem e são revalidados em cada consulta e mutação.

Há dois mecanismos diferentes no domínio atual:

- `Profile.suspendedAt` impede a identidade de acessar qualquer resposta
  privada, inclusive consultas e recuperação de uma operação. É um bloqueio
  de segurança, não uma pausa operacional com histórico consultável.
- `Store.state=PAUSED` é uma pausa do lojista. Impede novas origens, mantendo
  análise, complemento e tratamento de tickets segundo D03/D05/D06.

A recomendação é conservar essas semânticas e acrescentar uma restrição
operacional da plataforma por loja, independente de `Store.state`. Reutilizar
o mesmo campo permitiria que “Retomar” do lojista removesse uma restrição da
plataforma, ou que a reativação administrativa desfizesse a pausa do lojista.
Transformar `suspendedAt` em pausa apenas de escrita enfraqueceria a barreira
de segurança já utilizada por todas as consultas privadas.

Este desenho recomenda **pausa operacional da loja** e **bloqueio de segurança
da conta**, com nomes e confirmações distintos. Uma pausa operacional de conta
com leitura preservada exigiria estado e contrato adicionais; não está
incluída por suposição.

## A01–A04 e dados permitidos

| Tela | Conteúdo proposto | Limites da consulta |
| --- | --- | --- |
| A01 · Visão geral | Totais de contas ativas/bloqueadas, lojas por estado do lojista e com pausa da plataforma; contagem de contas/lojas criadas e ações administrativas nos últimos sete dias | Agregados sem nomes de participantes, conteúdo ou origem privada; janela identificada como UTC |
| A02 · Contas | Nome de exibição, UUID, criação do perfil, estado de segurança, quantidade de lojas criadas e de participações; busca e filtro | Perfis da aplicação; busca por nome ou UUID exato. Não consultar e-mails, fatores, tokens ou o cadastro interno do Auth |
| A03 · Lojas | Nome, UUID, responsável por nome/UUID, criação, estado do lojista, pausa da plataforma e quantidade de participantes | Busca por nome da loja/responsável ou UUID exato; separar vínculos abertos, encerrados e revogados nas contagens |
| A04 · Detalhe | Metadados da entidade, relações administrativas paginadas, controles de alcance e histórico das ações administrativas | Em conta: lojas e vínculos, seus papéis/estados. Em loja: responsável, fuso e contagens; nenhum acesso à pessoa dentro da relação privada |

Contagens de participações consideram papel PARTICIPANT, sem converter o
responsável em participante. Listas identificam filtros aplicados e ordenam
estavelmente por criação e UUID. Nenhuma lista carrega todos os resultados.
O painel não oferece exportação geral de pessoas nem busca por conteúdo.
Atualização é por nova consulta explícita; não depende de Realtime ou push.
“Contas” identifica os perfis que já ingressaram na aplicação, não inscrições
não verificadas ou abandonadas que existam apenas no provedor de identidade.
Essa distinção aparece na visão geral para não apresentar contagem parcial
como total de usuários internos do Auth.

Não incluir saldo, movimentos, legenda, foto, vídeo, assinatura de mídia,
bilhete, recadinho, comentário, reação, motivo de análise, combinado, código
de ticket ou destino privado nas respostas administrativas. Uma permissão
administrativa não altera `requireMembership` nem a audiência dos recursos.
Se o administrador também for lojista ou participante, acessa sua relação
pela navegação normal e pelas permissões daquela participação.

## Alcance proposto das ações

### Pausa operacional da plataforma na loja

Persistir `Store.platformPausedAt` e uma revisão administrativa independente
do estado mantido pelo lojista. Pausar exige motivo e confirmação, mesmo se a
loja já estiver pausada pelo responsável. A tela mostra as duas causas.
Reativar remove somente a restrição da plataforma: não reabre loja encerrada,
participação encerrada ou acesso revogado e não retoma a pausa do lojista.

Com pausa da plataforma, aplicar o mesmo bloqueio de novas origens da pausa
normal: criar/aceitar convite, receber novo registro e emitir novo resgate.
A verificação acontece no servidor, sob o lock da loja, incluindo caminhos
diretos, rascunhos, upload de evidência para novo registro e reenvio.
Lojista pode consultar/configurar o catálogo para preparar a retomada.
Registrar/revisar combinado, realizar, pedir/recusar/confirmar cancelamento,
analisar/complementar registros existentes, conversar e tratar o álbum
continuam sujeitos aos contratos existentes, sem criar autorização nova.
Isso conserva o tratamento das obrigações já existentes em D03/D05/D06.

O aviso no contexto da loja diz “Novas ações pausadas pela plataforma” e
explica quais ações estão bloqueadas, sem divulgar o motivo operacional.
A página administrativa mostra o motivo. Até D09 definir o canal, o aviso
não promete e-mail, prazo, atendimento ou link de suporte inexistente.

Uma loja encerrada pode ter a restrição removida para corrigir o cadastro
operacional, mas permanece CLOSED e seu histórico segue as permissões atuais.
Repetir uma intenção já confirmada pode recuperar seu resultado autorizado;
não é uma nova emissão e não contorna a restrição.

### Bloqueio de segurança da conta

O controle se chama “Bloquear acesso por segurança”, sem apresentar esse
efeito como pausa somente de novas ações. Usa `Profile.suspendedAt` e bloqueia
as respostas privadas da própria conta em todas as lojas, incluindo mídia,
notificações, replay e administração, como já acontece na identidade atual.
Não encerra vínculos, não modifica pontos/tickets e não apaga conteúdo.
As outras pessoas mantêm seu acesso legítimo às respectivas relações.

“Reativar acesso” remove esse bloqueio e preserva as demais restrições.
Não altera senha, fatores TOTP, revogações de sessão, grants ou participação;
o próximo acesso continua dependente de uma sessão válida. Restrições
operacionais de lojas não são removidas junto com a conta.

Proposta de proteção: a interface não bloqueia a própria conta administrativa
nem qualquer conta com grant administrativo ativo. Essas operações e a gestão
de grants permanecem no procedimento separado do operador. Isso evita que a
interface remova o único acesso administrativo sem um caminho de recuperação.
Não adicionar impersonação, redefinição de senha ou recuperação de MFA por
botão administrativo.

## Auditoria, transação e recuperação

Cada ação recebe UUID de operação, alvo, ação, revisão esperada e motivo.
O servidor calcula digest do corpo validado, ator e instante. Persistir um
registro imutável com alvo tipado, ação, estado anterior/posterior, revisão,
motivo, autor e data. Histórico administrativo não substitui nem altera os
eventos de pontos, análise, catálogo ou tickets. Os motivos ficam acessíveis
apenas na administração e nunca entram em logs técnicos.

Na transação, revalidar e bloquear perfil/sessão/grant do administrador,
autorizar AAL2 verificada pela camada Auth e bloquear o alvo antes de conferir
revisão. Mudança e auditoria confirmam juntas. A proteção SQL deve exigir
contexto e auditoria, preservando a proibição de `UPDATE suspendedAt` direto
pelo runtime. Uma função de comando restrita, com `search_path` fixo,
permissões explícitas e validação de sessão/grant no banco, é uma opção
compatível com a conexão existente. Não confiar em um `aal2` enviado pelo
cliente, nem inserir credencial de migração/service role no Next.

Mesma UUID e corpo recuperam a operação aplicada e o estado atual, após
autorizar novamente o administrador. UUID não troca autor, alvo, ação ou
motivo. Uma versão antiga retorna conflito antes de alterar o alvo. Duas
ações concorrentes não podem apagar o motivo ou estado de uma à outra.
Se a ação já foi feita por outra intenção, mostrar o estado atual e exigir
revisão, sem inventar uma segunda mudança de estado.

Após resposta perdida, consultar a operação antes de oferecer nova intenção.
Somente UUID opaca pode ficar na URL de recuperação. Motivo, nome e demais
dados do formulário ficam apenas em memória, por sessão/alvo; troca de conta,
perda do grant ou saída limpa a interface e ignora respostas atrasadas.

## Diagnóstico sem conteúdo privado

Eventos técnicos usam lista permitida de código da operação/rota, código de
resultado, status, duração e identificador aleatório de correlação. Não
registrar corpo, cabeçalho Cookie/Authorization, query de busca, URL assinada,
SQL com parâmetros, nome, e-mail, motivo administrativo, fatores TOTP ou
conteúdo de domínio. Erros desconhecidos conservam a resposta genérica 503.

A auditoria de segurança existente continua separada da auditoria com motivo.
Não prometer painel de logs externos: T13 entrega diagnóstico local sanitizado
e histórico administrativo paginado. A01 pode apontar entidades bloqueadas e
ações recentes, sem expor listas privadas para “investigar” uma relação.
Denúncia ou suporte que exija leitura de conteúdo precisa de outro fluxo com
contexto e registro de acesso; fica fora desta etapa, conforme design §12.

## Limites confirmados neste desenho

| Item | Proposta |
| --- | --- |
| Motivo administrativo | Obrigatório, texto simples de 1–500 caracteres Unicode após normalização; rejeitar espaços e Unicode inválido |
| Busca | Até 80 caracteres Unicode; UUID somente em formato válido e comparação exata |
| Listas, relações e auditoria | Página padrão 20, máximo 50; ordenação estável, total e filtros explícitos |
| Requisições administrativas | Leitura 120/minuto e mutação 10/minuto por conta; 429 com espera, inclusive no replay, sem registrar motivo |
| Visão geral | Contagens atuais; atividade de criação/ações nos últimos sete dias UTC, sem métricas de produtividade de participantes |
| Retenção | Manter proteção conservadora de D08, sem expurgo automático em T13. T14 define o marco inicial aplicável à auditoria administrativa, retenção/destino dos logs e procedimento de exclusão antes do piloto; não pressupor retenção indefinida |

Estes valores foram confirmados no aceite de T13, sem alegação de exigência legal.

## Interface, estados e aceite

Entrada “Administração da plataforma” na conta, navegação própria “Visão geral ·
Contas · Lojas” e retorno à experiência normal. Antes de MFA, orientar o fluxo
TOTP existente; não renderizar metadados privilegiados. Usuário sem grant vê
negação. Grant revogado, sessão expirada, recuperação ou bloqueio retiram
imediatamente dados já carregados, inclusive detalhe, busca e histórico.

Em 320/390 px, usar cards/listas e filtros rotulados, sem exigir tabela larga.
A confirmação mostra nome/UUID do alvo, alcance, estado resultante e motivo
obrigatório; botões identificam “Pausar novas ações da loja” ou “Bloquear
acesso da conta”. Foco inicial, erro de campo, Escape, retorno de foco,
teclado, texto 200% e movimento reduzido seguem componentes existentes.
Representar carregamento, lista vazia, busca sem resultado, 403, conflito,
429/503 e resultado incerto sem afirmar ação antes da confirmação do servidor.

Aceite requer provas de HTTP real e Chromium, além das regressões anteriores:

- Autocadastro e atualização comum de perfil não concedem administração;
  grant sozinho sem AAL2 e AAL2 sem grant não autorizam nenhuma fonte nova.
- Visão geral/listas/detalhes/auditoria/lookup/mutações revalidam acesso;
  consultas administrativas não retornam conteúdo privado nem seu endereço.
- Pausa e reativação preservam pausa do lojista, encerramento, vínculos,
  análise, saldo, tickets e permissões de mídia; bloqueio de segurança impede
  inclusive leitura privada da conta bloqueada.
- Mudança sem auditoria falha; motivo inválido, acesso revogado, concorrência,
  toque duplo, perda da resposta e replay não geram efeitos sem rastreio.
- Administrador sem vínculo recebe a mesma negação das rotas normais de
  pontos, análise, tickets, álbum, conversas e bilhetes; o painel não utiliza
  rotas especiais para contornar essa negação.
- Logs capturados durante êxitos/falhas não contêm payloads, segredos, termos
  de busca ou motivo. A auditoria operacional mantém somente os campos
  aprovados, com acesso administrativo atual.

Emulação Chromium não comprova Safari/iPhone, Android real, leitor de tela ou
metas p75. D09 ainda deixa versões exatas, RPO/RTO, disponibilidade, provedor,
orçamento e canal de suporte sem decisão. Isso não impede preparar e verificar
T13 local; impede declarar piloto/publicação/recuperação operacional aprovados.

## Complementos confirmados pelo idealizador

1. Confirmar o alcance recomendado: pausa operacional da plataforma por loja,
   independente da pausa do lojista, e bloqueio de segurança da conta com
   perda de leitura privada; não oferecer pausa operacional de conta em T13.
2. Confirmar que a pausa da plataforma bloqueia novas origens e conserva
   análise/complemento, tratamento de tickets, conversa e álbum já existentes,
   conforme a matriz acima; uma interdição total de escrita seria outro contrato.
3. Confirmar os limites propostos e a proteção que impede bloquear contas com
   grant administrativo ativo pela interface. D02/provisionamento/TOTP já
   confirmados não precisam de nova decisão.

Desenho confirmado; preparar o plano de execução e suas fronteiras de arquivos.
Este desenho foi produzido somente com leitura de fontes e escrita deste
documento; nenhuma alteração administrativa, migração ou serviço foi executado.
