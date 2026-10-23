# Recuperação local de T14

O backup de T14 captura a frio o cluster PostgreSQL inteiro, o Storage e os
arquivos externos necessários à mesma stack. Ele serve para recuperação local
com as imagens registradas na captura. O modo `development` ou `integration`
seleciona o banco de domínio conferido e o prefixo de mídia a remapear; não
limita o volume físico a esse banco. Auth, outros bancos e objetos presentes no
cluster também são conteúdo sensível do conjunto.

As metas são RPO de 24 horas e RTO de 8 horas. O ensaio sintético local atingiu
RPO de cerca de 78 segundos e RTO completo de 96,593 segundos, conforme a
evidência ao final. A política prevê captura a cada 12 horas e retenção de
30 dias; os comandos atuais são manuais. A cópia em outro disco, máquina ou
domínio de disponibilidade ainda não foi testada.

## Custódia e conteúdo

O diretório `.artifacts/t14-runtime/` e os arquivos `.env` são ignorados pelo Git.
O inventário da origem, os estados de runtime, credenciais, relatórios e
temporários são privados. No Windows, a custódia remove herança de permissões
e restringe o diretório ao usuário atual, SYSTEM e Administradores. Caminhos
fora da raiz reservada, links, junctions e entradas não regulares são recusados
pelos procedimentos de custódia.

Cada captura fica em `backups/<UUID>/`, com manifesto cifrado e autenticado e
16 componentes cifrados:

| Componentes | Conteúdo |
| --- | --- |
| `pgdata` e seu inventário | Volume físico de dados PostgreSQL, incluindo todos os bancos e Auth |
| `storage` e seu inventário | Volume físico de objetos, partes e derivados |
| `postgres-config` e seu inventário | Configuração externa do PostgreSQL |
| `pgsodium-key` e seu inventário | Chave interna necessária à distribuição capturada |
| `kong-config`, `kong-cert`, `kong-key` e seus três inventários | Configuração e material interno do gateway |
| `configuration` | Configurações dos sete contêineres e estado local de origem |
| `journal` | Snapshot do journal mínimo de supressões no instante consistente |

Os sete arquivos tar e seus sete inventários somam 14 componentes; configuração
e journal completam os 16. Volumes são transferidos por streams da API Docker,
sem depender de um dump apenas do domínio ou de exportar o filesystem de um
contêiner como substituto do volume.

AES-256-GCM usa chave aleatória de 256 bits por conjunto, nonce novo de 12 bytes
e tag de 16 bytes por componente. A autenticação vincula versão, UUID e nome;
manifesto, tamanho e SHA-256 permitem conferir o conjunto. Plaintext fica
somente em temporário privado e só é liberado após conferir autenticação,
tamanho e hash até o fim. Capturas com `.partial` não são selecionáveis.

As chaves AES de custódia ficam em `keys/`, fora de `backups/<UUID>/`. Não as
copie junto do arquivo cifrado para o mesmo pacote de transporte. Elas são
diferentes das chaves internas de PostgreSQL/Kong, que precisam estar dentro
dos componentes cifrados para recuperar a stack. O journal atual fica fora do
backup, em `rights/journal/`, com checkpoint autenticado em
`keys/journal-checkpoint.json`. Ele registra identificadores, digest e instantes,
sem conteúdo livre apagado. Preserve chaves, journal e checkpoint em custódia
separada do pacote; a separação atual de diretórios não prova proteção contra
perda física do host.

O manifesto registra imagens por digest, migrações e checksums, `.next/BUILD_ID`
e o SHA lido de HEAD. A baseline T13 é
`72bbe85737e3cdc3efaded7723bb4b845dce358d`. Durante este ensaio, as mudanças T14
ainda não estão commitadas: o SHA de HEAD identifica essa baseline e não prova,
sozinho, o conteúdo T14 do checkout ou do build.

## Captura

1. Conclua o [preparo T14](local.md). Tenha build de produção disponível e o
   inventário da origem atualizado pelo preparo.
2. Encerre Next, gateway, consumidores e outros escritores próprios. A captura
   recusa portas locais ocupadas e supervisores registrados como ativos; ela
   não mata processos por suposição. A parada do cluster afeta todos os bancos
   e serviços de sua origem compartilhada.
3. Execute um dos comandos:

   ```sh
   npm --prefix web run local:backup -- development
   npm --prefix web run local:backup -- integration
   ```

4. Preserve o UUID e os instantes do relatório. `COMPLETE` só é produzido após
   verificar os componentes e publicar o conjunto sem o marcador de captura
   incompleta. Confira também se a retomada da origem foi concluída.

Sob lock exclusivo de manutenção, o procedimento valida a origem, as migrações,
os fingerprints financeiros e a ausência de leases ativas. Para os sete
serviços, encerra os escritores antes do PostgreSQL, exige ausência de clientes
restantes e faz parada limpa do banco. PostgreSQL, Storage, configuração e
journal são capturados com a origem quiescente no mesmo corte `consistentAt`.
Os volumes existentes são preservados. A retomada dos serviços parados ocorre
em `finally`, inclusive se a captura falhar; uma falha de retomada é reportada e
exige diagnóstico antes de continuar. Um conjunto incompleto é preservado como
tal, sem virar backup utilizável.

## Restore da stack

Encerre os escritores locais e deixe livres as portas da cópia. O comando
recebe somente o UUID de um backup completo, não vencido e sob a mesma custódia:

```sh
npm --prefix web run local:restore -- UUID_DO_BACKUP
```

Antes de criar recursos, o restore verifica todos os componentes e o journal
externo atual. A geração do journal deve coincidir com a capturada e conservar
as intenções já presentes no backup. Ausência, perda ou divergência fecha a
recuperação; não recrie o journal para contornar essa proteção.

A cópia usa projeto `meumimo-t14-restore`, bridge dedicada e volumes novos,
rotulados com um UUID de posse. Nomes, recursos ou portas já ocupados bloqueiam
a criação; nenhum volume da origem é sobrescrito. PostgreSQL, API e correio
usam 55322, 55321 e 55324, sempre em `127.0.0.1`; Next e mídia reservam 4320 e
4321 para o ensaio da aplicação.

A bridge tem `Internal:false` para permitir o acesso operacional pelo host no
Docker Desktop. A saída de rede é permitida; não há alegação de bloqueio de
egress. PostgreSQL publica somente para o operador em loopback; Auth/Storage
não têm publicação própria, e Kong só é aberto após as verificações abaixo.

O restore troca credenciais dos papéis de login e gera novos segredos JWT,
service role, runtime e gateway. Revoga sessões e concessões da aplicação e
limpa estados transitórios de Auth, preservando identidades e fatores das contas
mantidas. Remove o Auth das contas suprimidas. Reaplica
as supressões externas nos bancos copiados correspondentes antes de abrir Auth,
Storage e a aplicação; confere novamente o journal antes de publicar Kong.
Autoria e identidade suprimidas continuam ocultas. Histórico financeiro,
auditorias e conteúdo cuja remoção ainda tem impedimento são preservados:
exclusão pode continuar `PARTIAL`, sem prometer apagamento físico completo.

D08 também é aplicada antes da publicação: mídia não publicada inativa por
24 horas, evidências publicadas há 180 dias sem hold e memórias com retenção
vencida sem hold ficam indisponíveis, em estado de remoção. Bytes retidos
continuam em quarentena; esse passo não declara uma purga física concluída.

Na captura de desenvolvimento, somente a cópia fechada renomeia o banco de
integração capturado para `meumimo_t14_captured` e o banco de desenvolvimento
para `meumimo_t14`. Ambos são preservados; colisão com o nome capturado recusa
a operação. O runtime público da cópia aponta somente para `meumimo_t14`.

O prefixo selecionado da origem é remapeado explicitamente para `t14-restore`,
com atualização de metadados e verificação de tamanho e hash dos objetos
restaurados. A origem permanece com seu prefixo e seus volumes. Migrações,
permissões e fingerprints financeiros também são conferidos.

`STACK_VERIFIED` significa que a stack copiada passou essas verificações. Esse
comando não inicia Next, gateway de mídia ou consumidor outbox, nem comprova o
ciclo web ou o RTO completo. Se falhar, tenta parar todos os serviços próprios
da cópia e mantém seus recursos para diagnóstico; falha de fechamento é
reportada. Não reaproveite uma cópia interrompida como ambiente aberto.

## Ensaio completo e limpeza

```sh
npm --prefix web run local:restore:check
```

O driver não recebe argumentos. Ele prepara fixtures sintéticas de integração,
confere persistência em desenvolvimento, captura o backup, altera fixtures da
origem e registra uma supressão posterior à captura. Restaura a cópia e executa
as fases de verificação dos dados e da aplicação com Auth, Storage, Next e mídia.
Mede a idade da captura no início da recuperação e o tempo até a verificação
web. O fluxo prevê limpeza das fixtures e da cópia após essas verificações.

O relatório privado fica em `reports/recovery-check.json`, com evidência por
fase em `reports/recovery-fixture-report.json`. O estado final esperado é
`WEB_RECOVERY_VERIFIED`; `FAILED_PRESERVED` significa ensaio interrompido, com
artefatos preservados para diagnóstico. Não substitua esse resultado por
`STACK_VERIFIED` nem por uma duração isolada de restore.

Para eliminar explicitamente uma cópia descartável preservada, consulte em
canais privados o `owner` de `restore/operation.json` e execute:

```sh
npm --prefix web run local:restore:clean -- UUID_DO_OWNER
```

Esse UUID identifica a posse da cópia, não o backup. Antes da primeira mutação,
a limpeza confere operação, backup associado, IDs, nomes, labels, mounts, rede,
volumes e ausência de referências alheias. Exige Next e mídia da cópia encerrados.
Ela para somente os contêineres próprios, remove-os sem força e sem remoção implícita
de volumes, e então remove os volumes e a rede nominal sem usuários alheios.
Recursos já ausentes permitem continuar; nome reaproveitado, recurso desconhecido,
link ou colisão de histórico fazem a operação recusar a limpeza.

Ao concluir, move o diretório privado `restore/` para
`restore-history/<UUID_DO_OWNER>/`, sem sobrescrever histórico. Credenciais e
estado da operação continuam privados para revisão. Uma repetição reconhece
o histórico concluído após confirmar a ausência dos recursos. Origem, backups,
chaves e journal são preservados. A limpeza libera os nomes e o diretório ativo
para uma nova tentativa; não use comandos genéricos de remoção de volumes.

## Retenção e evidência local

```sh
npm --prefix web run local:maintenance
```

A manutenção não recebe argumentos nem caminhos alternativos. Expira backups
30 dias após `startedAt` do manifesto autenticado, exportações após 7 dias de
`preparedAt` e logs reconhecidos após 7 dias de `createdAt`. Não usa o mtime como
prazo. Conjuntos desconhecidos, incompletos, com links ou entradas extras são
preservados e podem produzir `PARTIAL`. A retenção não elimina o journal externo
de supressões nem o histórico privado de restore.

Ensaio completo aprovado em 23/10/2026 por `local:restore:check`, em
`.artifacts/t14-recovery-check-4.log` e no relatório privado
`.artifacts/t14-runtime/reports/recovery-check.json`:

| Evidência | Estado |
| --- | --- |
| UUID do backup e instantes `consistentAt` / recuperação | `598274e8-9211-4457-af9d-0c25b9ca0f33`; corte 15:29:30.815Z, web recuperada 15:32:25.246Z |
| Resultado final das fases de dados e web | `WEB_RECOVERY_VERIFIED`; seis fases e novo resgate/cancelamento/devolução pela UI da cópia |
| RPO observado, meta até 24 horas | 77,838 segundos entre corte e declaração do incidente simulado; exclusão posterior reaplicada pelo journal |
| RTO completo observado, meta até 8 horas | 96,593 segundos desde a declaração até o ciclo web verificado; limpeza posterior encerrada às 15:32:32.762Z |
| Reconciliação financeira, objetos e supressão posterior ao backup | 26 linhas da fixture em treze tabelas e três saldos preservados antes do novo ciclo; seis objetos conferidos por hash; uma pessoa suprimida e conteúdo legítimo da outra preservado |
| Persistência de desenvolvimento e limpeza da cópia | Marcador próprio no banco dev sobreviveu ao reinício e à limpeza de integração; sete contêineres, dois volumes e uma rede da cópia foram removidos por posse |
| Fator TOTP e contextos antigos | Mesmo usuário/fator verificado, sem novo cadastro: login AAL1 e desafio novo com o segredo original chegam a AAL2; token AAL2 e desafio anteriores são negados, e grant administrativo copiado continua revogado |
| Cópia física em outro domínio de disponibilidade | Não testada |

A captura contém dezesseis componentes, 434.695.074 bytes antes da cifra e
16.654 arquivos TAR. Manifesto identifica dezesseis migrações, imagens locais,
`BUILD_ID` `Aqw2nuhvzLPwjY1pODRtZ` e SHA de base T13; T14 ainda era um candidato
local sem commit durante o ensaio. O processo completo recusou um componente
faltante e outro adulterado, restaurou o inode original e reconfirmou o conjunto.
Três sessões, refresh e PKCE antigos foram negados; duas reaplicações adicionais
do journal não duplicaram eventos nem mudaram dinheiro. Identidades mantidas
autenticaram novamente, enquanto o login removido permaneceu negado.

A repetição anterior com TOTP parou por expectativas incorretas de status no
teste: Auth v2.197.0 devolve 403/`bad_jwt` ao token antigo e
422/`mfa_factor_not_found` ao desafio removido. As respostas foram reproduzidas
diretamente no Auth, sem identidade ou tokens. A prova exige esses códigos e
confirma o fator original por consulta independente antes de desafiar novamente.
O ensaio completo acima passou após a correção; relatórios das tentativas foram
preservados. Nenhuma alteração de produto foi necessária para esse resultado.

Ocorrências anteriores ficaram registradas: Internal:true não permitiu a
conexão operacional nesta instalação; bridge dedicada resolveu a prova. O Node
temporário precisava tratar SIGTERM, e a cópia Kong2.8.1 precisava habilitar
key-auth. As tentativas falharam fechadas e foram limpas por posse; a origem
permaneceu íntegra. A repetição completa acima inclui as correções e limpeza
normal, sem terminação forçada. Os tempos são desta carga sintética e máquina,
sem projeção de SLA ou disponibilidade de uma infraestrutura publicada.

O roteiro e o aceite canônico estão no
[plano T14–T15](../superpowers/plans/2026-10-22-t14-t15-local.md). O ensaio local
não homologa infraestrutura pública, aparelhos físicos ou execução remota de CI.
