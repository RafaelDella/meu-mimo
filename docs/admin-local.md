# Administração local — T13

T13 acrescenta visão geral, contas, lojas e histórico administrativo. A entrada
fica em Conta, em “Administração da plataforma”. Os painéis consultam perfis
da aplicação e metadados de lojas; o cadastro interno do provedor de identidade
não integra essas contagens.

Estado: **implementada e verificada localmente**. A migração administrativa foi
aplicada aos bancos T13 de desenvolvimento e integração. As provas SQL
passaram pelas quinze migrações, preservação e privilégios de 38 tabelas com
RLS. Checks e revisões independentes passaram após as correções. Foram
cobertos 356 casos HTTP distintos pela execução completa e repetição focal;
a regressão Chromium passou com 736 cenários, sem falhas ou skips. Ocorrências
e limites estão no plano T13. Essa evidência não declara publicação.

## Preparação

Usar Node.js 24 e a stack Docker local existente `meumimo-t02`, com
PostgreSQL 17, Auth e Storage persistentes. Os bancos anteriores não precisam
ser resetados. Na raiz, com o engine Linux ativo:

```sh
npm --prefix web run local:prepare:t13
npm --prefix web run db:migrate:dev:t13
npm --prefix web run db:migrate:integration:t13
npm --prefix web run media:fixtures:t13
```

| Recurso | Desenvolvimento | Integração |
| --- | --- | --- |
| PostgreSQL | `meumimo_t13_dev` | `meumimo_t13` |
| Shadow | `meumimo_t13_shadow` | Não usado pelos testes HTTP |
| Storage | `t13-development` | `t13-integration` |
| Next | `127.0.0.1:4301` | `127.0.0.1:4310` |
| Mídia | `127.0.0.1:4311` | `127.0.0.1:4311` |

Auth/Storage permanecem em `127.0.0.1:54321`, PostgreSQL em
`127.0.0.1:54322` e mensagens locais em `127.0.0.1:54324`. Executar
desenvolvimento, integração, build e testes de navegador em série.
O preparo seleciona desenvolvimento em `web/.env.local`. Credenciais, estado
e evidências ficam ignorados em `.artifacts/t13-runtime/`.

Para desenvolvimento, abrir três terminais na raiz:

```sh
npm run web:dev
```

```sh
npm --prefix web run media:dev:t13
```

```sh
npm --prefix web run outbox:dev:t13
```

## Acesso e conteúdo

O operador provisiona o grant por conexão separada, seguindo
[Administração separada](identity-local.md). O procedimento bloqueia o perfil
antes de verificar a suspensão e conceder o grant. Não existe promoção pelo
cadastro, por campo do perfil ou por botão administrativo. O Next recebe
somente a conexão restrita de runtime.

Cada consulta, ação e recuperação exige sessão válida, ausência de recuperação
e bloqueio, grant ativo e MFA/TOTP verificado em AAL2. A confirmação TOTP usa
o fluxo existente em Conta. Navegação e revalidação ocultam a árvore privada
enquanto o acesso é conferido; não há canal que prometa detectar revogações
remotas instantaneamente.

As telas mostram nome de exibição, UUID, criação, estados, responsável e
contagens de vínculos. Participações abertas, encerradas e revogadas são
contadas separadamente; o papel MERCHANT não entra como PARTICIPANT. Busca
aceita nome ou UUID exata, até 80 caracteres Unicode. Listas e histórico usam
página padrão 20 e máximo 50, com ordenação estável e total.

O painel não consulta saldo, extrato, bilhete, conversa, reação, legenda,
evidência, álbum, combinado, código de ticket ou endereço de mídia. Uma conta
com grant e sem vínculo continua sem acesso às rotas privadas de uma loja.
Se tiver vínculo, usa suas permissões normais na experiência da relação.

## Pausa e bloqueio

“Pausar novas ações da loja” altera `Store.platformPausedAt` e sua revisão
administrativa. Esse campo é independente de `Store.state`, mantido pelo
lojista. Retomar uma das causas conserva a outra; retirar a restrição da
plataforma não reabre loja ou participação encerrada.

A pausa bloqueia novos convites, novos aceites, preparo/recebimento de novos
registros e resgates. Evidência DRAFT também não recebe novas partes ou
conclusão. Análise e complemento existentes, catálogo, conversa, bilhete,
tratamento de tickets e álbum seguem os contratos T08–T12. Replays já
confirmados recuperam seu resultado autorizado. O contexto normal informa
“Novas ações pausadas pela plataforma”, sem divulgar o motivo administrativo.

“Bloquear acesso por segurança” altera `Profile.suspendedAt` e retira todas
as respostas privadas da própria conta, inclusive mídia já autorizada e
requisições Range. As outras pessoas conservam seu acesso legítimo. O bloqueio
preserva vínculos, pontos, estoque, tickets e conteúdo. “Reativar acesso”
conserva revogações de sessão, MFA, grants e pausas de lojas.

O servidor e a interface impedem bloquear a própria conta administrativa ou
uma conta com grant ativo. Grants, senha e recuperação de MFA continuam no
procedimento separado; não existe impersonação administrativa.

## Auditoria e recuperação

Cada intenção envia UUID, alvo, ação, revisão esperada e motivo obrigatório
de até 500 caracteres Unicode após normalização NFC. Mudança e auditoria
imutável confirmam na mesma transação. O runtime não pode atualizar os campos
administrativos diretamente. A função SQL restrita revalida e bloqueia
perfil, sessão, grant e alvo; seu executor sem login possui permissões mínimas.

Consultas usam Repeatable Read. Comandos usam Read Committed para conferir
grants criados enquanto aguardam o lock do alvo. Falhas de serialização ou
deadlock têm repetição limitada com nova autorização. Mesma UUID e corpo
recuperam a ação aplicada e o estado atual; trocar corpo ou autor gera
conflito. A consulta de operação é restrita ao próprio administrador.

Após resposta perdida, consultar a operação antes de iniciar outra intenção.
Só a UUID opaca pode entrar na URL de recuperação. Motivo, busca e formulário
ficam em memória por sessão e alvo; a interface descarta respostas tardias e
limpa os dados ao perder acesso ou trocar de conta.

## Limites e diagnóstico

Cada conta tem 120 leituras e 10 mutações administrativas por minuto,
inclusive replay, com cotas independentes e resposta 429 com espera.
Consultas com busca usam POST e não incluem o termo na URL. Origin e JSON
continuam obrigatórios para esses comandos e consultas.

O adaptador de diagnóstico aceita apenas código de rota, código de resultado,
status, duração e correlação aleatória. Não serializa motivo, busca, nome,
e-mail, cabeçalhos, sessão, tokens, SQL ou parâmetros. Erros desconhecidos
retornam 503 genérico. O histórico com motivo permanece na audiência
administrativa e não substitui eventos financeiros.

Para verificar, com os servidores de desenvolvimento encerrados:

```sh
npm run check
npm --prefix web run db:migrate:check
npm --prefix web run test:integration:t13
npm --prefix web run test:e2e -- tests/e2e/admin
npm run web:test:e2e
```

Esses comandos são instruções de operação; o registro dos resultados fica no
[plano T13](superpowers/plans/2026-10-22-t13-administracao.md). Chromium
emulado não comprova aparelhos físicos ou publicação. T14–T15 tratam aceite,
backup, recuperação, retenção e execução local integrada. Provedores, domínio,
orçamento e suporte do piloto público permanecem adiados pelo idealizador.
