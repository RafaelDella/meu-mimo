# Aceite da web local

Registro de 23 de outubro de 2026, com o fechamento local de T14 e a operação
de T15 descrita na seção própria. Esta matriz
confronta os cenários de [requisitos §5](../../requisitos.md) com testes existentes
e com as provas novas observadas. O recorte segue o
[desenho confirmado](../superpowers/specs/2026-10-22-t14-t15-piloto-design.md) e o
[plano local](../superpowers/plans/2026-10-22-t14-t15-local.md).

A base identificada é T13, commit
`72bbe85737e3cdc3efaded7723bb4b845dce358d`. O candidato T14 foi verificado na branch
`codex/t14-piloto-local` e foi commitado em
`206e0ce68b91765328b13a27ac8028e61fa37307`.
As execuções abaixo foram conduzidas pelo responsável pela integração, em série.
Cada seção distingue a revisão documental das execuções realizadas pelo integrador.

O ciclo integrado, recuperação de conta, privacidade, direitos e recuperação
completa e laboratório tiveram provas locais aprovadas. A regressão T14 passou
362 casos HTTP, 736 casos Chromium e os quatro percursos funcionais. A revisão
final passou o ciclo ampliado com edição real de atividade/mimo, snapshot
preservado, reposição explícita e publicação parcial/substituição de vídeo.
O mesmo fator TOTP foi preservado e verificado no ensaio completo de recuperação.
T14 está verificada no recorte local confirmado. A operação local de T15 e os
gates físicos e de publicação têm evidências e limites próprios abaixo.

## Métodos e evidências observadas

Os identificadores da tabela distinguem métodos e versões. “Passou em H13”
significa cobertura executada na baseline; não significa repetição desse caso
com as alterações T14. Um caso de navegador com respostas controladas prova
estados da interface, enquanto um teste HTTP prova o serviço sem percorrer seus
formulários. As duas provas se complementam.

| Referência | Método e resultado observado | Artefato privado, fora do Git |
| --- | --- | --- |
| H13 | HTTP/JSON com Auth, PostgreSQL e Storage locais: 356 casos distintos aprovados ao consolidar 355 aprovações da execução completa com quatro aprovações focais. Três casos focais já estavam aprovados; a expectativa antiga de autorização foi corrigida. A execução completa isolada tinha uma falha, resolvida pela repetição focal. | `.artifacts/t13-http-full-1.log` e `.artifacts/t13-http-authorization-green.log` |
| H14 | Regressão HTTP completa T14: 362/362 casos aprovados, zero falhas/cancelamentos/skips. Repete a cobertura anterior e inclui os seis casos novos de direitos. | `.artifacts/t14-http-full-1.log` |
| UI13 | 736/736 cenários Chromium da suíte existente, incluindo composições e respostas controladas de interface, em 320/390 px. Não equivalem a 736 fluxos com persistência real. | `.artifacts/t13-browser-full-1.log` |
| UI14 | Regressão completa Chromium T14: 736/736 casos aprovados em 320/390 px, zero falhas. Repete as composições e os estados controlados da suíte anterior; os percursos com persistência real continuam identificados separadamente. | `.artifacts/t14-browser-full-1.log` |
| E14 | Após corrigir os dois editores, 144/144 casos das áreas de atividades e resgates passaram no novo build em320/390. Incluem quatro novas execuções de regressão com contrato estrito, antes reproduzidas como falha. São repetições de casos anteriores mais os novos casos, não 144 fluxos reais adicionais. | `.artifacts/t14-editor-regressions-green.log`; REDs `t14-reward-edit-red.log` e `t14-activity-edit-red.log` |
| C14 | Ciclo ampliado real passou em 5,4 min: lojista em 1280 px e participantes em 390 px, loja/convites, edição de atividade, foto/aprovação, saldo negativo, pedido/recusa/novo pedido e cancelamento com refund/reposição explícita. Segunda emissão preserva snapshot após editar nome/custo/recadinho; combinado/revisão/realização e álbum 4+1 com falha MP4 real, remoção/substituição, ordem/legendas e dois vídeos. SELECTs conferem finanças/estoque, dois outbox/avisos únicos e tamanho dos derivados no Storage. | `.artifacts/t14-cycle-final-expanded-4.log`; histórico do ciclo inicial em `t14-browser-cycle-4.log` |
| PR14 | Três casos de navegador real passaram: um de privacidade/bilhete/reação/retomada e dois de cadastro, recuperação de senha e troca de conta após logout em outra aba. | `.artifacts/t14-browser-recovery-privacy-2.log` |
| F14 | Repetição serial dos quatro percursos funcionais com serviços reais: 4/4 aprovados, sem skips, em 3,7 minutos. O ciclo desta execução ainda não inclui os ramos adicionais pedidos pela revisão final. | `.artifacts/t14-web-real-final.log` |
| D14 | Seis casos de direitos passaram por serviço/HTTP e conferência independente: protocolo restrito à fixture e replay; supressão por autoria; exportação sem dados de Bia/segredos; foto removida excluída da exportação; supressão IDENTITY isolada negando mídia; hold de evidência com GET/Range negados. | `.artifacts/t14-rights-http-3.log` |
| M14 | Cadeia de dezesseis migrações aprovada em banco vazio e evolução, com dados anteriores preservados, RLS e privilégios efetivos. Inclui a fase T14 posterior ao snapshot de preservação T13. | `.artifacts/t14-rights-migration-green-1.log` |
| U14 | 26 casos distintos T14 sem serviços aprovados: vinte de custódia/journal/recursos/retenção/ambiente/arquivo, três de inventário, um de diagnóstico e dois do executor QA. A repetição final passou os 37 unitários web, incluindo os onze anteriores. A contagem é a união dos casos, sem somar reexecuções. | `.artifacts/t14-unit-final.log` |
| LAB14 | Repetição passou com cinquenta amostras, cinco por cenário/cache, em build de produção e álbum de vinte itens reais. Nenhum erro de recurso. A primeira tentativa recebeu 429 no preparo; o teste passou após aguardar READY e cotas reais, sem mudar os limites do produto. | `.artifacts/t14-browser-performance-2.log` e `reports/performance-lab-eabcf856-3689-4345-844a-3b1783e6d69d.json` |
| REC14 | `WEB_RECOVERY_VERIFIED` em seis fases: captura fria, exclusão posterior, cópia com novos segredos, dois replays adicionais sem duplicação, mesmo fator TOTP para novo AAL2, novo resgate/cancelamento/devolução pela UI e limpeza por posse. RPO simulado de 77,838s e RTO completo de 96,593s; seis objetos por hash e 26 linhas financeiras da fixture preservadas antes do novo ciclo. | `.artifacts/t14-recovery-check-4.log` e `reports/recovery-check.json`; volume, instantes, falhas anteriores e limites em [recuperação](recovery.md) |
| G14 | `npm run check` final passou após corrigir os dois editores: regras/lint, 7 testes da base, 37 unitários web, tipos e build de produção. Uma execução intermediária concorria com o lock da manutenção e foi repetida em série. | `.artifacts/t14-check-final-5.log`; histórico anterior em `t14-check-3`, `t14-lint-final` e `t14-unit-final` |

Os artefatos podem conter identificadores sintéticos, conteúdo de teste, URLs
temporárias ou detalhes operacionais. Permanecem privados e não versionados;
não copiar seu conteúdo integral para documentação pública. O manifesto final
de execução deve vincular o SHA candidato aos comandos, instantes, resultados e
artefatos correspondentes, sem incluir segredos.

A ampliação do ciclo encontrou a edição de mimo enviando metadados de leitura
no PATCH; a revisão identificou a mesma cadeia em atividades. As duas APIs
recusavam corretamente os campos extras. Regressões de navegador com contrato
estrito falharam antes da correção, em320/390. Os formulários agora projetam
apenas a configuração editável. H14, UI14, LAB14 e REC14 precedem esse ajuste;
as repetições das áreas afetadas e do ciclo real identificam sua validação no
novo build, sem tratar a execução anterior como prova integral desse build.

## Matriz dos fluxos críticos

As 27 linhas de requisitos §5 incluem 26 cenários ligados aos P0 atuais e um de
retrospectiva futura, associado a RF-24/P1. A linha futura aparece ao final,
separada do aceite das funcionalidades atuais. Na coluna de resultado, H13 e
UI13 conservam o alcance da baseline. Todos os casos HTTP H13 foram novamente
aprovados na execução H14 completa; os casos UI13 também passaram na repetição
UI14 completa.

### Conta, contexto e acesso privado

| Cenário de requisitos §5 | Testes que exercitam o aceite | Resultado e alcance |
| --- | --- | --- |
| Abrir convite sem conta e concluir autenticação | HTTP: [stores/security.test.mjs](../../web/tests/integration/stores/security.test.mjs), convite anônimo após cadastro/confirmação e login. UI: [stores/invitations.spec.ts](../../web/tests/e2e/stores/invitations.spec.ts). T14: [recovery.spec.ts](../../web/tests/pilot-browser/recovery.spec.ts) e [cycle.spec.ts](../../web/tests/pilot-browser/cycle.spec.ts). | H13/UI13 passaram. PR14 comprova cadastro/confirmação e recuperação reais; C14 aceita convite com pessoa já autenticada. A combinação convite sem conta permanece comprovada pelo HTTP H13, sem novo percurso completo desse ramo na UI T14. |
| Mesma pessoa gerencia uma loja e participa de duas | HTTP: [stores/stores.test.mjs](../../web/tests/integration/stores/stores.test.mjs), conta com várias lojas e duas participações. UI: [stores/hub.spec.ts](../../web/tests/e2e/stores/hub.spec.ts). | H13/UI13 passaram. Papéis e consultas são separados; não há novo cenário T14 com essa mesma combinação de três contextos. |
| Dois participantes da mesma loja | HTTP: [stores/security.test.mjs](../../web/tests/integration/stores/security.test.mjs) e [activities/authorization.test.mjs](../../web/tests/integration/activities/authorization.test.mjs). T14: [privacy.spec.ts](../../web/tests/pilot-browser/privacy.spec.ts) e [cycle.spec.ts](../../web/tests/pilot-browser/cycle.spec.ts). | H13/UI13, C14 e PR14 passaram. Ana/Bia não obtêm registro ou bytes alheios; administrador com MFA, sem vínculo, também recebe negação. C14 nega a Bia o ticket de Ana. |
| Enviar bilhete só para Ana | HTTP: [relationship/notes.test.mjs](../../web/tests/integration/relationship/notes.test.mjs) e [authorization.test.mjs](../../web/tests/integration/relationship/authorization.test.mjs). T14: [privacy.spec.ts](../../web/tests/pilot-browser/privacy.spec.ts). | H13/UI13 e PR14 passaram. Indicador e texto são vistos por Ana; Bia e administrador sem vínculo não recebem a versão privada. |
| Enviar nova versão enquanto a anterior é aberta | HTTP: [relationship/notes.test.mjs](../../web/tests/integration/relationship/notes.test.mjs), `read_v1_does_not_read_v2`. T14: [privacy.spec.ts](../../web/tests/pilot-browser/privacy.spec.ts). | H13/UI13 e PR14 passaram. SELECT em NoteRead confirma que v2 fica não lida até Ana abrir o novo bilhete, enquanto v1 continua exibida. |
| Trocar de conta no mesmo aparelho | UI: [stores/account-context.spec.ts](../../web/tests/e2e/stores/account-context.spec.ts) e [media/media.spec.ts](../../web/tests/e2e/media/media.spec.ts). T14: [recovery.spec.ts](../../web/tests/pilot-browser/recovery.spec.ts), logout em outra aba. | UI13 e PR14 passaram. O caso real remove o rascunho privado, autentica outra pessoa e nega o registro; descarte de foto/saldo e respostas atrasadas também têm cobertura controlada da baseline. Não é ensaio de aparelho físico. |
| Abrir notificação de outra loja | HTTP: [notifications/authorization.test.mjs](../../web/tests/integration/notifications/authorization.test.mjs) e [relationship/notifications.test.mjs](../../web/tests/integration/relationship/notifications.test.mjs). UI: [relationship/notifications.spec.ts](../../web/tests/e2e/relationship/notifications.spec.ts), apresentação de loja/papel antes da troca. | H13/UI13 passaram. Destino reautoriza o recurso e não amplia audiência. C14 confirma outbox processada, mas não percorre esse ramo entre lojas na UI. |

### Conquistas, pontos e histórico

| Cenário de requisitos §5 | Testes que exercitam o aceite | Resultado e alcance |
| --- | --- | --- |
| Enviar registro manual com foto | HTTP: [activities/submissions.test.mjs](../../web/tests/integration/activities/submissions.test.mjs) e [media-relation.test.mjs](../../web/tests/integration/activities/media-relation.test.mjs). T14: [cycle.spec.ts](../../web/tests/pilot-browser/cycle.spec.ts). | H13/UI13 e C14 passaram. HTTP prova pendência sem saldo disponível; o ciclo real envia a foto, aprova e reconcilia o crédito de 15 no ledger. |
| Enviar registro automático | HTTP: [activities/submissions.test.mjs](../../web/tests/integration/activities/submissions.test.mjs), crédito único com snapshot/auditoria/evento, e [points/decisions.test.mjs](../../web/tests/integration/points/decisions.test.mjs), contestação sem segundo ganho. | H13/UI13 passaram. O ciclo C14 utiliza aprovação manual; não substitui a prova do automático. |
| Aprovar duas vezes, inclusive simultaneamente | HTTP: [points/consistency.test.mjs](../../web/tests/integration/points/consistency.test.mjs), duas UUIDs concorrentes e replay da mesma UUID. | H13 passou. Crédito, decisão e auditoria permanecem únicos; C14 realiza uma aprovação e não é uma nova corrida de aprovação. |
| Pedir complemento e receber nova foto | HTTP: [points/evidence.test.mjs](../../web/tests/integration/points/evidence.test.mjs), revisão atual READY, histórico anterior e complementos concorrentes. UI: [points/response.spec.ts](../../web/tests/e2e/points/response.spec.ts) e [media-history.spec.ts](../../web/tests/e2e/points/media-history.spec.ts). | H13/UI13 passaram. Conservam foto/legenda anteriores, ocorrência e crédito; sem novo percurso de complemento na UI T14. |
| Anular crédito já gasto | HTTP: [redemptions/issuance.test.mjs](../../web/tests/integration/redemptions/issuance.test.mjs) e [tickets/refunds.test.mjs](../../web/tests/integration/tickets/refunds.test.mjs). T14: [cycle.spec.ts](../../web/tests/pilot-browser/cycle.spec.ts). | H13/UI13 e C14 passaram. SELECT confirma `15, -10, -15, +10`; saldo fica −10 após anulação, ticket continua acessível e cancelamento termina em zero. |
| Receber devolução de um resgate cancelado | HTTP: [tickets/refunds.test.mjs](../../web/tests/integration/tickets/refunds.test.mjs) e [relationship/dashboards.test.mjs](../../web/tests/integration/relationship/dashboards.test.mjs). T14: [cycle.spec.ts](../../web/tests/pilot-browser/cycle.spec.ts). | H13/UI13 e C14 passaram. Devolução tem origem própria; o teste HTTP confirma que não vira ganho diário por atividade. Nenhuma retrospectiva foi gerada. |
| Filtrar histórico por uma loja e período | HTTP: [points/statement.test.mjs](../../web/tests/integration/points/statement.test.mjs) e [redemptions/history.test.mjs](../../web/tests/integration/redemptions/history.test.mjs). UI: [points/statement.spec.ts](../../web/tests/e2e/points/statement.spec.ts) e [redemptions/history.spec.ts](../../web/tests/e2e/redemptions/history.spec.ts). | H13/UI13 passaram: audiência, tipo, período civil/fuso e paginação estável. C14 confere a cadeia financeira por SELECT, sem repetir toda a filtragem pela UI. |

### Catálogo, resgate e realização

| Cenário de requisitos §5 | Testes que exercitam o aceite | Resultado e alcance |
| --- | --- | --- |
| Resgatar com saldo insuficiente | HTTP: [redemptions/catalog.test.mjs](../../web/tests/integration/redemptions/catalog.test.mjs) e [concurrency.test.mjs](../../web/tests/integration/redemptions/concurrency.test.mjs). UI: [redemptions/catalog.spec.ts](../../web/tests/e2e/redemptions/catalog.spec.ts) e [form.spec.ts](../../web/tests/e2e/redemptions/form.spec.ts). | H13/UI13 passaram. Prévia informa falta de pontos; tentativa inelegível não emite ticket nem débito. C14 resgata com saldo suficiente. |
| Duas tentativas de resgate com saldo para apenas uma | HTTP: [redemptions/concurrency.test.mjs](../../web/tests/integration/redemptions/concurrency.test.mjs), dois mimos disputando o saldo. | H13 passou: no máximo uma emissão, sem saldo negativo por disputa nem efeitos parciais. A corrida não foi reexecutada como cenário de UI T14. |
| Dois participantes disputam o último item | HTTP: [redemptions/concurrency.test.mjs](../../web/tests/integration/redemptions/concurrency.test.mjs), última unidade com crédito real dos dois participantes. | H13 passou: somente quem reserva a unidade recebe ticket e débito. C14 não é prova concorrente de última unidade. |
| Conexão cai depois de confirmar um resgate | HTTP: [redemptions/concurrency.test.mjs](../../web/tests/integration/redemptions/concurrency.test.mjs), mesma UUID/resposta perdida com ticket persistido. UI: [redemptions/redemption.spec.ts](../../web/tests/e2e/redemptions/redemption.spec.ts), recuperação no reload sem novo POST. | H13/UI13 passaram. A perda de resposta financeira tem correlação real no HTTP e estados controlados no navegador. A retomada offline de PR14 é de reação; não deve ser apresentada como nova prova de resgate offline. |
| Cancelar o mesmo ticket duas vezes | HTTP: [tickets/refunds.test.mjs](../../web/tests/integration/tickets/refunds.test.mjs). UI: [tickets/recovery.spec.ts](../../web/tests/e2e/tickets/recovery.spec.ts). | H13/UI13 passaram: custo congelado devolvido uma vez, evento e histórico preservados. C14 cancela pela UI e confere o refund; não repete dois cancelamentos nesse ciclo. |
| Editar ou arquivar um mimo depois do resgate | HTTP: [redemptions/issuance.test.mjs](../../web/tests/integration/redemptions/issuance.test.mjs), edição/arquivo após emissão. UI: [redemptions/redemption.spec.ts](../../web/tests/e2e/redemptions/redemption.spec.ts), snapshot e origem do extrato. C14: [helper-cycle.ts](../../web/tests/pilot-browser/helper-cycle.ts). | H13/UI13, E14 e C14 passaram. C14 muda nome/custo para 99/recadinho pela UI e confere ticket original de 10 com a nota anterior, inclusive após reload. O arquivamento permanece coberto por HTTP/UI controlada. |

### Mídia e uso móvel

| Cenário de requisitos §5 | Testes que exercitam o aceite | Resultado e alcance |
| --- | --- | --- |
| Negar câmera | UI: [media/media.spec.ts](../../web/tests/e2e/media/media.spec.ts), câmera cancelada, galeria, teclado e texto 200%. [design §18.4](../../design.md) exige conferência no dispositivo real. | UI13 passou para cancelamento/alternativa de interface. Negação nativa de permissão, retorno de câmera e seleção em Android/iPhone reais não foram executados; esse alcance continua pendente. |
| Usar em 320 px, com teclado e texto ampliado | UI: [stores/hub.spec.ts](../../web/tests/e2e/stores/hub.spec.ts), [albums/accessibility.spec.ts](../../web/tests/e2e/albums/accessibility.spec.ts) e [media/media.spec.ts](../../web/tests/e2e/media/media.spec.ts). T14: [privacy.spec.ts](../../web/tests/pilot-browser/privacy.spec.ts) e [recovery.spec.ts](../../web/tests/pilot-browser/recovery.spec.ts). | UI13 passou em 320/390. PR14 confere bilhete em 320/390, Tab/Shift+Tab/Escape/retorno de foco, texto 200%, movimento reduzido e ausência de overflow; cadastro real usa 320. C14 roda em 390. Isso não aprova todos os fluxos reais em todas as larguras nem leitor de tela/aparelhos físicos. |
| Publicar três fotos e dois vídeos no café da manhã de Ana | HTTP: [albums/publication.test.mjs](../../web/tests/integration/albums/publication.test.mjs) e [authorization.test.mjs](../../web/tests/integration/albums/authorization.test.mjs). T14: [cycle.spec.ts](../../web/tests/pilot-browser/cycle.spec.ts). | H13/UI13 e C14 passaram. Cinco arquivos reais foram processados/publicados pela UI e seus objetos conferidos. Outro resgate do mesmo mimo permanece independente na prova HTTP H13; Bia não acessa o ticket no C14. |
| Um vídeo falhar durante envio de várias mídias | HTTP: [albums/publication.test.mjs](../../web/tests/integration/albums/publication.test.mjs), falha privada e publicação parcial/lote posterior, e [media/races.test.mjs](../../web/tests/integration/media/races.test.mjs). UI: [media/media.spec.ts](../../web/tests/e2e/media/media.spec.ts) e [albums/recovery.spec.ts](../../web/tests/e2e/albums/recovery.spec.ts). C14: [helper-cycle.ts](../../web/tests/pilot-browser/helper-cycle.ts). | H13/UI13 e C14 passaram. MP4 inválido real falha no worker; C14 publica quatro prontos, nega o falho à participante, remove/substitui pela UI e publica o quinto. Ordem/legendas e financeiro são conferidos; cada publicação tem um outbox/aviso entregue. Retomada de partes mantém também sua prova HTTP específica. |
| Adicionar momentos depois de realizar o mimo | HTTP: [albums/publication.test.mjs](../../web/tests/integration/albums/publication.test.mjs), publicação sem mudança financeira, e [tickets/states.test.mjs](../../web/tests/integration/tickets/states.test.mjs). T14: [cycle.spec.ts](../../web/tests/pilot-browser/cycle.spec.ts). | H13/UI13 e C14 passaram. C14 marca realização antes de enviar/publicar os cinco momentos; não há nova emissão para criar o álbum. |
| Remover uma mídia publicada | HTTP: [albums/concurrency.test.mjs](../../web/tests/integration/albums/concurrency.test.mjs) e [relationship/feed.test.mjs](../../web/tests/integration/relationship/feed.test.mjs). UI: [albums/gallery.spec.ts](../../web/tests/e2e/albums/gallery.spec.ts) e [review-regressions.spec.ts](../../web/tests/e2e/albums/review-regressions.spec.ts). T14: [pilot/rights.test.mjs](../../web/tests/integration/pilot/rights.test.mjs). | H13/UI13 e D14 passaram. Remoção oculta álbum/preview sem alterar dinheiro; D14 prova que legenda imutável e bytes removidos também ficam fora da exportação. Nenhuma seleção de retrospectiva futura foi implementada. |

### Retrospectiva futura

| Cenário de requisitos §5 | Cobertura atual | Estado |
| --- | --- | --- |
| Gerar retrospectiva futura com ticket cancelado | [tickets/refunds.test.mjs](../../web/tests/integration/tickets/refunds.test.mjs), [relationship/dashboards.test.mjs](../../web/tests/integration/relationship/dashboards.test.mjs) e C14 preservam tipos, datas, snapshot e separação entre ganho, débito, devolução e realização. | A base histórica passou em H13/C14. Geração, versão de cálculo e apresentação de retrospectiva são RF-24/P1 e não foram executadas nem entregues por T14. |

## Direitos, persistência e operação

Além dos fluxos acima, RNF-02/05/10/11/12/13/14/16/18 exigem conferências que
uma página visível não comprova.

| Fronteira | Prova observada | O que permanece aberto |
| --- | --- | --- |
| Autoria, supressão e dinheiro | D14 usa Auth/HTTP/banco reais, revoga o acesso anterior, oculta texto próprio, conserva texto da outra autora e compara o financeiro antes/depois e no replay. A exclusão retorna `PARTIAL`; o [procedimento de direitos](data-rights.md) detalha impedimentos. | Não declarar exclusão física completa, tratamento autorizado de contas reais ou fim de todas as cópias em backup. |
| Exportação e mídia protegida | D14 autentica o pacote cifrado e confere ausência de conteúdo de Bia, segredos, foto removida e mídia com IDENTITY suprimida. Evidência em análise mantém hold/bytes, mas acesso anterior GET e Range recebe negação. | Não interpretar preservação por hold como permissão de leitura; não prometer recuperação de mídia expurgada. |
| Migração e privilégios | M14 confere dezesseis migrações, preservação da baseline, constraints, atomicidade, RLS e papel operacional estreito; runtime não recebe os poderes do operador. Repetição final passou em `.artifacts/t14-migrations-final.log`; H14 passou 362/362 e UI14 passou 736/736. Fontes: [check-rights-migration.mjs](../../web/scripts/check-rights-migration.mjs) e [helpers](../../web/scripts/check-rights-migration-helpers.mjs). | A cobertura de privilégios é local; não comprova configuração de um provedor futuro. |
| Credenciais, caminhos e arquivo cifrado | U14 cobre ambiente Next sem credenciais operacionais, conexão nominal, isolamento de restore, caminhos/links, exclusividade, lock, journal/checkpoint, retenção e falha de autenticação AES antes de publicar plaintext. Fontes em [tests/pilot](../../web/tests/pilot). | Funções e observações de teste não comprovam uma stack restaurada, continuidade operacional ou custódia fora desta máquina. |
| Backup e restauração | REC14 passou com cluster/Auth/Storage, seis objetos por hash, finanças, privilégios, contextos antigos negados, TOTP original verificado e supressão posterior reaplicada antes de abrir. RPO de 77,838s e RTO completo de 96,593s, dentro das metas locais de 24h/8h. | Não extrapolar o ensaio sintético para outra máquina/carga, disponibilidade remota ou cópia física externa. Intervalo de doze horas sob supervisão pertence a T15; retenção de trinta dias já tem provas por manifesto. |
| Persistência para o idealizador | C14 conserva resultados após reload; PR14 autentica novamente e consulta a loja criada. T15 confere os mesmos IDs, foto, saldo e ticket após reiniciar os filhos, conforme a seção operacional abaixo. | Não houve reinício físico do computador nem prova de disponibilidade com a máquina desligada. |

## Laboratório e metas móveis

[performance.spec.ts](../../web/tests/pilot-browser/performance.spec.ts) prepara
vinte fotos reais em dois lotes de dez e publica pela UI. A espera nova consulta
somente a coleção do ticket/autoria da fixture, primeiro com dez e depois vinte
arquivos READY e derivados presentes. Não altera estado de processamento nem
cotas do produto. A primeira tentativa LAB14 falhou com 429 durante os refreshes;
a repetição produziu cinquenta amostras completas e passou em 13,5 minutos.

O método previsto coleta cinco rodadas de cada cenário, em cache frio e quente,
no build de produção: entrada/lojas, Lojinha, análise com foto, catálogo e ticket
com álbum de vinte itens. Registra Chromium, host, viewport 390 × 844, CPU 4×,
latência de 100 ms, download de 200.000 bytes/s e upload de 93.750 bytes/s.
Observa LCP, CLS e latência entre clique e conteúdo/paint confirmado. Console,
recurso com erro ou amostra ausente impedem concluir a coleta.

A coleta de 23/10/2026, às 14:58:20.989Z, usou Chromium 156.0.8078.4 no Windows
x64, Node 24.12.0, Intel i5-13420H/12 CPUs lógicas e cerca de 16 GB de RAM. O p75
LAB abaixo usa nearest rank em cinco amostras por cenário/cache:

| Cenário | LCP frio/quente (ms) | Maior CLS p75 LAB | Clique até conteúdo/paint frio/quente (ms) |
| --- | --- | --- | --- |
| Entrada/lojas | 2192 / 736 | 0,000342 | 330 / 308 |
| Lojinha → mural | 2260 / 636 | 0,001132 | 1206 / 1185 |
| Análise com foto | 2364 / 868 | 0,001117 | 706 / 836 |
| Catálogo → mimo | 2432 / 924 | 0,017795 | 1214 / 1145 |
| Ticket/álbum de 20 itens → foto | 2380 / 968 | 0,001114 | 1351 / 1191 |

LCP e CLS ficaram dentro das referências locais de 2,5 s/0,1 nesse perfil. As
ações têm custos diferentes e incluem navegação/consulta de bytes; sua latência
não é INP e não deve ser comparada como tal com 200 ms. LCP ≤ 2,5 s, INP ≤ 200 ms e
CLS ≤ 0,1 permanecem metas de RNF-08 para o p75 de acessos móveis reais; emulação
e um relatório local não comprovam esse resultado. O artefato privado tem
cinquenta amostras, dez agregados e zero erros de recurso.

## Limites e fechamento ainda necessário

A matriz de RNF-09 e [design §18.4](../../design.md) continua pendente em Chrome
Android e Safari iPhone, nas duas versões estáveis mais recentes com versões
exatas registradas, incluindo Android intermediário real. Câmera/galeria nativas,
permissão negada, retorno de autenticação/convite por mensageiro, áreas seguras,
reprodução nos aparelhos e leitor de tela real ainda não foram homologados.
MP4 reproduzido por Chromium local e arquivos escolhidos com `setInputFiles`
não substituem essas conferências.

Os comandos previstos foram executados em série, com a revisão dos achados e
repetição dos afetados: `npm run check`, `db:migrate:check`, `test:integration:t14`,
`web:test:e2e`, `test:web:real` e `local:restore:check`. A tabela distingue o
build anterior à correção dos editores do build final, conferido por E14/C14.
O commit deste registro vincula o candidato; logs e relatórios privados guardam
os instantes e resultados, sem publicação automática de conteúdo sensível.

Hospedagem, custos, publicação, CI remoto observado, tráfego móvel real e M6
têm condições próprias. A entrega web local não os aprova nem depende de
inventar evidência para eles.

## Operação persistente de T15

A base de T15 é o commit T14 `206e0ce68b91765328b13a27ac8028e61fa37307`.
A execução ocorreu depois desse commit, na branch `codex/t15-web-local`, com
Node 24.12.0 e as versões de T14. O banco nominal de desenvolvimento é
`meumimo_t14_dev`, em PostgreSQL local persistente; Auth/Storage pertencem à
stack `meumimo-t02`. O supervisor serve o build em loopback, sem seed ou
migração escondida. Comandos e correio estão em [operação local](local.md).

| Fronteira | Execução observada | Evidência privada |
| --- | --- | --- |
| Posse e instância concorrente | Porta ocupada preservada, segundo start e pedido de outro owner recusados; identidade nativa inclui PID, criação e executável. | `t15-process-green-1`, `t15-ownership-green-1` |
| Canal e trabalho em curso | Filhos reais recebem BOOT, emitem heartbeat durante unidade ocupada, drenam por STOP/desconexão e mantêm modo standalone. | `t15-heartbeat-green-1`, `t15-media-drain-1` |
| Saúde de dependências | PostgreSQL com papel runtime, Auth, Storage privado, Next e workers prontos; interrupções dos contêineres próprios de Auth, Storage e PostgreSQL deixam de ser prontas e são revertidas em `finally`, com duas leituras saudáveis após cada recuperação. | `t15-health-ready-1`, `t15-dependencies-2` |
| Falha operacional | Interrupção controlada do outbox próprio e sem fila é detectada; os demais filhos encerram e health não declara `ready`. | `t15-worker-failure-1` |
| Persistência web | Contas criadas/confirmadas por UI/Mailpit, convite, registro com foto, aprovação de 15 pontos e resgate de 10; após Ctrl+C e reinício, os mesmos IDs e bytes da foto persistem. Cancelamento devolve 10 uma vez. A limpeza final usa a guarda de UUID. | `t15-development-prepare-5`, `t15-development-verify-5`, `t15-development-cleanup-5` |
| Parada pelo terminal/comando | Ctrl+C enviado ao PTY produz STOPPED e nenhuma identidade nativa própria restante; PowerShell termina esse comando interrompido com código1. Após retomada e UI, `local:stop` confirma STOPPED com código0; manager também termina com código0. | `t15-terminal-stop-1`, `t15-stop-5`, `t15-local-web-5` |
| Item de mídia inválido | UI recebe MP4 inválido; DB registra `FAILED/file_invalid`, álbum oferece recuperação e três amostras de saúde continuam `ready`, sem alterar saldo/ticket. | `t15-dev-invalid-media-1`, `t15-dev-verify-4`, `t15-dev-cleanup-4` |
| Operação com cliente abortado | Duas leituras e cancelamento bloqueados na loja própria; clientes abortados, parada aguarda operação real, liberação produz um CANCEL e uma devolução, três filhos saem naturalmente. Grafo de bloqueio alcança o PID da fixture; lock de 1.660 ms. | `t15-request-drain-2` |
| Backup com manager vivo | Escritores drenados antes da captura, manager permanece vivo, recibos alheio e vencido são recusados; backup concluído e web pronta novamente. | `t15-maintenance-cycle-2` |

A segunda captura operacional tem ID
`4f66ac7e-d521-4111-97bd-57095ea2a5ee`, corte em
`2026-10-23T16:57:14.067Z`, conclusão em `16:57:34.565Z`, dezesseis componentes
e 437.310.933 bytes. A web voltou a `ready` em `16:58:38.817Z`, depois da
conferência do mesmo recibo vencido, e parou em `16:58:41.905Z`. A janela foi
solicitada pelo callback de QA; não representa doze horas decorridas. A função
de agenda prova o limite de doze horas, corte futuro inválido e startup devido.
Nenhum relógio do SO ou snapshot de recibo foi falsificado.

A primeira parada após UI falhou: Next reteve uma promise de transporte após
aborto de GETs de álbum/reação. O diagnóstico da instância antiga de QA e seu
encerramento explícito não contam como parada graciosa. A correção acompanha
eventos HTTP e, separadamente, operações de API admitidas em registro global
do processo; STOP fecha admissão e aguarda essas operações antes de Next/Prisma.
As duas drenagens reais e as paradas posteriores estão registradas. A quarta
parada encerrou todos os processos, mas revelou uma corrida da confirmação
CLI. O helper de confirmação agora relê o estado após observar o manager
ausente, exige o mesmo owner/identidades e prova a saída dos filhos. Cinco
regressões determinísticas passaram em `t15-stop-confirmation-green`;
`FAILED`, outro owner e filho vivo não são confirmação de parada.

Falha de item já persistida ou retry registrado conserva `counts.failed` com
rodada `OK`; exceção operacional propagada gera `FAILED`. O upload negativo
acima confere essa distinção. Os códigos standalone para itens falhos permanecem.

A revisão também encontrou ampliação indevida da limpeza development por
e-mail reutilizado. O ensaio com duas identidades sintéticas próprias falhou
antes da guarda e passou depois (`t15-fixture-identity-red/green`): a segunda
conta permaneceu íntegra e só o finally comprovado a removeu. Integração mantém
sua descoberta anterior; development exige UUID previamente rastreado.

Não houve reinício físico do computador, espera real de doze horas nem cópia
externa. A agenda só roda com máquina/supervisor ligados; startup confere
backup devido antes de novos escritores. O alcance continua web local, com
contas sintéticas e sem publicação ou homologação de aparelhos físicos.

Fechamento T15: `npm run check` passou com base7/web62, lint, tipos e build
em `t15-check-final-3`. A segunda regressão HTTP passou362/362, sem skips,
em `t15-http-full-2` (577.123,999 ms), após a correção de operações admitidas.
A guarda posterior de limpeza development teve RED/GREEN próprio e foi
exercitada no quinto ciclo web; o ramo de integração conserva o comportamento.
Não se declara uma segunda execução dos736 Chromium ou de REC14 em T15:
suas evidências e versões continuam descritas na seção T14.
