# T14 local

T14 usa a stack Docker/Supabase `meumimo-t02`, PostgreSQL/Prisma e dados
persistentes. Desenvolvimento, integração e shadow têm bancos separados;
Auth e Storage continuam compartilhados pela stack de origem. O backup físico
inclui esse cluster inteiro. Os contratos e limites da recuperação estão em
[Recuperação local](recovery.md), e os procedimentos de exportação e exclusão
estão em [Direitos de dados](data-rights.md).

T15 permanece pendente. Este documento descreve o preparo e os comandos
existentes; o supervisor de uso diário e seu relatório de saúde ainda não foram
entregues.

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

## Comandos atuais

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
à carga sintética. Startup diário, saúde contínua e agenda de doze horas são o
próximo marco T15; recuperação em outra máquina ainda não foi testada.
