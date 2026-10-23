# T14–T15 — aceite integrado, recuperação e piloto

Estado: desenho e política local confirmados pelo idealizador em 22/10/2026,
com execução pelo método já autorizado depois de T13 concluída e commitada.
Não declara T11–T15 concluídas, restauração provada, aparelhos homologados,
CI remoto aprovado, metas atingidas ou publicação feita.
Builder check independente concluído, incluindo a política concreta de direitos:
nenhuma lacuna material adicional para planejar o aceite local.

## Recorte local confirmado

O idealizador pediu “quero testar a versão web primeiro” e PostgreSQL local
configurado, adiando hospedagem/custos e aparelhos físicos. Usar o PostgreSQL
Docker/Supabase da base D01, com dev/teste separados, dados persistentes e
startup/health de Next, mídia, outbox e serviços locais; não instalar outra
instância PostgreSQL Windows por hábito.

Estão confirmados para a operação local: RPO 24 h/RTO 8 h a comprovar, backup a
cada 12 h e até 30 dias, logs 7 dias, exportação 7 dias e a política abaixo de
exclusão por autoria, preservação financeira e supressões reaplicadas no restore.
Procedimentos usam fixtures sintéticas e informam os impedimentos para exclusão
completa; não autorizam excluir contas reais sem a solicitação correspondente.

T14 entrega o aceite web real e recuperação local; T15 entrega a versão local
para o teste do idealizador. As seções sobre publicação, matriz física, leitor
real e p75 real permanecem roteiro futuro explícito. Não bloqueiam a prévia
local nem podem ser declaradas aprovadas por ela. O plano executável é
[T14–T15 local](../plans/2026-10-22-t14-t15-local.md); não há nova aprovação do
plano a solicitar, nem autorização de hospedagem, custo ou publicação pública.

## Objetivo e dependências

Preparar uma versão identificável do produto para testar a web local e suas
evidências. T14 fecha o aceite web integrado e a recuperação local; T15 entrega
início/saúde e persistência para o idealizador. A publicação futura ainda exige
autorização específica de destino, serviços, custos e migrações reais.

A execução de T14 depende de T13 entregue e verificada, incluindo T11/álbum,
T12/relação e T13/administração. D08 e o recorte local D09 estão confirmados;
decisões de infraestrutura pública e aparelhos permanecem adiadas. A preparação documental
pode avançar antes dessas dependências; o aceite não pode usar substitutos
fictícios para funcionalidades P0 ainda ausentes.

Preservar Next/React/TypeScript, Node 24/npm, PostgreSQL/Prisma, Auth/Storage,
históricos, credenciais separadas e fronteiras de autorização existentes.
Não acrescentar PWA, push, retrospectiva, analytics de produto ou plataforma
genérica de suporte para fechar T14. Não importar os 240 pontos ou o estado da
demonstração para o ambiente do piloto.

## Base observada e abordagens

O checkout oferece gates locais, migrações com provas de evolução e suítes HTTP
com Auth/PostgreSQL/Storage reais locais. Playwright executa Chromium em 320/390
px; seus casos controlados de interface não provam autenticação. O workflow
define gates em Windows/Linux e integração em Ubuntu; sua existência não prova
uma execução remota aprovada.

Os scripts reconhecem tarefas até T10. `local:prepare:t14`, recuperação completa,
exportação e exclusão não são comandos existentes. O gateway de mídia valida
URL/bucket/prefixos locais e FFmpeg/ffprobe; não é uma configuração de produção.
Auth e Storage usam a stack `meumimo-t02`, enquanto os domínios usam bancos
separados. Criar outro banco de domínio não isola sozinho Auth nem os objetos.

| Abordagem considerada | Consequência |
| --- | --- |
| Aceite local e ensaio isolado primeiro, seguido de preparação do ambiente escolhido | Recomendada neste desenho: permite verificar dados, permissões e recuperação sem contratar nem publicar. Aparelhos e piloto continuam com gates próprios. |
| Montar primeiro a infraestrutura hospedada | Só faz sentido após escolher conta, orçamento e provedor; antecipa custos e acopla a validação a uma implantação ainda não autorizada. |
| Encerrar o aceite com checks automatizados | Insuficiente para câmera, Safari/iPhone, leitor de tela, recuperação completa e tráfego real; não atende o marco M6. |

A abordagem local foi confirmada pelo idealizador. A implementação do plano
aguarda somente suas dependências de execução; a hospedagem continua adiada.

## Estados de evidência e liberação

Cada item do aceite terá requisito, versão/SHA, ambiente, identidade fictícia ou
autorizada, método, resultado, data, responsável e referência ao artefato privado.
Usar os estados **não executado**, **passou**, **falhou** e **bloqueado**, com a
dependência de cada bloqueio. Um documento ou comando disponível não recebe
estado “passou” sem execução observada.

1. **Preparação local revisável:** contratos, matriz, procedimentos e versão
   candidata identificados; nenhuma liberação pública implícita.
2. **T14 local verificada:** dependências entregues, revisão de segurança/UI tratada,
   ciclo web real, laboratório e restauração executados. Matriz física/leitor/p75
   real permanecem pendentes; não declarar M6/mobile completo.
3. **T15 local entregue:** web persistente, startup/health e procedimentos locais
   conferidos, com comando e URL para o teste do idealizador; sem provedor público.
4. **Piloto autorizado:** autorização explícita do pacote final, seguida de
   execução, conferência e registro do resultado real.

RNF-08 pede metas no p75 móvel real. Antes de haver tráfego, T14 pode comprovar
laboratório e preparar a coleta; não pode declarar esse p75 atingido. Se o
idealizador liberar um piloto pequeno para obter a amostra, registrar essa
condição expressamente, mantendo o resultado real pendente. Não usar aprovação
de laboratório para marcar RNF-08 integralmente comprovado.

## Aceite integrado proposto para T14

Usar um lojista, dois participantes da mesma loja e uma conta que também possua
loja própria e participe de outras duas. Administração usa conta/grant separados,
com MFA. Fixtures são fictícias; pessoas reais só entram no piloto autorizado.

| Grupo e fontes | Evidência exigida |
| --- | --- |
| Conta e contextos — RF-01–04, RF-18/19; RNF-02/10 | Cadastro/verificação/recuperação, convite de mensageiro e troca de conta/loja/papel; links diretos, sessão expirada, suspensão e revogação sem conteúdo residual. Administração não recebe audiência privada de uma relação. |
| Conquistas e extrato — RF-05–09/17; RNF-03/04/19 | Manual com foto e automática, aprovação concorrente, contestação/complemento/anulação após gasto, ocorrência/fuso/snapshots e recomposição; saldo exato e devolução separada de ganho. |
| Catálogo e tickets — RF-10–13/23 | Saldo insuficiente, última unidade disputada, resposta perdida, catálogo editado/arquivado, combinado/realização/cancelamento, refund único, reposição explícita e histórico/conversa preservados. |
| Álbum e relação — RF-13–15/25/26 | Três fotos e dois vídeos, falha e retomada/publicação parcial explícita, novo lote após realização, remoção, miniatura/Range privados; bilhete versionado, reações, mural, preferências e destinos reais de novidades. |
| Gestão e administração — RF-16/20 | Lojinha e resumo com dados reais; dois participantes isolados, contadores coerentes, encerramento com pendências e ações administrativas com alcance/motivo/auditoria. |
| Uso móvel — RNF-01/06/07/09/20/21; design §18.4 | 320/390 px, texto 200%, teclado/foco/diálogos, alvos 44 px, movimento reduzido, áreas seguras e estados vazios/erro; câmera/galeria e reprodução nos aparelhos aprovados. |
| Operação — RNF-05/08/11–14/16/18 | Restauração, retenção, exportação/exclusão manual, diagnóstico sanitizado, migrações e recuperação de mudança falha; medições identificadas por método. |

Confrontar também cada linha de requisitos §5, registrando o caso e seu resultado;
a tabela acima agrupa a prova, sem substituir os cenários individuais. A linha
sobre retrospectiva futura exige preservar dados/tipos corretos, não construir
E04 ou declarar uma retrospectiva entregue.

Revisar os caminhos efetivos: Prisma com papel restrito, `app` fora da Data API,
Storage privado, gateway/miniaturas/Range e qualquer Realtime realmente usado.
Se Realtime não for usado, registrar isso e provar recuperação por consulta;
não adicionar uma integração apenas para preencher a matriz. Repetir corridas,
replay após timeout e acesso perdido também no fluxo integrado.

Os comandos já existentes que poderão compor a execução serial são `npm run
check`, `npm --prefix web run db:migrate:check`, `npm --prefix web run
test:integration:t10` e `npm run web:test:e2e`, com os preparos descritos em seus
documentos. T11–T14 devem fornecer seus comandos reais antes do plano final;
T10 não prova recursos posteriores. Não executar builds, typegen, integração
ou servidores simultâneos neste checkout nem reutilizar um processo alheio.

## Banco, identidade e Storage: backup e restauração

### Contrato proposto do conjunto recuperável

D08 já limita backups a 30 dias. Foi confirmado capturar conjuntos completos a cada 12 h
e antes de uma mudança real, com expiração em até 30 dias contados da captura.
A frequência dá margem ao RPO local confirmado de 24 h; não comprova essa meta nem
autoriza contratar espaço. Retenção, criptografia, custódia e exclusão devem
cobrir cópias, versões e arquivos temporários do próprio backup.

Cada conjunto recebe UUID, versão da aplicação, checksums das migrações, início,
corte consistente e fim, contagens e manifesto SHA-256/tamanho dos objetos.
Incluir:

- banco de domínio: estrutura, dados, `_prisma_migrations`, índices, FKs,
  checks, triggers, RLS, grants e sequência financeira/auditorias;
- identidades Auth necessárias para recuperar os mesmos UUIDs e o acesso,
  conforme procedimento suportado pela versão/provedor; referências a chaves e
  configurações recuperáveis ficam em custódia separada, sem valores no manifesto;
- configuração/metadados do Storage e **bytes dos objetos** necessários ao corte,
  com derivados, miniaturas e partes ainda válidas para recuperação de uploads;
- registro de exclusões/supressões e prazos D08, guardado também fora do conjunto
  que será restaurado, para não perder uma exclusão posterior ao backup.

Dump de metadados do Storage não contém os arquivos. Backup apenas de `app` não
recupera a identidade nem os objetos. A integração local deve respeitar a
separação entre o domínio e `postgres`/Auth/Storage; schemas gerenciados não
serão recriados com migrações Prisma da aplicação.

Para o primeiro ensaio, propõe-se uma janela de manutenção com dados sintéticos:
interromper novas escritas e uploads, aguardar transações/leases ou registrar sua
recuperação, pausar processamento, expurgo e consumidores; então capturar o
conjunto. A janela inclui as mutações Auth relevantes. Reabrir a origem após
validar a captura. Uma futura captura online só substitui esse método quando
provar consistência entre os bancos e objetos, sem supor atomicidade entre eles.

### Ensaio isolado e critério de recuperação

O plano de T14 deverá reservar uma stack/projeto de recuperação próprio, com
Auth, banco, bucket/prefixo, volumes, segredos, temporários e portas distintos.
Não sobrescrever dev/shadow/integração, não compartilhar Auth de teste e não
restaurar sobre a origem. Saídas de e-mail ficam no capturador local; nenhuma
mensagem de recuperação é enviada a terceiros durante o ensaio.

1. Registrar incidente/corte e conferir destino, espaço, versão e manifesto.
2. Restaurar estrutura/dados/identidades e objetos pelo procedimento adequado às
   versões selecionadas, preservando UUIDs e a cadeia de migrações aplicada.
3. Reaplicar exclusões/supressões posteriores ao corte e prazos já vencidos,
   antes de servir qualquer conteúdo. Mídia vencida fica oculta antes do expurgo.
4. Invalidar sessões/links temporários antigos e reavaliar grants administrativos;
   verificar nova autenticação/MFA. Não reabrir sessões ou acessos revogados por
   restaurar tabelas antigas. Segredos continuam separados por ambiente.
5. Reconciliar ledger, saldos, débitos/refunds, snapshots, versões/eventos, reservas
   de estoque, pendências/holds, conversas e vínculos. Conferir hashes dos bytes,
   objetos ausentes/excedentes e autorização dos derivados; divergência bloqueia
   a abertura. Comparações consideram as supressões reaplicadas.
6. Retomar workers com estados recuperáveis e provar replay/entrega sem duplicar
   pontos, tickets, mídia ou avisos. Executar o ciclo e as negações de acesso com
   os três papéis; verificar também upload pendente, mídia removida e conta excluída.
7. Registrar os tempos, perda efetiva, falhas e resultado. Descartar somente os
   recursos isolados identificados, mediante a autorização de limpeza aplicável.

RPO é a diferença entre o incidente e o último **corte consistente utilizável**,
comprovada por operações confirmadas de referência e objetos correspondentes;
não é a idade do arquivo mais recente. RTO começa na declaração do incidente e
termina quando dados, acesso, mídia e consumidores passam a conferência mínima;
inclui transferência, provisionamento e reaplicação das exclusões. Testar também
manifesto corrompido/objeto ausente e recusa de abrir uma recuperação incompleta.

RPO 24 h e RTO 8 h para banco **e arquivos** estão confirmados no recorte local.
Relatar valores medidos, volume e hardware. Um ensaio pequeno local não prova
esses tempos para outro volume, região ou provedor. Backups criptografados e
suas chaves devem ser recuperáveis por um operador autorizado além da máquina
original; local de custódia e responsável dependem de decisão do idealizador.

## Exportação, exclusão e disputa: procedimento manual proposto

D08 exige procedimento identificável antes do piloto, com histórico estruturado
até 24 meses após encerramento e resolução das pendências. Exclusão não altera
pontos/tickets nem apaga pendências automaticamente. Esses prazos são decisões
de produto; este desenho não lhes atribui fundamento legal.

Cada solicitação terá protocolo opaco, identidade verificada por reautenticação
ou recuperação segura da conta, escopo, operador, instante, motivo operacional,
decisão, pendências e comprovante de conclusão. Não solicitar senha, código MFA
ou foto privada por mensagem. Administração T13 não recebe acesso cotidiano ao
conteúdo de relações por atender uma solicitação.

**Exportação:** propõe-se pacote criptografado com JSON/CSV legíveis, datas/fuso,
perfis/vínculos, registros e snapshots, extrato com origens/compensações, tickets,
eventos e conteúdos/mídias aos quais aquela pessoa tem direito de acesso.
Incluir manifesto e explicar arquivos já removidos/expirados; não reter ou
recuperar um original expurgado para fabricar uma exportação. Excluir credenciais,
tokens, hashes de senha, dados de outras participações e diagnósticos internos.
Fazer conferência de audiência no preparo e na entrega, que terá canal privado
aprovado, validade proposta de 7 dias e remoção da cópia de trabalho após entrega
ou expiração. Enviar o pacote exige autorização correspondente de comunicação.

**Exclusão/anonimização:** a proposta é encerrar o acesso da conta solicitante,
revogar sessões/links e ocultar imediatamente as mídias abrangidas, registrando
o pedido mesmo quando houver impedimento para concluir. Resolver pendências
pelo fluxo autorizado, sem marcar um ticket realizado, cancelar, perdoar saldo
ou transferir loja silenciosamente. Conta de lojista responsável por uma loja
ativa exige decisão sobre encerramento e suas pendências; transferência não é
um recurso implícito do MVP.

Concluída a análise, propõe-se remover a identidade de login e substituir a
identificação exibida por “Conta removida”, conservando os identificadores
opacos e o mínimo estrutural necessário à relação e à reconciliação no prazo
D08. Textos, legendas, bilhetes e mídias abrangidos pelo pedido devem ter uma
decisão explícita por categoria, inclusive conteúdo compartilhado ou escrito
pela outra pessoa; trocar apenas `displayName` não prova anonimização.

O plano deverá mapear todas as entidades entregues até T13 e definir a operação
de supressão/expurgo permitida por cada contrato. Ledger e auditoria seguem
imutáveis para o runtime: não conceder UPDATE/DELETE amplo, desativar triggers
ou usar cascata genérica para executar direitos de dados. Se uma supressão de
conteúdo exigir representação/migração específica, ela terá desenho e revisão
próprios antes da implementação. A política concreta de autoria abaixo está
confirmada, mas sua implementação e os impedimentos precisam ser verificados;
supressão parcial não será apresentada como expurgo completo.

### Política concreta confirmada para T14 local

1. **Identidade:** revogar acesso/sessões, remover identidade de login e dados
   de contato da pessoa; representar os vínculos preservados por UUID opaca e
   “Conta removida”. Não restaurar seus logins/grants/sessões a partir de backup.
2. **Conteúdo da própria pessoa:** ocultar imediatamente seus textos livres,
   bilhetes, comentários, reações, legendas e mídias abrangidos pela solicitação.
   Expurgar bytes e conteúdo segundo D08, conservando proteção somente quando
   houver pendência identificada. Não chamar apenas a troca de nome de exclusão.
3. **Conteúdo da outra pessoa:** conservar somente no histórico privado da
   relação da respectiva autora, sem acesso da conta removida. Identificação
   estrutural da solicitante fica pseudonimizada; referências pessoais em texto
   compartilhado exigem análise manual por categoria, sem prometer anonimização
   automática de texto ou conceder acesso cotidiano ao administrador.
4. **Núcleo financeiro e obrigações:** preservar valores, UUIDs, vínculos de
   compensação, estados e datas mínimos para reconciliar saldo/ticket pelo
   prazo D08, sem conteúdo livre dispensável. Não apagar registros pendentes,
   marcar realização ou gerar cancelamento/refund por causa do pedido.
5. **Representação de supressão:** projetar tombstones identificáveis na leitura
   e comandos operacionais estreitos para expurgo, com protocolo/auditoria e
   testes. Não desabilitar triggers nem conceder UPDATE/DELETE genérico. Um
   pedido com pendência ou conteúdo compartilhado ainda não decidido fica
   registrado como parcialmente concluído, com impedimento explícito.
6. **Restauração:** o registro mínimo de supressões, externo ao conjunto antigo,
   prevalece antes de abrir conteúdo restaurado. Provar a reaplicação e o
   expurgo dos conjuntos no limite de 30 dias. Não declarar exclusão completa
   enquanto as categorias abrangidas ainda estiverem pendentes.

Esta política está confirmada para T14 local; não representa orientação legal
nem autorização para excluir contas reais. A prova local usa somente fixtures.

Guardar um registro mínimo e protegido dos escopos excluídos para reaplicação
em qualquer restore; não guardar o conteúdo removido nesse registro. Conservá-lo
enquanto existir conjunto capaz de ressuscitar os dados, verificando a expiração
das cópias em até 30 dias. Provar backup→exclusão→restore: a pessoa e seus arquivos
não reaparecem e o saldo/ticket continuam reconciliáveis.

**Disputa após realização:** propõe-se protocolo manual pelo canal de suporte,
com autenticação da pessoa, ticket/relação e relato mínimo; preservar o estado
terminal e os eventos. O operador solicita informações pela própria relação ou
por acesso específico autorizado e auditado, sem acesso administrativo implícito.
Não prometer reabertura ou refund fora do contrato. Uma solução que exija novo
efeito financeiro demanda decisão e desenho próprios, antes de executar SQL.

## Diagnóstico, laboratório e aparelhos

Os logs locais existentes e códigos genéricos de erro não constituem um sistema
de observabilidade homologado. Propõe-se diagnóstico estruturado com instante,
versão, processo, código estável, correlação opaca, duração e contagens. Não
registrar corpos, queries com UUIDs privados, nomes de arquivo, tokens, e-mails,
bilhetes, motivos, conversas ou bytes de mídia. Diagnóstico identificável e
relatórios ficam privados; resumos sanitizados podem referenciar sua evidência.

Proposta inicial de operação: acompanhar saúde de aplicação/Auth/Storage,
consumidores e processamento; idade do aviso mais antigo, tentativas/falhas,
originais próximos de 24 h, expurgos atrasados, idade do conjunto recuperável e
espaço/custo. Aviso com mais de 5 min, backup com mais de 18 h ou original com 22 h
acionam revisão humana proposta. Não apagar fila para parecer saudável.
Retenção local confirmada de logs técnicos: 7 dias, com acesso restrito.
Alertas externos/canais e serviços de monitoramento permanecem adiados em D09.

Em laboratório, usar build de produção e mídia sintética representativa,
incluindo álbum com 20 itens e histórico paginado. Registrar máquina, navegador,
cache frio/quente, perfil de CPU/rede, versão, rota como modelo sem identificador
privado e ações medidas. Propõem-se cinco repetições por rota/ação crítica:
entrada, Lojinha, análise com foto, catálogo/ticket e álbum/player. Registrar
LCP/CLS e latências de interação; TBT ou tempo de teste não substituem INP.
Distribuição e p75 de laboratório serão rotulados como laboratório.

Preparar coleta mínima de Web Vitals móveis reais, sem texto/foto/identidade ou
URL privada, somente após aprovar finalidade, destino, acesso, retenção e custo.
Informar período e amostra por métrica; INP exige interações elegíveis. Ausência
de amostra suficiente permanece “sem evidência”, sem substituir por um score.
Metas canônicas: LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 no p75 real. Isto é diagnóstico
de qualidade P0, separado dos eventos de produto P1 de E03.

A matriz proposta D09 contempla as duas versões estáveis mais recentes de
Chrome Android e Safari iPhone, com versões exatas na data do ensaio e ao menos
um Android intermediário físico. O idealizador indica os aparelhos disponíveis;
registrar modelo, sistema, navegador e como cada versão foi coberta, sem tratar
emulação Chromium ou engine WebKit de teste como Safari no iPhone.

Conferir TalkBack/Chrome Android e VoiceOver/Safari iPhone com fala real: rótulos,
ordem, estados, validação e diálogo/foco. Verificar câmera/galeria, cancelamento
e permissão negada, orientação/derivados, vídeo com/sem áudio, áreas seguras,
teclado, retorno do Auth e convite aberto do mensageiro. Guardar roteiro e
resultado, sem capturar dados pessoais na evidência. Sem aparelhos/leitor, esses
itens ficam bloqueados; árvore ARIA, screenshots e testes locais são adicionais.

## Preparação revisável de T15

O pacote final deverá conter SHA/tag candidata, lockfiles e versões, artefato de
build identificável, migrações e compatibilidade revisadas, variáveis por
processo/ambiente com referências aos segredos, inventário dos serviços, custos,
responsáveis, backup verificado e procedimento de falha/retorno. Não executar
comandos locais de bootstrap/migração contra uma URL remota: suas allowlists e
credenciais foram feitas para testes locais.

Vercel aparece na arquitetura como opção futura para Next. Isso não hospeda por
si só o processo persistente de mídia/FFmpeg nem decide banco/Auth/Storage,
e-mail de autenticação, backup ou suporte. Apresentar duas topologias para
decisão: web gerenciada mais worker separado e Supabase hospedado; ou host Node
persistente para web/worker mais Supabase hospedado, com maior operação própria.
Validar capacidade, versões, preços e recuperação na documentação oficial dos
provedores escolhidos antes de fechar o plano. Não há seleção ou preço novo
verificado neste desenho.

| Processo | Separação a preservar na preparação |
| --- | --- |
| Next | `APP_ORIGIN`, `SUPABASE_URL`, chave publicável, `DATABASE_URL` restrita e `AUTH_RATE_LIMIT_SECRET`; nenhuma service role/conexão de migração no build/runtime do Next. |
| Outbox | Conexão restrita e configuração mínima; consumidor supervisionado, retry e encerramento correto, sem endpoint público de drain. |
| Mídia | Credencial Storage privilegiada separada, banco restrito, bucket/prefixo por ambiente, temporários, FFmpeg/ffprobe e canal privado autenticado; nunca publicar diretamente a porta local 4311. |
| Migração/backup/direitos | Identidade operacional separada e escopo aprovado; segredos no serviço de custódia, sem valores em Git ou logs. |

Conferir TLS, cookies Secure, callbacks/PKCE, origem/CSRF, proxy/IP confiável e
limites globais dos endpoints públicos; pooling, recursos do worker, disco,
segredos/MAC e rotação; Data API/Storage/Realtime e headers/cache privado.
Não copiar chaves, domínio, usuários fictícios ou políticas locais por suposição.

A mudança autorizada terá janela e operador, backup consistente validado,
verificação inequívoca do ambiente, migração serial revisada, aplicação/worker
compatíveis e smoke do ciclo com contas autorizadas. Retornar à versão anterior
só é opção se ela for compatível com o esquema já aplicado e isso tiver sido
provado. Caso contrário, manter manutenção e usar correção adiante ou restore
aprovado com sua perda explícita; não executar rollback destrutivo automático.

Iniciar com grupo e duração definidos pelo idealizador. Acompanhar falhas,
filas, retenção, backup, uso/custo e medições disponíveis; registrar contatos,
responsável e critério para suspender entradas do piloto. Incidente de acesso
cruzado ou inconsistência financeira bloqueia novas operações afetadas e exige
diagnóstico/recuperação antes da retomada. Não anunciar disponibilidade ou metas
de desempenho como resultados medidos antes da evidência correspondente.

## Decisões concretas para o idealizador

Infraestrutura pública e aparelhos continuam adiados. Recuperação, direitos e
prazos locais estão confirmados no recorte inicial; a tabela preserva os temas
para uma futura disponibilização externa. A confirmação não aprova
automaticamente contratação, mensagens, exclusões de contas reais ou publicação.

| Decisão | Proposta revisável e informação necessária |
| --- | --- |
| Provedor e conta | Escolher a topologia acima e informar contas/projetos sob controle do idealizador, região e operador. Confirmar também worker, e-mail Auth e custódia de backup; Vercel/Supabase hospedados são candidatos, não contratações. |
| Orçamento | Definir teto mensal em reais para web+DB/Auth+Storage/egress+vídeo+e-mail+backup/monitoramento e quem recebe alertas. Proposta: alertar em 70%/90% do teto e revisar antes de expandir o piloto; não assumir gratuidade. |
| Ambientes e URLs | Separar desenvolvimento/teste, homologação e piloto, sem dados reais em previews. Informar domínios/URLs e responsável por DNS/TLS; aprovar callbacks e origem de cada ambiente. Nenhuma URL pública foi reservada. |
| Suporte e disponibilidade | Proposta: um canal privado controlado pelo idealizador, atendimento assistido em dias úteis 09h–18h America/Sao_Paulo, responsável substituto e escalonamento. Escolher canal/endereço, janela e objetivo de disponibilidade antes de anunciar o piloto; não há plantão ou SLA confirmado. |
| Aparelhos | Confirmar matriz de duas versões Chrome Android/Safari iPhone, Android intermediário, modelos/OS disponíveis e quem executará TalkBack/VoiceOver, câmera e convite por mensageiro. Registrar lacunas concretas. |
| Recuperação | Local confirmado: RPO 24 h/RTO 8 h, captura a cada 12 h, retenção máxima 30 dias e custódia cifrada. O ensaio ainda precisa comprovar o resultado; custódia/provedor externos continuam adiados. |
| Direitos e disputa | Política local por autoria/preservação financeira/supressões confirmada e exportação com validade 7 dias; resultado parcial precisa identificar impedimentos. Canal externo e qualquer ação sobre conta real dependem da autorização correspondente. |
| Diagnóstico e medição | Logs locais 7 dias confirmados; laboratório primeiro. Destino externo, Web Vitals reais, publicação e custos permanecem adiados. |
| Entrada do piloto | Indicar participantes/lojas autorizados, limite e duração, critério de pausa e quem autoriza retomada. Aceitar expressamente eventual coleta de p75 ainda pendente não transforma a meta em resultado atingido. |

Após as decisões, atualizar as fontes canônicas e preparar os planos de T14 e
T15 com comandos reais, alvos nominais, donos e verificações. A autorização final
de implantação será solicitada sobre esse pacote concreto, após os trabalhos
locais autorizados e as dependências estarem conferidos.

## Fontes e limites deste reconhecimento

Fontes lidas: [roadmap T14/T15](../plans/2026-10-22-roadmap-implementacao.md),
[requisitos](../../../requisitos.md) §§4–6.1/D08/D09,
[design](../../../design.md) §§16/18.4, [arquitetura](../../../arquitetura.md),
[onboarding](../../onboarding.md), [identidade](../../identity-local.md),
[mídia](../../media-local.md), [outbox](../../relation-local.md),
[qualidade](../../quality.md) e [setup](../../setup.md).
Também foram lidos o workflow Quality, package scripts, configuração Playwright,
drivers locais/integração, configuração de mídia e retenção existentes.

Houve somente leitura e redação deste arquivo: nenhum serviço, banco, teste,
build, ação externa, publicação, alteração de código/configuração ou commit.
Não foram consultados preços/APIs de hospedagem novos. Detalhes de execução
dependentes de versão/provedor exigirão Context7/documentação oficial na etapa
correspondente, sem enviar código privado ou segredos.
