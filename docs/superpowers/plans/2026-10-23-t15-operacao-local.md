# T15: operação local após o fechamento de T14

> **Para execução:** aplicar as skills disponíveis de planejamento, revisão e verificação, com o despacho em ondas do Vibe Coding Toolkit. Usar agentes nativos, um escritor por arquivo e revisão independente somente leitura; não instalar equivalentes ausentes apenas por causa de um template.

**Goal:** abrir a web persistente do idealizador em 4301, com supervisão em primeiro plano, saúde real, parada própria e backup programado, conservando os dados.

**Architecture:** complementar a tarefa6 do plano anterior com um supervisor Node, três filhos identificados e callbacks operacionais. Recursos, credenciais, backup e retenção reutilizam T14. O lifecycle não importa health/maintenance; root conecta os callbacks definidos abaixo.

**Tech Stack:** Node 24, Next 16.4.2/React 19.3.1, PostgreSQL 17/Prisma 7, Supabase local, Docker Linux, Sharp/FFmpeg e Playwright existentes. Não acrescentar dependências ou serviços.

**Spec:** [desenho aprovado](../specs/2026-10-22-t14-t15-piloto-design.md), [tarefa6 e restrições globais](2026-10-22-t14-t15-local.md). Desenho, recorte local e execução já foram aprovados. Este complemento fixa interfaces de implementação; não inicia outra aprovação nem altera o aceite T14.

## Restrições e pré-condição

- Root fecha, verifica e comita T14 antes de qualquer código, teste, configuração, processo ou banco T15. Somente este plano pode ser escrito antes desse commit.
- Três escritores, um dono por arquivo. Autores trabalham nos fontes; root executa Git, generate/typegen, builds, testes, processos e banco em série. Todo JS/TS tem no máximo350linhas. Não dividir artificialmente arquivos para contornar esse limite.
- Lifecycle é `t14_runtime`; workers é `rights_data`, depois de encerrar o trabalho MFA T14; health/backup/manutenção é `archive`, depois de encerrar sua revisão T14. Root mantém dispatcher, package, testes, documentos e integração.
- Alterações MFA, ciclo QA, snapshots de catálogo e álbuns em revisão no fechamento T14 continuam naquele marco; não viram escopo T15.
- Desenvolvimento usa projeto `meumimo-t02`, banco `meumimo_t14_dev`, prefixo `t14-development`, Next4301 e mídia4311. Tudo que publica porta continua em127.0.0.1. Restauração4320/4321 permanece separada.
- Não migrar, gerar cliente, criar build, resetar, semear domínio ou apagar dados silenciosamente no startup. Configuração/migração/build ausente exige comando explícito e código acionável.
- Não matar ocupante de porta, PID reaproveitado ou processo desconhecido. Ctrl+C e `local:stop` encerram somente manager/Next/mídia/outbox próprios; a stack Docker e seus volumes permanecem.
- Next e outbox recebem runtime filtrado completo. Service role, migração e configuração operacional nunca entram no Next nem no snapshot público de saúde.
- RPO24h/RTO8h, intervalo de backup12h e retenção30dias/exports7dias/logs7dias permanecem os aprovados. Host desligado não executa agendamento. Não alegar cópia remota, egress bloqueado, dispositivos homologados ou disponibilidade contínua.

## Focos de revisão

1. PID Windows reutilizado ou arquivo/porta de outra execução: negar parada e apropriação, preservando os processos alheios.
2. Manager vivo durante backup: provar quiescência dos escritores sem falsificar stopped, enfraquecer guardas ou aninhar o mesmo maintenance.lock.
3. Next responde200, mas DB/Auth/Storage ou worker falhou: health não pode declarar ready; seus próprios clientes não podem impedir a captura fria.
4. Vídeo/expurgo/entrega em andamento: heartbeat continua, parada não inicia novo trabalho e conclusão/lease permanecem recuperáveis.
5. Máquina desligada por mais de12h: verificar/capturar backup devido antes de iniciar qualquer escritor e preservar estado claro em falha.

## Arquivos e dependências disjuntas

| Dono | Criar | Adaptar |
| --- | --- | --- |
| Lifecycle | `web/scripts/pilot/{process-contract,process-identity,processes,next-host}.mjs` | Nenhum arquivo de outro escritor |
| Workers | `web/scripts/pilot/worker-heartbeat.mjs` | `web/scripts/{media-worker,outbox-worker}.mjs`; `web/src/server/media-worker/{processing,retention,cleanup,temporary}.ts`; `web/src/server/outbox/worker.ts` |
| Health/operação | `web/scripts/pilot/{health,health-probes,maintenance,local-diagnostics}.mjs` | `web/scripts/pilot/{backup,backup-source,backup-manifest,retention,inventory}.mjs`, somente para os contratos desta tarefa |
| Root | Testes de contrato/posse/saúde/backup e os ensaios explícitos de `web/tests/integration/pilot/*-check.mjs`; `web/scripts/pilot/development-web-check.mjs`; `web/src/server/request-lifecycle.ts` | `web/scripts/pilot/local.mjs`, `web/package.json`, `web/src/server/http.ts`, helpers de fixture, `docs/pilot/local.md` e índices canônicos |

Lifecycle usa cinco módulos: contrato/validação pura; identidade observada pelo SO; custódia de posse/arquivos; supervisão/controle; hospedagem Next. Workers e operação importam o contrato, sem alterá-lo. Ajustes de assinatura são reconciliados neste documento pelo root antes de mudar um consumidor; não manter variantes concorrentes.

## Contratos compartilhados

As formas abaixo são notação de tipos para módulos `.mjs`, não novos arquivos TS. Strings ISO são UTC canônicas; UUIDs são minúsculos. `environment` nunca é serializado.

```ts
type Role = 'next' | 'media' | 'outbox';
type ProcessIdentity = { pid:number; creationTime:string; executable:string };
type Phase = 'STARTING' | 'READY' | 'MAINTENANCE' | 'DRAINING' | 'STOPPED' | 'FAILED';
type WorkerPhase = 'starting' | 'idle' | 'busy' | 'draining' | 'failed' | 'stopped';
type Round = { code:'OK'|'FAILED'; completedAt:string; durationMs:number; counts:Record<string,number> };
type Child = { identity:ProcessIdentity; state:'starting'|'running'|'stopping'|'stopped';
  heartbeat:null|{receivedAt:string; sequence:number; phase:WorkerPhase; lastRound:Round|null} };
type Receipt = { formatVersion:1; owner:string; operationId:string; kind:'BACKUP';
  manager:ProcessIdentity; issuedAt:string; expiresAt:string };
type SupervisorSnapshot = { formatVersion:1; task:'t14'; mode:'development'; owner:string;
  manager:ProcessIdentity; phase:Phase; status:'starting'|'ready'|'maintenance'|'stopping'|'stopped'|'failed';
  updatedAt:string; children:Partial<Record<Role,Child>>; maintenance:Receipt|null };
type HealthReport = { formatVersion:1; checkedAt:string;
  status:'ready'|'degraded'|'unavailable'|'maintenance'|'stopped';
  components:Record<'postgres'|'auth'|'storage'|'next'|'media'|'outbox',
    'ready'|'busy'|'unavailable'|'stale'|'stopped'|'not_checked'>;
  codes:string[]; agesMs:{backup:number|null; outbox:number|null; media:number|null; purge:number|null} };
type Launch = { buildId:string; environments:Record<Role,Record<string,string>> };
type GateContext = { owner:string; signal:AbortSignal };
type RetentionCounts = {backups:number;exports:number;logs:number;preserved:number};
type MaintenanceResult = { code:'LOCAL_MAINTENANCE_COMPLETE';
  backup:{id:string;consistentAt:string}; retention:{status:'COMPLETE'|'PARTIAL';counts:RetentionCounts} };
type BackupReport = {id:string;status:'COMPLETE';startedAt:string;consistentAt:string;
  completedAt:string;expiresAt:string;counts:{components:number;bytes:number}};
type OperationalGates = {
  preflight(context:GateContext):Promise<Launch>;
  maintenanceDue(context:GateContext & {now:Date}):Promise<boolean>;
  maintain(context:GateContext & {receipt:Receipt}):Promise<MaintenanceResult>;
  health(context:{snapshot:SupervisorSnapshot|null;now:Date;signal:AbortSignal}):Promise<HealthReport>;
};
```

`process-contract.mjs` exporta `HEARTBEAT_MS=5000`, `STALE_MS=30000`, `BACKUP_INTERVAL_MS=43200000`, `DRAIN_TIMEOUT_MS=300000`, `assertSnapshot(value)`, `assertReceipt(value)`, `assertParentMessage(value)` e `assertWorkerMessage(value)`. Asserções retornam o valor validado ou lançam erro com código fixo. Rejeitar campos extras, versões/papéis/fases desconhecidos, números inválidos e strings livres onde há enum. Status de snapshot é a tradução fixa de phase: STARTING→starting, READY→ready, MAINTENANCE→maintenance, DRAINING→stopping, STOPPED→stopped, FAILED→failed.

`Round.counts` aceita somente inteiros não negativos e as chaves: `processed`, `failed`, `orphaned`, `expired`, `originalsPurged`, `temporaryPurged`, `purged`, `delivered`. Next usa contagens vazias. Retenção usa exclusivamente RetentionCounts; log possui allowlist própria abaixo. Não transportar IDs de domínio, caminhos de arquivos de pessoas, mensagens de erro, SQL ou conteúdo privado.

Health usa somente os códigos `SETUP_REQUIRED`, `STACK_UNAVAILABLE`, `DATABASE_UNAVAILABLE`, `AUTH_UNAVAILABLE`, `STORAGE_UNAVAILABLE`, `NEXT_UNAVAILABLE`, `WORKER_STALE`, `WORKER_FAILED`, `BACKUP_REQUIRED`, `BACKUP_FAILED`, `MAINTENANCE`, `PROCESS_IDENTITY_MISMATCH`, `DRAIN_TIMEOUT`. Lista vazia é permitida. Tempos desconhecidos são null, não zero. Ready exige todas as dependências obrigatórias prontas; busy saudável não é falha.

## Ownership, arquivos e protocolo IPC

Arquivos fixos privados: `supervisor.json`, `supervisor.lock`, `supervisor-stop.json` na `custodyRoot`. Só `supervisor.json` é o snapshot; não criar outras autoridades em `processes.json`/`local-handle.json`. Arquivos legados existentes continuam sendo conferidos e nunca são apagados por conveniência. O lock de instância é separado de `maintenance.lock` e não envolve chamadas que já adquirem esse último.

`process-identity.mjs` exporta `observeProcess(pid):Promise<ProcessIdentity|null>` e `sameProcess(expected):Promise<boolean>`. No Windows, observar PID, StartTime e caminho do módulo principal por consulta nativa restrita ao PID numérico. `creationTime` é token opaco `win32:<ticks UTC>`; no Linux, `linux:<boot_id>:<startticks>`. A precisão nativa é preservada textualmente, sem Date.parse e sem usar o horário JavaScript de spawn. Normalizar somente a comparação do caminho Windows. Não registrar CommandLine; argv não recebe credenciais. Ausência é diferente de erro de observação: erro recusa ação. PID/criação divergente jamais autoriza sinal.

O manager escreve o lock com criação exclusiva, confirma sua identidade e a de cada ChildProcess que acabou de criar e publica snapshot atômico pela custódia existente. O arquivo não contém ambientes. Antes de parar filho, a referência ChildProcess ainda deve ser própria e a identidade observada deve coincidir. Snapshot STOPPED só é publicado após confirmar saída de todos os filhos; só então liberar o lock próprio.

Se houver lock/snapshot anterior: instância viva recusa segundo start; PID reaproveitado não é morto. Estado abandonado só pode ser arquivado após provar que o manager e todos os filhos daquela identidade terminaram e que as portas nominais estão livres. Arquivo desconhecido ou observação ambígua é preservado e reportado. Desconexão IPC faz os filhos drenarem e sair, evitando dependência de um parent morto.

O canal IPC existe somente nos três filhos geridos, via `stdio:['ignore','pipe','pipe','ipc']`:

```ts
type ParentMessage = {formatVersion:1;type:'BOOT';owner:string;role:Role}
  | {formatVersion:1;type:'STOP';owner:string};
type WorkerMessage = {formatVersion:1;type:'HEARTBEAT'|'STOPPED';owner:string;
  role:Role;pid:number;sequence:number;phase:WorkerPhase;lastRound:Round|null};
```

BOOT é enviado após observar a identidade do filho. Em modo gerido, nenhum servidor/claim começa antes de BOOT válido; timeout10s recusa inicialização. O manager confere UUID, papel, PID esperado e sequência crescente pelo canal daquele filho. STOPPED exige phase stopped. Heartbeat é enviado imediatamente após BOOT e a cada5s por timer independente da rodada. O manager usa relógio monotônico para silêncio; snapshot guarda receivedAt para a CLI separada. Data futura ou idade negativa na leitura externa não pode produzir ready.

`local:stop` usa arquivo de pedido privado, evitando nova porta/serviço de controle. Pedido exato: `{formatVersion:1,owner,requestId,action:'STOP',requestedAt}`. Escrita exclusiva; pedido existente só é reutilizado se seu formato completo for válido e pertencer ao mesmo owner e ação. Manager observa a cada1s, desde o claim, inclusive enquanto aguarda preflight. A CLI confirma identidade do manager antes do pedido e aguarda confirmação de parada, sem enviar kill por PID de arquivo. Seu timeout é `2*DRAIN_TIMEOUT_MS+10000`; devolve `LOCAL_STOP_PENDING`, não sucesso. O manager só remove o pedido que confirmou e lhe pertence. Pedido anterior de owner já encerrado só é arquivado com a mesma prova exigida para o snapshot abandonado.

## Interfaces dos três escritores

### Lifecycle

`processes.mjs` exporta:

```ts
runSupervisor(options:{gates:OperationalGates;
  onStatus:(event:{code:'LOCAL_STARTING'|'LOCAL_READY'|'LOCAL_MAINTENANCE'|
    'LOCAL_STOPPING'|'LOCAL_STOPPED'|'LOCAL_FAILED';origin?:'http://127.0.0.1:4301'})=>void|Promise<void>;
  onDiagnostic?:(value:unknown)=>Promise<void>
}):Promise<{code:'LOCAL_STOPPED'}>;
readSupervisor():Promise<SupervisorSnapshot|null>;
requestStop():Promise<{code:'LOCAL_STOPPED'|'LOCAL_ALREADY_STOPPED'|'LOCAL_STOP_PENDING'}>;
```

`runSupervisor` permanece em primeiro plano. Ordem: claim→preflight→janela inicial de manutenção→mídia→outbox→Next→health real→LOCAL_READY com URL fixa. A manutenção inicial roda mesmo se o backup ainda estiver fresco; seu callback pode conservar o conjunto válido. Não iniciar nenhum filho escritor antes de retornar esse gate. Falha terminal drena os filhos, emite LOCAL_FAILED e rejeita com código fixo; só libera seu lock depois de confirmar todas as saídas. Se algum filho continuar vivo, preservar ownership e estado de falha em vez de declarar STOPPED.

Após ready, executar health a cada5s e verificar maintenanceDue; não sobrepor callbacks. Parada solicitada suspende novos probes/timers e interrompe a admissão de Next; drena Next antes de encerrar a mídia que suas requisições usam. Depois drena mídia/outbox. Não matar por timeout: publicar falha/drenagem pendente, conservar ownership e recusar captura ou novo start enquanto houver filhos vivos.

Na janela periódica, drenar os filhos, aguardar todos os probes/clientes fechados, publicar MAINTENANCE com receipt e chamar maintain. O manager fica vivo, sem clientes PostgreSQL. Recomeçar os filhos com as mesmas configurações só após callback concluído e dependências verificadas. Ao retornar de manutenção, health deve confirmar ready novamente antes da URL pronta. Stop recebido durante captura espera seu finally e não interrompe arbitrariamente Docker/arquivos.

`next-host.mjs` é somente um entrypoint gerido, iniciado com cwd=web e ambiente Next filtrado. Usa a API de servidor customizado da versão instalada: `next({dev:false,dir:webRoot,hostname:'127.0.0.1',port:4301})`, `prepare`, `getRequestHandler` e servidor HTTP próprio. STOP/desconexão fecha admissão HTTP, aguarda requisições e executa `app.close()` antes de sair. Usa `openWorkerChannel('next')`. Ler o guia shipped/Context7 correspondente antes de implementar; `startServer` interno retorna apenas distDir e não fornece close para esse contrato. Não inicia build/typegen nem outro Next CLI que escape do ownership.

Na implementação final, término HTTP é `finish`/`close`/`error`, separado da
operação real. O framework instalado reteve uma promise após aborto de GETs
de álbum/reação, mesmo com HTTP fechado e sem I/O ativo. Root acrescentou
`openRequestLifecycle():{closeAdmission,drain}` e
`trackRequestOperation<T>(()=>Promise<T>):Promise<T>` em
`src/server/request-lifecycle.ts`; `handleRoute` registra cada operação no
global opcional compartilhado pelo host e bundle. O STOP fecha admissão
sincronamente, recusa unidades tardias com 503 e aguarda todas as admitidas,
inclusive rejeições. O registro permanece fechado até a saída. O host aguarda
HTTP, domínio, `app.close`, Prisma e então `finish`. Não usa timeout/kill para
liberar uma operação em curso; o runtime sem supervisor mantém seu comportamento.

Supervisor consome stdout/stderr de todos os filhos para evitar bloqueio dos pipes. Descarta linhas comuns e stderr bruto. Só uma linha JSON UTF-8 de até4096bytes, com exatamente os cinco campos T13, pode ser enviada a onDiagnostic; o callback ainda valida valores. Callback opcional ausente descarta a linha. Root conecta o escritor seguro abaixo; nenhum conteúdo bruto entra no snapshot ou no log. Aguardar onStatus, sem deixar promessas de persistência sem tratamento.

### Workers

`worker-heartbeat.mjs` exporta:

```ts
openWorkerChannel(role:Role):{
  managed:boolean; initialized:Promise<void>; signal:AbortSignal;
  setPhase(phase:Exclude<WorkerPhase,'stopped'>):void;
  round(result:{code:'OK'|'FAILED';durationMs:number;counts:Record<string,number>}):void;
  requestStop():void; finish():Promise<void>
};
```

O helper possui timers e handlers SIGINT/SIGTERM/disconnect. `requestStop` aborta o signal e muda para draining; não cancela a unidade em curso à força. `finish` só é chamado após fechar servidor, banco e subprocessos próprios; envia STOPPED se conectado, limpa timers/handlers e desconecta IPC. Sem canal IPC, initialized resolve imediatamente e os comandos standalone/--once/--purge-once/--manual conservam comportamento e stdout existentes.

Adicionar `signal?:AbortSignal` às opções de `processMediaBatch`, `deliverOutboxBatch`, `expireMediaBatch`, `purgeOriginalMediaBatch`, `purgeRemovedMediaBatch`, `purgeTemporaryMediaBatch` e a `cleanupMediaBatch(options={})`. Conferir aborto antes de cada novo claim/unidade e antes de iniciar cada fase de cleanup. Finalizar a unidade corrente e seu finally; não limpar lease de tentativa alheia nem alterar dinheiro. Propagar o signal entre as funções, preservando defaults e resultados atuais.

Os scripts usam canal.initialized antes de iniciar, signal no loop e round após cada rodada. Timer de heartbeat permanece independente durante Sharp/FFmpeg/I/O. Retorno normal da rodada emite OK, preservando counts.failed para itens cuja falha ou nova tentativa foi registrada. Exceção operacional propagada emite FAILED, sem mensagens/IDs. Arquivo inválido tratado não derruba toda a web. Modos standalone mantêm stdout e exitCode1 por itens falhos. getDb continua exigindo o ambiente completo de getServerEnv: APP_ORIGIN, SUPABASE_URL, DATABASE_URL, SUPABASE_PUBLISHABLE_KEY e AUTH_RATE_LIMIT_SECRET. Não relaxar getServerEnv nem passar apenas DATABASE_URL ao outbox.

### Health, backup e manutenção

`maintenance.mjs` exporta `createLocalGates():OperationalGates`. Construção é sem efeito operacional; cada callback abre/fecha seus recursos em finally. `health.mjs` exporta `localHealth({snapshot,now=new Date(),signal}):Promise<HealthReport>`; createLocalGates.health delega a essa função. Nenhum callback importa processes.mjs; consumo de identidade/validação pura é permitido.

Preflight exige estado T14, domínio dev, migrações acabadas compatíveis com arquivos, papel runtime restrito, BUILD_ID, ferramentas de mídia e volumes/inventário nominais. Pode reiniciar contêineres existentes, parados e comprovadamente da stack aprovada, usando IDs/labels/imagens/mounts conferidos. Se faltarem estado, volume ou identidade segura, indicar local:start/local:prepare/migração/build explícitos; não recriar silenciosamente estrutura. Depois atualizar/conferir inventário pelo contrato T14. Não adotar recurso alheio nem parar Docker no stop normal.

Launch usa `pilotRuntimeEnvironment(readState('t14'),'development')`, nunca state.runtime de integração diretamente. `environments.next` e `.outbox` partem de `runtimeEnvironment` completo e filtrado; `.media` acrescenta somente mediaEnvironment('development','t14'). Cada filho usa cwd=web e --conditions=react-server quando importa os módulos de servidor. Segredos operacionais ficam no processo de operação/mídia apropriado, não no snapshot.

Health é somente leitura, não inicia stack, não migra e não gera fixtures. Snapshot ausente/parado retorna stopped sem declarar serviço pronto. Confere manager/filhos por identidade nativa; SELECT1/current_database/current_user pelo runtime em meumimo_t14_dev; Auth por leitura administrativa mínima real; Storage por consulta do bucket privado e listagem limitada do prefixo dev; Next por HTTP e identidade; mídia/outbox por heartbeat e última rodada. Descartar usuários/objetos retornados e nunca serializá-los. Esse health comprova dependências/API/metadados; a integridade de cada objeto continua sendo prova de QA/backup, não uma alegação de varredura dos bytes em toda consulta.

Probes usam clientes pg de vida curta, sem getDb/Pool global persistente no manager. Registrar somente contagem/idade de outbox pendente, mídia pendente e remoção sem proteção; hold deve ser distinguido de falha de expurgo. Silêncio>=30s, filho encerrado, rodada falha ou dependência indisponível não pode gerar ready. Durante MAINTENANCE, retornar maintenance e não abrir novos probes de DB/Auth/Storage.

maintenanceDue compara o último conjunto de desenvolvimento utilizável com consistentAt e intervalo12h; não usa mtime. Manifesto futuro, incompleto, vencido, de modo errado ou divergente não satisfaz o gate. No startup, autenticar o conjunto selecionado por verifyBackup/withVerifiedBackup; não basta encontrar manifest.json. Guardar resultado em memória para não decifrar o cluster inteiro a cada tick; backup novo já é verificado por createBackup. Sem conjunto válido ou com intervalo vencido, devolver true.

maintain usa a decisão autenticada de preflight/maintenanceDue: se devido, chama primeiro `createBackup('development',{quiescenceReceipt:receipt})`, e só depois maintainLocal para retenção. Não colocar outra verificação pesada ou retenção entre emissão do receipt e admissão da captura. Mesmo quando conserva backup fresco, retorna seu id/consistentAt autenticados. Se um artefato desconhecido produzir retenção PARTIAL, preservá-lo e reportar contagens; isso não equivale a backup válido. Falha de captura reabre a stack pelo finally existente, mas não libera escritores se o requisito de backup continuar vencido. SOURCE_RESTART_PENDING impede ready e reabertura dos filhos.

Adicionar ao backup a assinatura compatível:

```ts
createBackup(mode='development',options:{quiescenceReceipt?:Receipt}={}):Promise<BackupReport>;
assertSourceWritersAbsent(receipt?:Receipt):Promise<void>;
```

Sem receipt, conservar o CLI e suas guardas T14. Com receipt, exigir development, correspondência exata com supervisor.json em MAINTENANCE, mesmo owner/manager observado, todos os filhos stopped e portas4301/4302/4303/4310/4311 livres. Ausência de filhos só é válida na manutenção inicial, antes de qualquer spawn. Receipt tem validade máxima60s para admissão da captura; expirar durante a captura não reabre escritores. Se expirar antes da admissão, recusar: somente lifecycle pode emitir nova operação após reconferir a quiescência. Arquivo legado ativo/desconhecido continua bloqueando. Sem env de bypass, caminho/URL fornecido pelo usuário ou status stopped falso para manager ativo. Manter assertQuiescent de todo o cluster antes da parada PostgreSQL.

createBackup e maintainLocal já adquirem maintenance.lock. O callback não os envolve em outro lock igual. O lifecycle conserva somente seu lock de instância enquanto está vivo. Backup/rights/restore continuam mutuamente exclusivos pelo lock operacional existente.

`local-diagnostics.mjs` exporta `writeLocalLog({code,counts,now=new Date()}):Promise<void>` e `writeAdminDiagnostic(value:unknown):Promise<void>`. Root conecta onDiagnostic à segunda função e onStatus à primeira. writeLocalLog aceita os seis códigos LOCAL_* de onStatus, LOCAL_MAINTENANCE_COMPLETE e os códigos fixos de health; counts aceita somente as chaves de Round.counts, RetentionCounts, components e bytes. Não usar a allowlist de contagens das rodadas para aceitar status/durationMs.

writeAdminDiagnostic aceita exatamente os cinco campos atuais e valida os valores pelas allowlists T13 de admin/diagnostic-types.ts e pelo filtro numérico/UUID existente. Converte route/result em `T13_${route}_${result}` — conjunto finito derivado dessas allowlists —, status/durationMs arredondado em contagens próprias, e correlationId em id. Ambos os escritores produzem exclusivamente o formato conhecido por retention: formatVersion1, kind log, UUID id, createdAt, expiresAt=+7dias, code, counts. Arquivo UUID exclusivo, sem sobrescrever evento existente; duplicata válida já persistida pode ser ignorada. Linhas inválidas são descartadas, falha de I/O recebe código fixo. Não salvar stdout/stderr bruto, mensagens/stack nem expandir o acesso ao conteúdo das relações.

Conservar expiração autenticada30dias de backups e7dias de exports/logs. Temporários de mídia reutilizam reconhecimento por tentativa/lease/quarentena. Para staging/partial abandonado, só remover entradas com registro de propriedade e inventário exato que permitam provar escopo e ausência do dono; se for necessário, acrescentar esse registro ao produtor backup-manifest. Temporários antigos sem prova suficiente, journal/checkpoint, chaves ainda necessárias e restore-history ficam preservados. Não apagar por prefixo amplo ou apenas mtime.

## Sequência de implementação e verificação

### 1. Root fixa a baseline e os REDs

- [x] Registrar SHA T14 realmente commitado e conferir checkout/ownership antes do despacho T15. Nenhum autor reutiliza achados ainda em revisão T14 como tarefa nova.
- [x] Escrever casos RED de contrato/identidade/ownership, gates e stale usando as assinaturas acima. Testar PID reaproveitado, erro de observação, porta ocupada, snapshot malformado, segundo start e pedido de stop de outro owner.
- [x] Executar em série, pelo root: `node --test tests/pilot/process-contract.test.mjs tests/pilot/process-identity.test.mjs tests/pilot/processes.test.mjs`, em web. Exigir RED pela capacidade ausente. Processos de fixture são próprios e não ocupam portas já usadas.

### 2. Lifecycle congela o contrato e implementa

- [x] Criar contrato puro, identidade nativa, supervisor e next-host, no escopo da tabela. Publicar interfaces/manifesto para os outros escritores; nenhuma chamada a recursos pelo autor.
- [x] Cobrir startup sem escritores antes do gate, stop por IPC, parent desconectado, arquivo abandonado com prova e falha de drenagem sem falso STOPPED. next-host deve usar a API da versão instalada, com guia local lido antes da implementação.
- [x] Root executa os REDs afetados e revê os cinco módulos, incluindo Ctrl+C enviado ao PTY Windows e preservação de processos alheios.

### 3. Workers e operação consomem o contrato congelado

- [x] Workers implementam heartbeat, parada e signal entre unidades, preservando comandos antigos e lease/idempotência. Root escreve/executa `node --test tests/pilot/heartbeat.test.mjs` e casos afetados de mídia/outbox.
- [x] Archive implementa os callbacks, probes, receipt de backup, agenda e logs/retenção. Root escreve/executa `node --test tests/pilot/health.test.mjs tests/pilot/maintenance.test.mjs`; confirmar gate anterior a qualquer filho escritor e ausência de lock aninhado.
- [x] Testar seleção de backup fresco, vencido, ausente e corte futuro por função pura; recusar conjunto extra/ausente/hardlink e detectar alteração do fingerprint. No ensaio real, manager vivo+receipt válido passa somente após drenar, recibos alheio/expirado são recusados e a retomada volta a ready. A recuperação completa pertence ao ensaio T14; nenhum relógio do SO é alterado.

### 4. Root liga CLI, executa saúde real e entrega

- [x] Dispatcher preserva `local.mjs test`. Acrescentar ações enumeradas `web`, `health`, `stop`, sem URLs/SQL/caminhos alternativos. Package: `local:web`, `local:health`, `local:stop`. Root cria createLocalGates e passa a runSupervisor; conecta os callbacks de log, e onStatus imprime só código e URL fixa quando ready. local:health usa readSupervisor/localHealth; local:stop usa requestStop.
- [x] Integração real nos programas explícitos de `tests/integration/pilot/*-check.mjs`: dependência indisponível e worker interrompido não viram ready; porta/processo alheio é preservado; retomada conserva registros. Indisponibilidades Docker são provocadas/restauradas somente pelo root, com ownership conferido, serviços/escritores encerrados e finally de recuperação. Não usar APIs privadas simuladas como prova real.
- [x] Preparar/migrar dev explicitamente, iniciar local:web, conferir local:health e executar cadastro/Mailpit, loja, registro/aprovação e saldo/ticket na UI real. Parar com Ctrl+C e local:stop, iniciar outra vez e conferir os mesmos IDs/valores pela aplicação e por leitura independente. Sem seed automático nem limpeza dos dados de uso.
- [x] Provar janela de backup com manager vivo, escritores drenados, captura consistente e retorno saudável; depois reiniciar simulando backup devido antes das primeiras escritas. Registrar instantes, códigos, hashes/contagens sem segredos e sem converter tempo local em SLA.
- [x] Atualizar docs/pilot/local e canônicos com preparo, URL, correio, start/health/stop, manutenção, arquivo/chaves e limites da máquina desligada. Rodar checks afetados em série; ampliar regressões se falhas ou mudanças justificarem.
- [x] Revisão independente somente leitura. Root seleciona arquivos T15 explicitamente, confere segredos/artefatos e comita o marco autorizado. Entregar SHA T14 e T15 reais, comandos e URL; deixar a web disponível só após health confirmado e informar como pará-la.

## Estado deste complemento

T14 foi verificada e commitada em `206e0ce68b91765328b13a27ac8028e61fa37307`.
T15 começou depois desse commit, na branch `codex/t15-web-local`, preservando
a alteração alheia de README.md. REDs de contrato/identidade, heartbeat e
saúde/manutenção foram observados pela ausência das capacidades nos módulos,
em `.artifacts/t15-{process,heartbeat,health-maintenance}-red.log`.

Lifecycle, workers e operação têm escritores separados; root mantém CLI,
package, testes e integração. Ampliações de ownership autorizadas: lifecycle
acrescenta `process-custody.mjs` para arquivos/posse; workers também adapta
`src/server/media-worker/server.ts`, cuja parada anterior chamava
closeAllConnections. A drenagem deve aguardar HTTP e unidade atual antes de
fechar banco e confirmar STOPPED. O contrato compartilhado já foi publicado;
nenhum agente executa recursos/checks/Git. O root observou startup/saúde,
cadastro e ciclo persistente, backup com manager vivo e recibo, parada própria,
drenagem de domínio e falha controlada de worker. A regressão final e o
fechamento estão registrados abaixo.

O QA efetivo usa programas explícitos fora do runner comum, descritos em
[qualidade](../../quality.md). Isso impede que a suíte T14 de integração
inicie ou altere o domínio de desenvolvimento por descoberta automática de
`*.test.mjs`. Contrato/identidade, heartbeat e saúde/manutenção tiveram RED
antes das implementações; posse/portas tiveram prova real focal. O registro
de operações teve RED por módulo ausente e depois dois casos GREEN.

Achados de revisão resolvidos: admissão de mídia durante startup abortado;
IDs exatos dos contêineres no startup; cache recusando entradas extras no
backup; checkpoints/retomada e conta sem prova na limpeza de fixture;
recibo vencido testado sem alterar seu snapshot; DRAINING sem ready/probes;
e distinção entre espera de transporte e operação admitida. A primeira parada
por comando após UI falhou com DRAIN_TIMEOUT e foi preservada como falha.
O diagnóstico confirmou uma promise órfã do Next; somente a instância antiga
de QA, já sem HTTP/I/O ativo, precisou de encerramento explícito para continuar
a correção. Esse diagnóstico não faz parte do produto nem é prova de parada
graciosa. A correção passou duas drenagens reais com clientes abortados,
cancelamento/devolução e saída natural, além da parada CLI após nova navegação.

O ensaio refinado acompanha o grafo `pg_blocking_pids` até o bloqueador da
loja própria, exige três backends e orçamento inferior ao timeout de dez
segundos. Na repetição, o lock durou 1.660 ms e houve um CANCEL, um refund e
três filhos encerrados. O finally fecha clientes mesmo se rollback falhar.
Uma janela solicitada pelo callback de QA comprova a captura/reabertura real;
o intervalo de doze horas é conferido por função, sem mudar o relógio do SO.

Na quarta navegação real, MP4 inválido recebeu `file_invalid` com a mensagem
de recuperação e três amostras `ready`, preservando saldo/ticket. A rodada
concluída não transforma um item inválido em falha de toda a aplicação.
A quarta parada revelou a corrida DRAINING→STOPPED durante observação nativa;
`observeStopCompletion` agora relê owner/manager/filhos e cinco regressões
determinísticas passaram. A limpeza development por e-mail também teve RED
real e GREEN com duas identidades sintéticas, preservando o UUID substituto.
As correções receberam revisão independente somente leitura.

## Fechamento local de T15 — 23/10/2026

- [x] `npm run check`: base7/web62, lint, tipos e build passaram em `t15-check-final-3`.
- [x] Regressão HTTP362/362, zero skips, em `t15-http-full-2`; saúde negativa/recuperação de Auth, Storage e PostgreSQL em `t15-dependencies-2`.
- [x] Quinto ciclo: cadastro/UI/Mailpit, foto, saldo e ticket; Ctrl+C enviado ao PTY, saída própria confirmada nativamente, reinício e mesmos dados/bytes, devolução única e limpeza comprovada; `local:stop` e manager terminaram com código0.
- [x] Revisões independentes somente leitura encerradas após corrigir os achados concretos; descrição da identidade reconciliada com os tokens nativos opacos.

O Ctrl+C do PTY encerrou o comando PowerShell com código1, mesmo após
LOCAL_STOPPED; a conferência separada provou zero processos próprios vivos.
Isso é distinto da parada normal final, cujo código foi0. Não houve reboot,
espera real de12h, publicação ou uso de contas reais. O commit que contém este
registro entrega o recorte web local de T15; README.md alheio foi preservado.

Auditoria de831 arquivos não encontrou segredos locais conhecidos ou chaves
privadas e resolveu316 links locais. O SQL T14 manteve o SHA256
`4f4e46ddd1450686cae9ad54d689ce8bd7c0bdd3d0b430458190322395bb05e8`;
T15 não acrescenta migração nem altera versões/dependências.
