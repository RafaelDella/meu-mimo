# Direitos de dados no ensaio local

T14 conserva o PostgreSQL local e separa o procedimento operacional da
aplicação Next. Não há endpoint público de exportação, exclusão ou
impersonação. O ensaio aceita somente contas sintéticas `@example.test`
identificadas pelo Auth como fixtures T14 do mesmo ensaio; uma conta real não
é autorizada por uma concessão administrativa ou por conhecer seu UUID.

O operador registra um UUID de operação, a pessoa solicitante, a pessoa que
atestou a verificação, o tipo `EXPORT` ou `ERASURE` e o instante da verificação.
O banco conserva o digest dessa intenção e eventos ordenados, sem texto livre
do solicitante. Repetir a intenção devolve a mesma operação; trocar pessoa,
tipo, operador ou instante com o mesmo UUID é conflito.

## Procedimento

Os comandos são executados na raiz com `npm --prefix web run local:rights --`.
Substitua os identificadores pelos UUIDs da fixture acompanhada pelo ensaio.
`--mode integration` usa `meumimo_t14`; o padrão `development` usa
`meumimo_t14_dev`. Nenhuma flag recebe URL, SQL, shell ou caminho alternativo.

```text
register --mode integration --operation UUID --subject UUID --operator UUID --kind EXPORT --verified-at ISO_UTC
export --mode integration --operation UUID
status --mode integration --operation UUID
register --mode integration --operation UUID --subject UUID --operator UUID --kind ERASURE --verified-at ISO_UTC
erase --mode integration --operation UUID
```

Os UUIDs das duas operações são distintos. O registro de `ERASURE` por si só
não executa a exclusão. A credencial operacional é lida no processo local;
ela não é repassada ao Next. A aplicação usa somente o papel restrito.

## Exportação

A seleção segue os vínculos e a audiência atuais, com paginação, supressões por
autoria e regras de visibilidade e retenção da mídia. O pacote contém dados
JSON/CSV e derivados autorizados disponíveis, sem senha, token, segredo Auth,
diagnóstico interno ou conteúdo de outra relação privada. Células CSV que
possam iniciar fórmulas são neutralizadas.

Os componentes e o manifesto são cifrados e autenticados. O pacote fica no
diretório privado ignorado `.artifacts/t14-runtime/exports/UUID/`; a chave fica
separada em `keys/`. O stdout informa estado, contagens e validade, sem chave
ou caminho privado. O pacote vence sete dias após o preparo. Antes de informar
`EXPORT_READY`, o procedimento revalida a audiência e autentica os componentes.
Uma alteração de audiência impede reutilizar uma exportação anterior.

Há um limite de 1.000 componentes por exportação local, incluindo os dois
componentes de metadados. Excedê-lo falha sem declarar um pacote parcial pronto.
Não há publicação do arquivo nem envio automático por mensagem.

## Supressão e exclusão parcial

O procedimento grava primeiro a intenção mínima no journal externo cifrado e
em seu checkpoint autenticado. Depois aplica `IDENTITY` e `AUTHORED_CONTENT`,
revoga sessões e concessões administrativas, projeta o nome como
“Conta removida” e tenta retirar o login no Auth. Falhas externas continuam
pendentes e podem ser repetidas.

Os leitores ocultam o texto pelo autor original. O texto de outra autora
continua sujeito à audiência original; não é removido porque a pessoa
destinatária foi suprimida. Snapshots usam a autoria do catálogo, comentários
e decisões usam seu ator, e fotos e vídeos usam a autoria do arquivo.
Miniaturas e GET/Range revalidam a permissão.

Mídia própria sem proteção entra na fila existente de expurgo. Uma análise ou
contestação pendente conserva os bytes protegidos, imediatamente ilegíveis
pela aplicação após a supressão. Nenhum worker genérico é iniciado dentro do
procedimento para contornar essa proteção.

O resultado permanece `PARTIAL`. IDs, valores, datas, compensações e referências
financeiras permanecem íntegros, inclusive saldo negativo. Textos imutáveis,
referências compartilhadas, obrigações abertas, bytes ainda não expurgados,
remoção Auth pendente e janela de backups são impedimentos explícitos no
relatório. O protocolo não aprova registros, cancela tickets nem devolve pontos.

## Journal e recuperação

O journal contém somente identificadores, banco, digest e instantes da intenção.
Seu checkpoint em `keys/journal-checkpoint.json` identifica a geração e os
digests de todas as entradas. Ausência, perda ou divergência bloqueia a
recuperação. Ele não é reconstruído silenciosamente como um journal vazio.

A geração faz parte do conjunto cifrado de backup. A recuperação exige a mesma
geração externa e reaplica as intenções posteriores ao corte antes de abrir
Auth, Storage ou a aplicação. Não apagar o journal porque uma fixture foi limpa
ou uma exclusão ficou parcial: um backup anterior ainda pode conter esses UUIDs.

## Disputa após realização

O canal público de suporte foi adiado. No ensaio local, confira a identidade
autenticada, o ticket e a relação e registre somente o relato mínimo em registro
operacional privado. Preserve o estado terminal, a linha do tempo e os efeitos
financeiros. As pessoas da relação podem usar a conversa autorizada do ticket.

Uma concessão administrativa não permite ao operador ler essa conversa ou
suas mídias. Eventual acesso específico precisa de autorização e auditoria
próprias; não usar SQL ou impersonação para contornar a fronteira. Não prometer
reabertura ou devolução de ticket realizado. Uma solução com novo efeito
financeiro exige decisão e desenho próprios antes da implementação.

Os limites de implementação e as provas efetivamente executadas constam no
[plano local](../superpowers/plans/2026-10-22-t14-t15-local.md). Hospedagem,
tratamento de solicitações reais e publicação continuam fora deste ensaio.
