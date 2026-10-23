# Web local de T14–T15

T14 usa a stack Docker/Supabase `meumimo-t02`, PostgreSQL/Prisma e dados
persistentes. Desenvolvimento, integração e shadow têm bancos separados;
Auth e Storage continuam compartilhados pela stack de origem. O backup físico
inclui esse cluster inteiro. Os contratos e limites da recuperação estão em
[Recuperação local](recovery.md), e os procedimentos de exportação e exclusão
estão em [Direitos de dados](data-rights.md).

T14 foi concluída no commit `206e0ce`. T15 entrega o supervisor de uso diário,
saúde, manutenção e reinício verificados localmente no
[plano de operação](../superpowers/plans/2026-10-23-t15-operacao-local.md).

## Preparo de T14

Use Node.js 24, as dependências do projeto e o Docker Engine Linux local. O
inventário de T14 exige a API 1.56; o engine observado é 29.9.2. A instalação das
ferramentas e do Chromium está descrita em [Setup](../setup.md) e
[Onboarding](../onboarding.md). Execute os comandos abaixo na raiz do projeto,
em série e com os servidores e consumidores locais encerrados.

```sh
npm --prefix web run local:start
npm --prefix web run local:prepare:t14
npm --prefix web run db:migrate:dev:t14
npm --prefix web run db:migrate:integration:t14
npm --prefix web run media:fixtures:t14
npm --prefix web run build
```

`local:start` inicia a stack existente e restringe suas publicações a
`127.0.0.1`. `local:prepare:t14` prepara bancos, papel de runtime, callbacks de
Auth, bucket privado e ferramentas de mídia. Ao final, confere os sete serviços
da origem e grava o inventário privado. O inventário aceita novos IDs de
contêineres somente quando imagens, labels, mounts, rede e portas continuam
compatíveis com o registro anterior; divergência preserva esse registro.

Os arquivos operacionais ficam em `.artifacts/t14-runtime/`. O preparo também
gera `web/.env.local` quando o arquivo não existe ou conserva o marcador de
geração. Um arquivo gerenciado manualmente é preservado. O Next recebe a
credencial restrita de runtime; credenciais de migração, fixtures e service role
ficam nos processos operacionais. Não copie o estado completo para seu ambiente.

| Recurso | Desenvolvimento | Integração | Cópia de recuperação |
| --- | --- | --- | --- |
| Projeto Docker | `meumimo-t02` | `meumimo-t02` | `meumimo-t14-restore` |
| Banco de domínio | `meumimo_t14_dev` | `meumimo_t14` | `meumimo_t14` |
| Prefixo de mídia | `t14-development` | `t14-integration` | `t14-restore` |
| API / PostgreSQL / correio | 54321 / 54322 / 54324 | 54321 / 54322 / 54324 | 55321 / 55322 / 55324 |
| Next / mídia | 4301 / 4311 | 4310 / 4311 | 4320 / 4321 |

O shadow é `meumimo_t14_shadow`. Todas as portas publicadas ficam em loopback.
As mesmas portas de integração são usadas pelas tarefas anteriores; builds,
typegen, testes com serviços e servidores continuam serializados no checkout.

## Abrir, conferir e parar a web

Depois do preparo explícito, execute na raiz:

```sh
npm --prefix web run local:web
```

Mantenha esse terminal aberto. Aguarde `LOCAL_READY` e abra
[Meu Mimo local](http://127.0.0.1:4301/conta). Em outro terminal:

```sh
npm --prefix web run local:health
npm --prefix web run local:stop
```

`local:health` retorna JSON sem credenciais e código de saída zero somente em
`ready`. Confere PostgreSQL com papel runtime, Auth, bucket privado/consulta
limitada de Storage, Next e os heartbeats de mídia/outbox. Uma página HTTP 200
sozinha não declara a aplicação pronta. `maintenance` indica a janela de backup;
`stopped` indica que o supervisor não está servindo a aplicação.

Ctrl+C no terminal do supervisor também solicita parada. Ela fecha a admissão
de Next e aguarda requisições, mídia e entregas em curso; só confirma
`LOCAL_STOPPED` após os filhos próprios saírem. `LOCAL_STOP_PENDING` ou uma
falha de identidade exige conferir o estado; não apague locks nem mate um
ocupante de porta para forçar o próximo start. Uma segunda instância é recusada.

Cadastre sua conta pela web e confirme o e-mail no
[correio local](http://127.0.0.1:54324). Não há conta padrão nem domínio semeado
no startup. Crie uma loja; para testar a participante, use outra conta/e-mail e
uma sessão de navegador separada. Administração exige provisionamento separado
e TOTP, como em [administração local](../admin-local.md).

O PostgreSQL de desenvolvimento é `meumimo_t14_dev`, em
`127.0.0.1:54322`, com schema `app` e usuário runtime restrito
`meumimo_runtime`. Auth usa o banco `postgres` da mesma stack. Credenciais
permanecem no estado privado e no ambiente gerenciado; não copie o estado de
operação para o Next. Os volumes Docker nomeados de PostgreSQL e Storage
preservam os dados ao parar ou reiniciar a web. `local:stop` conserva a stack
Docker e seus volumes.

O startup confere configuração, a cadeia de migrações local, build de produção,
ferramentas de mídia e inventário dos sete contêineres. Pode iniciar somente os
contêineres existentes com os IDs registrados. Não cria build, não migra, não
semeia e não substitui volumes silenciosamente; execute o comando de preparo
indicado caso falte uma pré-condição. Pare a web antes de build, typegen, checks
de custódia ou suítes que compartilham portas e bancos.

A [biblioteca compartilhada de ilustrações](../illustrations.md) acrescenta
a décima sétima migração, `20261023005000_shared_illustrations`, sem reescrever
a cadeia anterior. Sua aplicação a desenvolvimento ou integração exige a
autorização correspondente, com os escritores parados.

## Backup durante o uso local

Antes de abrir os escritores, o supervisor autentica um backup utilizável de
desenvolvimento. Se não houver conjunto válido ou o corte tiver doze horas,
captura outro. Enquanto permanece aberto, verifica o intervalo de doze horas
pelo corte consistente, sem depender de mtime. A janela fecha e drena seus
escritores, conserva o manager vivo com recibo de quiescência, captura o cluster
e Storage frios e só reabre a web depois da retomada e saúde confirmadas.
A aplicação fica temporariamente indisponível nessa janela; o backup inclui
todos os bancos da stack compartilhada.

O agendamento funciona enquanto o processo e a máquina estão ligados. Após
um período desligado, o startup trata o backup devido antes de novas escritas;
isso não garante RPO contínuo durante o desligamento. Retenção máxima: backups
de trinta dias, exports e logs de sete dias. A manutenção preserva arquivos
desconhecidos, journal, checkpoints e chaves ainda necessárias, reportando
resultado parcial quando não pode provar uma remoção segura. Backup inválido
ou retomada pendente impede declarar a web pronta.

Snapshots, pedidos de parada, logs e arquivos cifrados ficam sob custódia em
`.artifacts/t14-runtime/`, fora do Git. Não mova só os componentes cifrados:
chaves e journal externos integram a recuperação descrita em
[Recuperação local](recovery.md).

## Comandos de QA e operação

```sh
npm --prefix web run test:integration:t14
npm --prefix web run test:web:real
```

`test:web:real` usa Auth, PostgreSQL, Storage, Next e gateway locais com fixtures
sintéticas. Seu harness inicia e encerra os processos que possui. Não execute
duas suítes reais ao mesmo tempo. Esse comando é QA de integração, não um
supervisor persistente de desenvolvimento.

Os consumidores existentes têm comandos `media:dev:t14`, `media:once:t14`,
`media:purge:t14`, `outbox:dev:t14` e `outbox:once:t14`. Os comandos `:dev:t14`
usam desenvolvimento; os comandos `:once:t14` usam integração. Encerre os
consumidores contínuos antes de backup, restore ou outro ensaio.
`media:purge:t14` também atua em integração.

| Operação | Comando na raiz |
| --- | --- |
| Backup de desenvolvimento | `npm --prefix web run local:backup -- development` |
| Backup de integração | `npm --prefix web run local:backup -- integration` |
| Restaurar somente a stack | `npm --prefix web run local:restore -- UUID_DO_BACKUP` |
| Ensaio completo de recuperação | `npm --prefix web run local:restore:check` |
| Eliminar a cópia descartável identificada | `npm --prefix web run local:restore:clean -- UUID_DO_OWNER` |
| Aplicar retenção vencida | `npm --prefix web run local:maintenance` |

O ensaio completo não recebe argumentos. O UUID do backup e o UUID de posse da
cópia têm funções diferentes; siga a sequência de [Recuperação](recovery.md)
antes de restaurar ou limpar recursos. `local:rights` tem sua própria sintaxe em
[Direitos de dados](data-rights.md). Não há flags para URL, SQL, shell ou destino
alternativo nesses procedimentos.

## Evidência observada e próximo marco

O ensaio completo passou com TOTP original, dados/arquivos, supressão posterior,
novo ciclo web e limpeza identificada da cópia. Os instantes, volume e metas
locais estão em [Recuperação](recovery.md); as provas funcionais e de laboratório
estão no [aceite](acceptance.md). O resultado continua restrito a esta máquina e
à carga sintética. Startup, saúde, reinício com dados persistidos, Ctrl+C no
terminal e parada por comando passaram em T15, com as provas no aceite.
Recuperação em outra máquina ainda não foi testada.
