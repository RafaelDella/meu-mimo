# Meu Mimo — requisitos consolidados para implementação

Atualizado em 22 de outubro de 2026. Complementa `design.md` e usa o protótipo em `prototype/` como referência de apresentação.

## 1. Objetivo e escopo

Permitir que uma pessoa crie uma lojinha privada, ofereça atividades e mimos, convide participantes e acompanhe suas conquistas. Cada participante acumula pontos naquela loja e resgata tickets para combinar a realização dos mimos.

O protótipo orienta o visual, a linguagem e a navegação simples. A aplicação real inclui conta, várias lojas, aprovação de registros, fotos privadas, interações, notificações e persistência compartilhada entre dispositivos.

**P0:** necessário para fechar o ciclo principal com consistência e privacidade. **P1:** melhoria que pode entrar depois do primeiro piloto. Prioridades são uma proposta de implementação; requisitos não significam funcionalidades já construídas.

O MVP será mobile first para participante e lojista, com as tarefas administrativas essenciais também acessíveis pelo celular. Desktop complementa a experiência. Os critérios detalhados de tela, toque, teclado, câmera, acessibilidade e desempenho estão na seção 18.4 de `design.md`.

Decisões adicionais confirmadas: adotar **Prisma para acesso e migrações de estrutura do banco**, manter **histórico de pontos e de prêmios resgatados no MVP** e prever uma **retrospectiva futura inspirada na apresentação por cards do Spotify Wrapped**. A proposta técnica e os dados necessários estão em `arquitetura.md`.

## 2. Requisitos funcionais

| ID | Prioridade | Requisito e critério principal |
|---|---|---|
| RF-01 | P0 | **Conta única:** permitir autenticar, recuperar acesso e acessar todas as lojas e participações autorizadas sem criar contas separadas por papel. Escolha do provedor e mecanismo de login ainda será detalhada na arquitetura. |
| RF-02 | P0 | **Papéis por contexto:** lojista gerencia sua loja; participante realiza ações na loja que aceitou; administrador tem uma permissão separada. Nenhum cadastro público concede administração. |
| RF-03 | P0 | **Várias lojas:** criar e alternar entre N lojas próprias e N participações, com busca quando necessário. Trocar de loja atualiza dados, papel, filtros contextualizados e saldo juntos. |
| RF-04 | P0 | **Convite:** identificar loja e remetente, autenticar preservando o destino e exigir aceite. Evolução aprovada em 23/10/2026: código gerado de dez caracteres por convite, vários convites por loja, validade configurável/sem vencimento e limite de novas participações/ilimitado. Busca exata abre confirmação no Visor segmentado; buscar ou repetir acesso não consome uso. Preservar links legados, isolamento e ingresso único por conta/loja. Estados inválido, expirado, revogado, esgotado e legado já aceito têm orientação própria. |
| RF-05 | P0 | **Gestão de atividades:** cadastrar, editar e arquivar atividade com nome, descrição, pontos, frequência e aprovação manual/automática. O cadastro começa em aprovação manual. |
| RF-06 | P0 | **Registro de conquista:** participante envia atividade com legenda e foto opcionais, escolhida da câmera ou galeria. Exibir a regra de aprovação e os pontos antes do envio. |
| RF-07 | P0 | **Análise:** lojista aprova, contesta, anula ou reabre análise conforme o estado. Contestação/anulação exige motivo e fica no histórico. Participante pode responder no registro. |
| RF-08 | P0 | **Crédito:** registro manual aguarda aprovação sem aumentar o saldo disponível. Registro automático pode gerar crédito na confirmação do envio. Repetição da mesma operação nunca gera novo crédito. |
| RF-09 | P0 | **Histórico de pontos:** toda entrada, saída e devolução tem valor, origem, data, autor e identificação da ação. Filtrar por período e tipo, paginar e abrir o registro/ticket de origem. Disponível e pendente ficam separados e pertencem àquela participação. |
| RF-10 | P0 | **Catálogo de mimos:** lojista define nome, descrição, recadinho opcional, custo, categoria, imagem e disponibilidade. Vitrine mostra saldo suficiente ou quantos pontos faltam. |
| RF-11 | P0 | **Resgate:** confirmar custo e saldo restante; emitir ticket e descontar pontos aprovados com estoque e saldo validados na mesma operação. Falha não pode deixar débito sem ticket. |
| RF-12 | P0 | **Realização do mimo:** acompanhar ticket aguardando combinar, combinado, realizado, cancelamento solicitado e cancelado/estornado. Cancelamento confirmado devolve pontos uma única vez. |
| RF-13 | P0 | **Interações privadas:** lojista e participante podem reagir e comentar nos registros e tickets daquela relação. Reagir não equivale a aprovar ou realizar uma entrega. |
| RF-14 | P0 | **Bilhete individual:** lojista escreve no detalhe da pessoa; participante acessa pelo coração e cartão da Lojinha. Mensagem de outro participante nunca é mostrada. Nova versão volta a aparecer como não lida. |
| RF-15 | P0 | **Notificações no app:** registrar novidades relevantes, autor, loja, estado de leitura e destino. Abrir o destino exige autorização atual e troca explícita de contexto quando necessário. |
| RF-16 | P0 | **Navegação do participante:** Lojinha, Atividades e Meus mimos. Extrato fica acessível pelo potinho e por Meus mimos; vitrine na Lojinha. |
| RF-17 | P0 | **Resumo das atividades:** diferenciar atividades disponíveis, registros em análise e aprovações. Progresso diário só tem percentual quando existir rotina diária definida; atividades semanais usam sua própria unidade. |
| RF-18 | P0 | **Privacidade entre participantes:** cada pessoa vê seus registros, saldo, fotos, bilhete, tickets e interações. O lojista vê as relações de sua loja; outros participantes não veem esses dados. |
| RF-19 | P0 | **Pausa e encerramento:** interromper novas ações conforme estado da loja/participação, preservando consulta ao histórico e tratamento dos tickets existentes segundo a política definida em `design.md`. |
| RF-20 | P0 | **Administração mínima:** listar contas e lojas por metadados e executar pausa da plataforma por loja ou bloqueio de segurança por conta, com motivo e auditoria. Pausa da plataforma é independente da pausa do lojista; bloqueio retira leitura privada da própria conta. Administração não concede vínculo nem leitura do conteúdo das relações. |
| RF-21 | P1 | **Push:** oferecer permissão de maneira contextual, respeitar preferências por loja, agrupar interações e abrir o destino autorizado. O uso pelo navegador funciona sem ativar push. |
| RF-22 | P1 | **Meta de mimo:** marcar uma recompensa como objetivo para mostrar progresso em destaque, preservando a possibilidade de escolher outros mimos. |
| RF-23 | P0 | **Histórico de mimos:** consultar todos os resgates da participação, com nome e custo da ocasião, data, ticket, situação e linha do tempo de realização/cancelamento. Filtrar por período e situação; arquivar ou editar o mimo não altera tickets anteriores. |
| RF-24 | P1 | **Retrospectiva:** apresentar uma sequência de cards mobile com conquistas, pontos de atividades, resgates, mimos realizados e destaques de um período. Separar as lojas, respeitar dados privados e as regras de correção/cancelamento. Detalhes visuais e periodicidade ficam para evolução. |
| RF-25 | P0 | **Álbum do mimo resgatado:** lojista adiciona várias fotos e vídeos a um ticket, revisa e publica os momentos para o participante daquele resgate. Permitir novos envios posteriores, legendas opcionais e remoção de mídias próprias com confirmação. Cada resgate tem seu álbum separado. |
| RF-26 | P0 | **Rever momentos:** participante e lojista abrem a galeria pelo ticket, ampliam fotos, reproduzem vídeos com controles e interagem na conversa do ticket. Publicação de um conjunto de mídias gera um aviso agrupado para o destinatário. |

## 3. Regras que o protótipo precisa adaptar

### 3.1. Pontos e saldo inicial

Os 240 pontos, atividades de 30/20/15 pontos e preços de 120/300/180/450 pontos são exemplos da demonstração. Eles não fixam a economia das lojas reais.

Confirmado em D03: nova participação começa com saldo zero. Se houver bônus de boas-vindas no futuro, ele precisa ter regra explícita, autor/origem e movimento no extrato. Nunca iniciar contas reais com saldo vindo do estado de demonstração do navegador.

Somente o servidor confirma créditos, débitos, saldo e estoque. Preferências visuais podem ficar no navegador; pontos e tickets não dependem da integridade de `localStorage`.

### 3.2. Frequência, datas e fuso

O protótipo permite uma conclusão diária no horário de São Paulo. A aplicação deve usar fuso da loja e frequência da atividade, com horários de referência persistidos no servidor.

Antes de implementar a recorrência, decidir: início da semana, prazo de registro retroativo, quais estados ocupam uma ocorrência e como uma mudança de fuso afeta períodos em andamento. A limitação diária deve continuar correta na virada do dia e em aparelhos com fuso diferente.

### 3.3. Contestação e estorno

Manter as regras propostas em `design.md`, seção 13: contestação não remove por si só um crédito existente; anulação efetiva gera estorno. Mostrar situação do registro e situação dos pontos separadamente.

Proposta para pontos já gastos: preservar tickets emitidos, permitir saldo negativo por estorno e impedir novos resgates sem saldo suficiente. Essa escolha é um ponto de revisão de produto antes da implementação.

### 3.4. Privacidade de bilhetes e recadinhos

O recadinho do mimo é conteúdo do catálogo compartilhado com os participantes da loja. O bilhete é individual e pertence a uma relação participante–loja.

O estado não lido pertence à versão da mensagem e deve acompanhar a conta entre dispositivos. Abrir a versão 1 não pode marcar uma versão 2 recém-enviada como lida. Não incluir confirmação de leitura para o lojista no MVP.

Desenho T12 confirmado: texto simples obrigatório de até 2.000 caracteres
Unicode, com uma versão atual por relação e versões anteriores preservadas.
Pausa permite envio; encerramento mantém consulta e leitura exata. A leitura
de uma novidade não confirma a leitura do bilhete. Rascunhos e texto não ficam
em URLs ou armazenamento do navegador.

Reações permitidas: ❤️, 👏, 🥹, 🔥, 😂 e 🌷. Cada pessoa mantém uma escolha por
item; trocar/remover é uma intenção versionada, sem efeitos financeiros.
Comentários e reações da mesma pessoa, destinatário, loja e item são agrupados
em janelas de cinco minutos. Silenciar interações ou avisos automáticos afeta
somente o contador; preserva histórico, leitura e decisões financeiras.

### 3.5. Templates e personalização

“Mexer o corpinho”, “Ler algumas páginas”, “A dois”, “Pra você” e “Surpresas” são bons pontos de partida para conteúdo e categorias. Nomes de pessoas, atividades, valores, recados e identidade da loja devem vir de dados editáveis, sem depender de Rafael/Júlia ou de uma única loja fixa.

### 3.6. Histórico e base para retrospectiva

- O extrato registra movimentos confirmados. Um envio aguardando aprovação aparece como pendência separada, sem inventar uma entrada disponível.
- Correções financeiras geram movimentos compensatórios vinculados à origem; o fluxo normal da aplicação não reescreve nem remove movimentos anteriores.
- Guardar nome e pontuação da atividade na ocasião do envio e nome/custo/instruções do mimo na ocasião do resgate. Mudanças no cadastro não reescrevem o passado.
- Datas de atividade, envio, aprovação, crédito, resgate, realização e estorno têm significados próprios. A retrospectiva deve usar a data adequada a cada métrica e indicar período, fuso e data de corte.
- Ganhos por atividade, devoluções de resgate, reversões de crédito e eventuais bônus são tipos distintos. Reembolso não conta como uma nova conquista.
- “Mimos resgatados” e “mimos realizados” são contagens diferentes. Cancelamentos e anulações precisam ser considerados, sem apagar seus eventos do histórico.
- A retrospectiva começa por participação em uma loja. Uma visão pessoal futura de várias lojas não pode somar moedas de pontos com regras diferentes como se fossem um saldo único.
- Preservação de histórico e snapshots obedece à política de retenção/exclusão definida para o produto; não deve ser interpretada como retenção ilimitada de dados ou fotos.

### 3.7. Fotos e vídeos dos mimos

- São memórias de um resgate específico, distintas das fotos usadas para registrar uma atividade e das imagens do catálogo.
- O lojista publica os momentos; o participante daquele ticket pode visualizá-los e reagir/comentar. Outros participantes da loja não têm acesso.
- Publicação de mídia é opcional e independente da realização do mimo. Falha de upload não impede tratar o ticket e não altera saldo ou estoque.
- Mídias ficam privadas durante seleção, envio e validação; só itens prontos explicitamente publicados aparecem ao participante.
- Limites D07: vinte itens ativos, dez por lote; fotos até 10 MB e vídeos até 100 MB/60 s, nos formatos e derivados confirmados na seção 6.1.
- T11 confirmado: legenda opcional de até 500 caracteres Unicode; legenda e ordem ficam imutáveis após publicar. Cancelado permite consulta/remoção própria, sem novos envios ou publicação.
- O primeiro encerramento de loja/participação inicia os doze meses de calendário do álbum. Pausa não inicia prazo. Pendência protege momentos existentes após o prazo, mas não permite novos; realizar/cancelar libera proteção e aplica o prazo original, sem renová-lo.
- A retrospectiva futura pode oferecer a seleção desses momentos. Compartilhamento externo requer ação explícita e prévia revisável; nada é publicado automaticamente.

### 3.8. Administração e restrições independentes

T13 usa consultas administrativas com busca de até 80 caracteres Unicode e
paginação 20/50. Motivo obrigatório de até 500 caracteres Unicode é normalizado
em NFC; leitura 120/minuto e mutação 10/minuto por conta são independentes.
A interface e o servidor impedem bloquear o próprio administrador ou conta
com grant ativo. Grants e recuperação de MFA permanecem no procedimento
separado. Contratos e estado de verificação em [T13 local](docs/admin-local.md).

Pausa da plataforma conserva análise, complemento e obrigações de tickets e
álbuns existentes. Retomar uma causa não remove a pausa do lojista nem reabre
encerramentos. Bloqueio de segurança retira o acesso privado da própria conta,
preservando dados e o acesso legítimo da outra pessoa. Nenhuma dessas ações
altera pontos, estoque, tickets ou vínculos.

### 3.9. Direitos e operação local

O recorte T14–T15 confirmado prioriza a web com PostgreSQL persistente local.
O uso diário mantém supervisão em primeiro plano, saúde real, parada própria
e backup a cada doze horas enquanto a máquina e o processo estiverem ligados.
Ao reiniciar, um backup devido é tratado antes de novas escritas. A parada
conserva os volumes e aguarda as operações admitidas; não encerra um processo
alheio nem inicia nova operação de domínio durante a drenagem.
Exportação/exclusão exige identificação manual da pessoa e protocolo próprio;
o CLI de prova aceita somente contas sintéticas rastreadas. Remover autoria
oculta texto e identidade daquela pessoa, retira acesso à mídia e preserva o
conteúdo legítimo da outra autora. Não altera saldo, estoque ou tickets.
O resultado de exclusão é parcial quando originais imutáveis, pendências ou
backups permanecem; não anunciar eliminação física completa.

Exportações têm validade de sete dias. Backups têm retenção máxima de trinta
dias, intervalo operacional de doze horas, RPO de 24h e RTO de 8h como metas
do ensaio local. A restauração reaplica supressões posteriores ao corte antes
de abrir a cópia. Metas e execução observada são registradas separadamente em
[aceite](docs/pilot/acceptance.md) e [recuperação](docs/pilot/recovery.md).
Publicação, custos, canal público de suporte e homologação em aparelhos reais
permanecem adiados pelo idealizador.

## 4. Requisitos não funcionais

| ID | Prioridade | Requisito e verificação |
|---|---|---|
| RNF-01 | P0 | **Mobile first:** atender aos critérios de `design.md`, seção 18.4. Cadastrar atividade, analisar foto, convidar, resgatar e realizar mimo devem funcionar sem computador. |
| RNF-02 | P0 | **Autorização por recurso:** validar conta, loja, participação, papel e estado no servidor, incluindo acesso a arquivos, links diretos e ações administrativas. Não confiar em botão oculto ou identificador enviado pelo navegador. |
| RNF-03 | P0 | **Operações consistentes:** crédito, débito, emissão de ticket, reserva de estoque e estorno precisam de transações, restrições de unicidade e controle de concorrência apropriados. |
| RNF-04 | P0 | **Repetição segura:** reenvio após toque duplo, timeout, recarregamento ou tentativa de entrega de evento retorna o resultado existente sem duplicar efeitos. |
| RNF-05 | P0 | **Mídia privada:** armazenar fotos de registros com acesso autorizado e temporário quando necessário; validar formato/tamanho, corrigir orientação e remover metadados de localização na imagem disponibilizada. |
| RNF-06 | P0 | **Conexão instável:** preservar o formulário quando possível, consultar operações incertas e mostrar claramente envio, falha e sucesso confirmado. Créditos/resgates dependem de confirmação online no MVP. |
| RNF-07 | P0 | **Acessibilidade:** rótulos, foco, semântica, estados anunciados, contraste, toque e texto ampliado. Painéis precisam de fechamento acessível, foco contido quando modal e retorno ao elemento de origem. |
| RNF-08 | P0 | **Desempenho:** medir metas de LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 no percentil 75 dos acessos móveis. Entregar fotos/stickers em tamanhos adequados; não carregar fotos originais grandes em listas. |
| RNF-09 | P0 | **Compatibilidade:** Chrome Android e Safari iPhone como matriz inicial, com versões e aparelhos definidos antes do piloto. Testar câmera/galeria, retorno de autenticação e abertura de convite via mensageiro. |
| RNF-10 | P0 | **Isolamento de estado:** caches, rascunhos, notificações e preferências contextualizadas devem considerar conta e loja. Sair da conta ou trocar de usuário não pode revelar conteúdo da sessão anterior. |
| RNF-11 | P0 | **Auditoria e diagnóstico:** registrar alterações de status, pontuação, anulação, cancelamento e ações administrativas, com autor, horário e motivo quando aplicável. Erros técnicos não devem registrar fotos, tokens ou conteúdo privado de conversas. |
| RNF-12 | P0 | **Recuperação:** definir backup e restauração de banco e arquivos, tolerância de perda e prazo de recuperação. Verificar restauração antes de depender do ambiente real. |
| RNF-13 | P0 | **Ambientes e mudanças:** separar desenvolvimento, teste e produção; versionar esquema do banco e prever recuperação de uma publicação com falha. Dados de demonstração ficam separados dos reais. |
| RNF-14 | P0 | **Limites técnicos:** definir tamanho de foto, caracteres, paginação e frequência de requisições. N lojas de negócio não significa listas, uploads ou solicitações sem limites técnicos. |
| RNF-15 | P1 | **PWA:** instalação opcional, comportamento de atualização e cache definidos. Arquivos públicos podem ser cacheados; conteúdo privado exige política explícita de isolamento e descarte. |
| RNF-16 | P0 | **Ciclo de vida dos dados:** definir retenção de fotos, arquivos sem registro associado, histórico, exportação e exclusão. Esse contrato deve estar definido antes de disponibilizar exclusão de conta/dados. |
| RNF-17 | P1 | **Métricas de produto:** medir criação de loja, convite aceito, primeiro registro, primeira aprovação, primeiro resgate e realização do mimo sem coletar texto ou fotos desses conteúdos. |
| RNF-18 | P0 | **Prisma e migrações:** versionar modelos e migrações de estrutura com Prisma, revisar alterações e aplicar o fluxo apropriado a desenvolvimento e produção. SQL complementar, como permissões, índices especiais e políticas, fica na mesma cadeia de migrações da aplicação. |
| RNF-19 | P0 | **Base histórica consultável:** persistir eventos e movimentos com loja, participação, origem, autor, datas e versão/ordem quando necessário. Indexar consultas por participação, período e estado; evitar consultas de histórico sem paginação. |
| RNF-20 | P0 | **Upload múltiplo confiável:** progresso, validação e falha por arquivo; suporte a retomada apropriada para arquivos maiores e conexão instável; identificação segura de tentativa para evitar mídia publicada em duplicidade. Revalidar autorização ao retomar. |
| RNF-21 | P0 | **Entrega de fotos e vídeos:** arquivos em armazenamento privado, metadados e vínculos no banco; formatos e reprodução testados no Android/iPhone; miniaturas e carregamento sob demanda. Não presumir que armazenar um vídeo garante conversão ou compatibilidade de reprodução. |

Referências das metas e critérios de qualidade: [Core Web Vitals](https://web.dev/articles/vitals), [áreas seguras e experiência PWA](https://web.dev/learn/pwa/app-design), [alvos de toque ampliados](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html). Os valores são metas propostas, sem alegação de desempenho ou conformidade já verificados na aplicação final.

## 5. Critérios de aceite dos fluxos críticos

| Cenário | Resultado esperado |
|---|---|
| Abrir convite sem conta e concluir autenticação | Retornar ao convite correto e, após aceite, entrar na loja convidada |
| Mesma pessoa gerencia uma loja e participa de duas | Alternar contextos sem misturar papéis, saldos, bilhetes ou tickets |
| Dois participantes da mesma loja | Cada um acessa somente seu histórico; o lojista consegue tratar as duas relações |
| Enviar registro manual com foto | Mostrar pendência; manter saldo disponível; liberar pontos somente na aprovação |
| Enviar registro automático | Confirmar crédito único e permitir contestação posterior |
| Aprovar duas vezes, inclusive simultaneamente | Um crédito no extrato e um resultado consistente para ambas as tentativas |
| Pedir complemento e receber nova foto | Preservar conversa e histórico, sem criar outra ocorrência ou crédito acidental |
| Anular crédito já gasto | Mostrar confirmação com impacto, estornar uma vez e preservar tickets existentes conforme a regra proposta |
| Resgatar com saldo insuficiente | Não emitir ticket nem debitar; mostrar o que falta e acesso às atividades |
| Duas tentativas de resgate com saldo para apenas uma | No máximo uma é concluída, sem ultrapassar o saldo permitido |
| Dois participantes disputam o último item | Emitir somente o ticket que recebeu a reserva; a outra tentativa não sofre débito |
| Conexão cai depois de confirmar um resgate | Ao retornar, consultar o resultado e recuperar o ticket, sem nova cobrança de pontos |
| Cancelar o mesmo ticket duas vezes | Uma devolução de pontos; histórico preservado |
| Enviar bilhete só para Ana | Ana recebe mensagem e indicador de não lido; Bia não acessa o conteúdo |
| Enviar nova versão enquanto a anterior é aberta | A nova continua não lida até ser efetivamente aberta |
| Negar câmera | Oferecer galeria ou continuação sem foto conforme o MVP |
| Trocar de conta no mesmo aparelho | Não exibir saldo, rascunho privado ou foto da conta anterior |
| Abrir notificação de outra loja | Validar acesso, indicar a loja e abrir o recurso correspondente |
| Usar em 320 px, com teclado e texto ampliado | Concluir o fluxo com conteúdo legível e ações alcançáveis |
| Editar ou arquivar um mimo depois do resgate | Ticket antigo mantém seu nome e custo originais e continua acessível no histórico |
| Receber devolução de um resgate cancelado | Extrato mostra estorno; retrospectiva futura não considera a devolução um ganho por atividade |
| Filtrar histórico por uma loja e período | Retornar somente os movimentos e tickets autorizados daquele contexto, com paginação consistente |
| Gerar retrospectiva futura com ticket cancelado | Distinguir resgate, cancelamento e realização segundo a versão de cálculo, sem inflar mimos realizados |
| Publicar três fotos e dois vídeos no café da manhã de Ana | Somente Ana e o lojista acessam aquele álbum; outro resgate do mesmo café tem álbum independente |
| Um vídeo falhar durante envio de várias mídias | Preservar itens enviados, permitir nova tentativa e publicação explícita dos prontos, sem duplicar mídias ou notificações |
| Adicionar momentos depois de realizar o mimo | Álbum atualizado sem novo débito, alteração de estoque ou mudança indevida de estado |
| Remover uma mídia publicada | Atualizar o álbum e futuras seleções de retrospectiva sem apagar o ticket ou modificar pontos |

## 6. Decisões ainda necessárias

Este levantamento de M0 é atualizado pelo registro abaixo; decisões confirmadas e propostas restantes têm estados distintos.

1. Acesso, recuperação/verificação e proteção administrativa: confirmados em D02.
2. Atividades/mimos compartilhados para toda a loja: confirmados em D03; ofertas exclusivas não entram neste MVP.
3. Frequência, início da semana, ocorrência e ausência de retroatividade: confirmados em D04/T07. Mudança de fuso somente antes do primeiro registro/ticket.
4. Confirmação das regras de saldo negativo e tratamento de contestação após resgate.
5. Regras de estoque quando um resgate é cancelado, especialmente se o mimo já tiver sido preparado.
6. Limites e formatos de fotos, prazo de retenção e política para registros anulados e relações encerradas.
7. Regras de exclusão de conta/dados com histórico compartilhado e tickets pendentes.
8. Procedimento para contestar a realização de um mimo ou pedir suporte sobre uma interação.
9. Push no primeiro piloto ou depois, além dos canais de recuperação de conta.
10. Metas de disponibilidade, recuperação e custo operacional compatíveis com o piloto.
11. Periodicidade, critérios de elegibilidade, compartilhamento opcional e tratamento de correções nas retrospectivas já geradas.
12. Limites de mídias por álbum, formatos, tamanho e duração dos vídeos, processamento, retenção e regras de remoção de memórias de tickets cancelados.

Não é necessário transformar todas essas decisões em telas novas. Muitas definem validações, mensagens, permissões e comportamento do servidor.

### 6.1. Registro de decisões de M0

Em 22/10/2026, o idealizador confirmou D01: Next.js/React/TypeScript em `web/`, PostgreSQL com Prisma e Supabase para Auth/Storage, desenvolvimento e testes locais, sem contratação ou publicação. As seleções de versões e os limites da verificação estão em `arquitetura.md`, seção 1.1.

As recomendações abaixo foram preparadas pelo orquestrador com análise independente de produto. **D02, D03 e os limites D04 de autenticação, T04 e T07 foram confirmados pelo idealizador em 22/10/2026.** D07 e D08 foram confirmadas em T06. D05 e os limites de análise/complemento de T08 foram confirmados em 22/10/2026. D06, custo/estoque e textos do catálogo foram confirmados em T09. Os limites do bilhete e da administração e o desenho de operação local T14–T15 também foram confirmados; a publicação e sua infraestrutura continuam adiadas. Registrar uma pendência com sua dependência atende M0; não autoriza implementar a política por suposição. O runtime local foi preparado após autorização do idealizador.

| Decisão | Proposta concreta para revisão | Responsável pela decisão e tarefa dependente |
|---|---|---|
| D02 · acesso | Confirmada em 22/10/2026: e-mail/senha com e-mail verificado, recuperação de senha e retorno a caminho interno validado do convite. Administração provisionada fora do cadastro, com papel verificado no servidor e MFA/TOTP obrigatório para acesso administrativo. | Idealizador; implementação local em T02; evidências no plano da fundação |
| D03 · loja e convite | Confirmado: um responsável; lojista não pontua na própria loja; atividades/catálogo compartilhados; saldo inicial zero. T04 mantém links legados revogáveis, uso único/sete dias, sem vínculo prévio a e-mail. Evolução aprovada em 23/10/2026: novos convites com código gerado, validade/cota independentes, opções sem vencimento/ilimitado e padrão sete dias/um uso; política imutável, revogação após usos preserva vínculos. Participante existente abre sem consumo; proprietário acessa gestão. Pausa impede gerar/aceitar convites, registros e resgates e pode ser retomada. | Idealizador; T04, T07, T09; desenho e plano de convites por código de 23/10/2026 |
| D03 · encerramento | Confirmado: resolver registros em análise/contestação antes de encerrar loja ou participação. Tickets emitidos não impedem encerramento e continuam acessíveis para realização/cancelamento. Loja/participação encerrada não reabre por convite em T04. | Idealizador; T04 e T07–T10 |
| D04 · períodos | Confirmado em T07: semana de segunda-feira 00h até a segunda seguinte no fuso da loja; sem retroatividade no MVP. Única = uma ocorrência por atividade/participação; diária = uma por data local; semanal = até N no período, com N inteiro entre 1 e 100 e possibilidade de vários registros no mesmo dia. | Idealizador; T07–T08 |
| D04 · ocorrência/fuso | Confirmado: alterar fuso somente antes do primeiro registro/ticket; depois, bloquear no MVP. Envio recebido ocupa ocorrência, inclusive contestado/anulado; complemento/reabertura usam o mesmo registro. Editar frequência considera todos os recebidos no período da nova regra, sem zerar consumo. | Idealizador; configuração T04 e recorrência T07 |
| D04 · limites | Confirmados: nomes até 80 caracteres, apresentação 280, descrições 1.000, paginação padrão 20/máximo 50 e ordenação estável. Comentários T05 e legenda simples/imutável T07 até 500 caracteres Unicode. Pontos por atividade inteiros de 1 a 1.000.000. Confirmados em T08: motivos e texto de complemento até 500 caracteres Unicode; uma resposta por solicitação, texto ou foto opcional com ao menos um. Confirmados em T09: custo inteiro de 1 a 1.000.000; estoque inteiro de 0 a 1.000.000 ou ilimitado, uma unidade por ticket; categoria até 80, recadinho até 500 e instruções até 1.000 caracteres Unicode; ilustrações locais selecionáveis. Confirmados em T10: combinado e motivos até 500 caracteres Unicode; data civil opcional, revisões auditadas e realização direta nos estados abertos. Confirmado em T11: legenda opcional do álbum até 500 caracteres Unicode, imutável após publicação. Confirmado em T12: bilhete obrigatório de até 2.000 caracteres Unicode, versões e leitura exata; implementação verificada localmente em T12. | Idealizador; T04–T12 conforme recurso |
| D04 · requisições | Confirmados: recuperação 3 pedidos/hora/destinatário e login 5 tentativas/minuto/conta+origem; T04 leitura 120/minuto e mutação 30/minuto por conta, com espera explícita. T06: 20 autorizações de arquivo/minuto/conta; partes usam limite de transporte separado. | Idealizador; T02/T04/T06 |
| D05 · correções | Confirmada em T08: contestação mantém crédito existente; anulação estorna uma vez o crédito vigente e admite saldo negativo. Reabrir volta à análise sem movimentar; só nova aprovação recompõe. Motivos CONTEST/VOID/REOPEN obrigatórios. Análise/complemento permitidos durante pausa; encerramento mantém consulta/replay autorizado. Snapshot e ocorrência preservados. Tickets preservados e novos resgates sem saldo suficiente bloqueados serão integrados em T09. | Idealizador; T08/T09 |
| D06 · tickets/estoque | Confirmada em T09: decrementar estoque na emissão. Cancelamento antes da realização devolve pontos uma vez; reposição de item limitado exige escolha explícita do lojista, desligada por padrão. Pedido em análise impede realizar; recusa motivada restaura estado anterior. Emissão pertence a T09; transições/devolução a T10. Disputa após realização segue o [procedimento manual](docs/pilot/data-rights.md), preservando estado terminal e financeiro; canal público adiado. | Idealizador; T09–T10 e procedimento T14 |
| D07 · mídia | Confirmada em T06: uma foto opcional por envio/versão de evidência; complemento preserva anteriores no histórico do mesmo registro. Álbum até 20 itens, até 10 por lote. Foto até 10 MB (10.000.000 bytes), JPEG/PNG/WebP; HEIC/HEIF rejeitados enquanto não comprovados. Entrega JPEG até 2.048 px e miniatura de 480 px, com orientação aplicada e sem EXIF/GPS. | Idealizador; implementação/prova local T06, integração T07/T08/T11 |
| D07 · vídeo | Confirmado em T06: até 100 MB (100.000.000 bytes)/60 s; entrada MP4/MOV e saída MP4/H.264/AAC quando houver áudio, até 1080p. Objetos/miniaturas privados; URL da aplicação de cinco minutos vinculada à sessão, com reautorização em cada leitura/retomada. Processo local separado aprovado; publicação parcial é integrada em T11. Prova sintética local não comprova Android/iPhone reais. | Idealizador; T06/T11; aparelhos/infraestrutura publicada ainda pendentes |
| D08 · retenção | Confirmada em T06: órfãos após 24h sem atividade; originais removidos até 24h após processamento; evidência por 180 dias desde a publicação, sem expurgo durante análise/contestação; álbum durante relação ativa e até 12 meses de calendário após encerramento. A origem informa proteção/encerramento na mesma transação; sem domínio integrado, proteção conservadora. Histórico estruturado até 24 meses após encerramento e resolução de pendências; backups até 30 dias; operação completa em T14. | Idealizador; T06/T11/T14 |
| D08 · direitos e pendências | Confirmada em T06: procedimento manual identificável de exportação/exclusão antes do piloto, em T14; não apagar pendências automaticamente. Ocultar mídia removida imediatamente e expurgar conforme política; exclusão não muda pontos/ticket. T14 define anonimização e reaplicação de exclusões ao restaurar. Prazos são decisões de produto, sem apresentação como exigência legal. | Idealizador; T14 e integração da proteção pela origem |
| D09 · operação | Confirmadas metas locais de RPO de 24h e RTO de 8h para banco/arquivos; [ensaio sintético](docs/pilot/recovery.md) registrou 77,838s/96,593s nesta máquina. Homologação nas duas versões estáveis mais recentes de Chrome Android/Safari iPhone e Android intermediário real permanece adiada. Orçamento, disponibilidade remota, provedor e canal público de suporte continuam sem decisão; nenhum custo autorizado. | Idealizador; T14/T15 |
| D10 · retrospectiva | Periodicidade, elegibilidade, corte, regeneração e compartilhamento continuam para evolução. Capturar os dados históricos necessários desde o MVP. | Idealizador; E04, sem bloqueio de T01 |

Os limites devem ser validados nos testes do pacote responsável e podem ser ajustados antes da decisão. Nenhum valor desta tabela altera os dados ou as regras da demonstração.

## 7. Ordem proposta de implementação

1. **Fundação:** projeto Next.js, identidade e componentes do protótipo, PostgreSQL com Prisma e migrações versionadas, autenticação, autorização por loja e ambiente de desenvolvimento/teste.
2. **Lojas e convite:** criação, troca de contexto, gestão de participantes e aceite de convite.
3. **Conquistas:** cadastro de atividade, foto, aprovação/contestação/anulação e extrato consistente.
4. **Mimos:** catálogo, resgate transacional, tickets, combinado, realização, cancelamento e álbum privado com várias fotos/vídeos.
5. **Relação:** bilhete individual, comentários, reações e notificações no app.
6. **Piloto:** administração mínima, critérios mobile, isolamento, falhas de rede, concorrência, recuperação e medições de desempenho.
7. **Evolução:** PWA completa, push, objetivos de mimo, retrospectiva, planos e personalização adicional conforme uso real.

## 8. Papel dos arquivos existentes

| Arquivo | Uso |
|---|---|
| `design.md` | Fonte de experiência, identidade visual, navegação, telas e estados |
| `requisitos.md` | Requisitos e critérios para implementar/testar os comportamentos |
| `prototype/` | Referência interativa e fonte de assets, tokens e composição de apresentação |
| `arquitetura.md` | Proposta técnica, decisão de Prisma, migrações, histórico e preparação da retrospectiva |

O protótipo continua sendo uma demonstração de navegador. A presença de uma interação ou teste local nele não comprova sincronização entre pessoas, autorização, concorrência, upload privado ou persistência real do produto.
