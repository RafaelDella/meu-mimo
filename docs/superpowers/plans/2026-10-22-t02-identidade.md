# T02 — identidade e isolamento

**Objetivo:** implementar o pacote T02 do plano da fundação, com Prisma e
Supabase locais, sem publicar ou usar dados reais.
**Base:** `1271c69`; requisitos §6.1, arquitetura §§2–4 e plano da fundação §4.
**Estado:** implementação local verificada e revisada.
D02 confirmada pelo idealizador em
22/10/2026; limites de autenticação D04 confirmados e preparação do Docker
Desktop por usuário autorizada. As demais propostas D03–D09 permanecem abertas.

## Liberação e recursos

- Docker Desktop instalado manualmente pelo idealizador e engine Linux comprovado.
  Os scripts usam a CLI real; não executar o shim npm chamado `docker`.
- A instalação de Docker Desktop por usuário foi autorizada, com WSL2;
  não presumir necessidade de administrador/reboot.
- Stack de teste: `meumimo-t02`, aplicação 4302 e serviços locais 54321–54324.
  Antes de iniciar, detalhar portas efetivas e conferir listeners/ownership.
- Desenvolvimento, shadow e integração devem usar bancos separados e
  descartáveis. Nenhuma migração em dados reais está autorizada.
- `.next`, npm e builds ficam exclusivamente com o integrador, em série.
  Implementação/revisão usam um escritor por arquivo, revisores somente leitura.

## Ondas e responsabilidade

| Onda | Escopo | Escritor / recursos | Dependências |
| --- | --- | --- | --- |
| 0 | Contratos e descoberta do ambiente, somente leitura | Dois agentes; nenhum recurso mutável | T01/T03 |
| 1 | `auth/return-path.ts`, teste puro e separação do runner de integração | Integrador; sem serviços | D02 confirmada |
| 2 | Schema/migrações, adaptador, Supabase local, sessão e autorização | Detalhar contratos e arquivos antes do despacho | D04 e runtime comprovado |
| 3 | HTTP real, migrações, regressões e revisão independente | Testes/builds em série, revisão somente leitura | Onda 2 |

### Contratos fixados para a implementação

Schema privado `app`: Profile (UUID Auth, nome opcional, suspensão de
segurança), Store (autoria, sem usar autoria como permissão), Membership
(papel MERCHANT/PARTICIPANT, unicidade loja/perfil/papel), AdminGrant
(provisionamento separado, revogável). D03 permanece aberta: nenhum fluxo de
criar/encerrar loja, convite ou dupla participação será exposto aqui.
AuthSession (UUID da sessão Auth, perfil, revogação, contexto de recuperação),
AuthRateBucket (chave HMAC, janela e contagem atômica) e SecurityAudit
(evento, ator opcional e instante, sem senha/token/e-mail) são suporte mínimo
à identidade/abuso, não modelos de pontos ou event sourcing.

`Identity = { userId: string; sessionId: string; assuranceLevel: 'aal1' |
'aal2' }`, construída por `requireIdentity()` após `getUser`/claims
verificados e sessão local ativa, conta não suspensa e e-mail verificado.
Sessão de recuperação só pode alterar senha/sair; não autoriza loja/admin.
O callback vincula finalidade/verifier com HMAC e exige método AMR compatível
no JWT verificado pelo Auth; metadados do SDK ou query não autorizam essa finalidade.
Cliente Auth é criado por requisição; cookies e headers de renovação são
preservados, sem cache público de respostas privadas.

`StoreAction = 'store:read' | 'membership:read' | 'membership:list'`.
`requireStoreAccess(identity, storeId, action, targetMembershipId?)` resolve
papel real e alvo na loja; participante lê só sua relação, lista é do lojista.
AdminGrant não dá bypass de lojista; `requireAdminAccess` exige grant vigente
e AAL2. Revogação é consultada a cada requisição.

API JSON com validação, erros neutros e `Cache-Control: no-store`:
POST `/api/auth/{signup,login,recovery,logout,mfa}`; PATCH recovery confirma
nova senha apenas em sessão de recuperação; GET callback troca código PKCE
e GET session devolve identidade validada. Login retorna `{ returnTo }`;
signup/recovery retornam 202 neutro; abuso retorna 429 com Retry-After.
MFA recebe `action: enroll|challenge|verify` e os IDs/código pertinentes.
GET `/api/admin/session` prova grant+AAL2. Leituras privadas em
`/api/lojas/[storeId]`, `/participacoes` e `/participacoes/[membershipId]`
consomem os contextos autorizados. Nenhuma mutação de domínio é exposta.

Mutações exigem Origin igual ao APP_ORIGIN configurado, JSON e corpo limitado;
não confiar em X-Forwarded-For fornecido pelo cliente. Nesta fundação local,
origem no limite de login é a origem da aplicação validada (limite por conta
nesse contexto); identidade de IP/proxy para publicação será validada em T14.
Os limites são persistidos atomicamente: login 5/min por conta+origem e
recuperação 3/h por destinatário, sem armazenar o e-mail na chave.

| Escritor | Arquivos exclusivos | Recursos |
| --- | --- | --- |
| Dados/autorização | `web/prisma/schema.prisma`, `web/src/server/db/client.ts`, `authorization/{store,admin}.ts`, `audit/events.ts`, `auth/{rate-limit,sessions}.ts` | Sem CLI/build/banco; integração pelo root |
| Identidade/API | `web/src/server/auth/{client,session,flows,mfa}.ts`, `web/src/app/api/auth/**`, `web/src/app/api/{lojas,admin}/**`, `web/src/app/conta/**` | Sem npm/build/servidor |
| Integração/testes | `web/tests/integration/**` | Só escrita; execução pelo root |
| Integrador | Env/erros/HTTP/tipos compartilhados, configs, scripts, dependências, migrações e docs | npm, `.next`, bancos e portas em série |

Componente de conta demonstra fluxos reais da fundação; a composição
`/visual-check` continua sem serviços ou persistência. Clientes nunca recebem
conexão de banco/chave de serviço. RLS/grants do schema privado complementam
os filtros Prisma; não declarar que Prisma herda identidade Supabase.

O commit solicitado ocorrerá após a entrega verificada; preparação não será
registrada como T02 concluída. Nenhum agente implementador faz commit.

## Contratos independentes de serviços

`safeReturnPath(value: string | null): string` aceita destinos locais de
`/conta`, `/convites` e `/lojas` com segmentos ASCII de identificadores,
query/hash seguros e fallback `/conta`. Rejeita caminhos externos, relativos,
barra invertida, controles, segmentos de navegação, percent-encoding no
pathname e codificações de query/hash que introduzam controles ou barras
invertidas. Não consulta banco nem implementa regras de convite.

O runner de testes nativos exclui `tests/integration/`; o runner separado
de integração falha quando não há suítes, sem transformar ausência de teste
ou serviço em aprovação. O check de T01 continua independente de banco.

## Aceite restante de T02

- [x] Confirmar D04 de autenticação e preparação do runtime com o idealizador.
- [x] Provar engine/serviços, conexões e credenciais locais efetivas.
- [x] Fixar contratos/esquema mínimos sem presumir D03–D09.
- [x] Gerar migração com `migrate dev --create-only`, revisar SQL, aplicar em
  desenvolvimento e em integração com `migrate deploy`; gerar cliente.
- [x] Provar por HTTP cadastro/verificação/login/renovação/recuperação,
  logout, identidade inválida/expirada/suspensa, MFA administrativo,
  outra loja/relação, papel adulterado e Data API direta.
- [x] Testar migração vazia/evolução com dados fictícios e papéis efetivos.
- [x] Passar gates T01/T03, integração e revisão; registrar limites. Commit pelo integrador ao concluir.

## Preparação inicial — histórico

As observações abaixo precedem a instalação e a implementação. O estado atual
está na seção de execução; a preparação sozinha não comprovava o backend.

D02 foi registrada em `requisitos.md` e `arquitetura.md`. O helper de retorno
passou três testes puros após uma execução inicial sem o módulo; não há rota
de login ou sessão implementada. O check agregado passou com 7 testes do
protótipo, 8 testes nativos da aplicação, lint, tipos e build. O comando de
integração falhou explicitamente porque não há suítes, como esperado; isso
não representa teste do Supabase.

Nenhum pacote Prisma/Supabase, engine, serviço ou migração foi instalado ou
executado. Os dois agentes fizeram análise somente leitura de contratos e
ambiente. WSL2/virtualização foram observados disponíveis, mas não um engine
real; somente a presença do shim npm não comprova Docker.

O ensaio isolado do runner em `.artifacts/t02-discovery-*` confirmou que o
modo padrão não executa integração, o modo explícito executa a suíte e
integração vazia falha. Nenhuma prova de integração real foi substituída por
esse ensaio de descoberta.

Revisão independente somente leitura da preparação concluída sem achados
concretos, sobre cinco arquivos com hashes em
`.artifacts/t02-preparation-review/manifest.json`. Não há consumidor HTTP do
helper, prova de autorização real ou conclusão de T02. O commit de T02
permanece para depois das decisões pendentes, implementação e verificação.

## Execução e evidências

Docker Desktop 4.96.2 instalado manualmente pelo idealizador; engine Linux
29.9.2 comprovado. Supabase CLI 2.121.0, PostgreSQL 17.11, Auth 2.197.0 e
Mailpit 1.31.3 em serviços reais. Imagem do DB:
`public.ecr.aws/supabase/postgres:17.11.0.004`. API/DB/mail saudáveis em loopback, com seis
sondagens não locais recusadas. Scripts selecionam o Docker real por processo.
Predecessores da restrição de portas ficam parados para reversão; nenhuma
configuração global de rede/firewall foi alterada.

Migração estrutural gerada pelo Prisma em desenvolvimento; três migrações
revisadas e aplicadas com deploy em desenvolvimento/integração. A última
libera somente INSERT de createdAt no Profile, necessário porque Prisma
materializa @default(now()) no upsert; a negação inicial foi reproduzida.
O script de prova aplica estrutura em banco vazio, insere perfil fictício e
aplica a evolução sem perder o dado; confere sete tabelas com RLS e nega
leitura anon/authenticated, concessão administrativa, suspensão e DDL no runtime.
Não houve reset nem migração de dados reais.

Gates: check agregado aprovado, com 7 testes do protótipo, 9 nativos, lint,
tipos e build; 26 testes HTTP reais e 28 cenários Chromium em 320/390 px.
HTTP inclui cadastro/verificação e convite seguro, recuperação, login,
JWT adulterado/expirado, refresh real/cookies, logout e cookie copiado,
suspensão, MFA/AAL2, revogação administrativa, outra loja/relação, papel
forjado, Data API, CSRF/corpo e limites sequenciais/concorrentes/janelas.
Os dois lockfiles também foram instalados com `npm ci` em snapshot limpo,
sem `.env` ou serviços, seguido do check agregado aprovado. A configuração de
integração do CI foi escrita, mas não executada remotamente.

Duas revisões independentes somente leitura identificaram e acompanharam
correções: contexto de recuperação adulterável, reuso de challenge de signup
no recover público, QR de MFA, guardas de URL de banco e diagnóstico de rollback.
Os testes dos dois ataques de recuperação falharam antes da correção e
passaram após o vínculo HMAC e a conferência do AMR assinado pelo provedor.
O QR também teve prova de falha e aprovação após normalização do SVG do SDK.
Não restaram achados concretos nas releituras; isso não prova segurança absoluta.

Os estados de UI são controlados no Playwright; não substituem a prova de
Auth/banco, que usa Supabase/PostgreSQL/Mailpit reais. Auditoria anônima e
e-mails fictícios permanecem na stack. Auditoria de produção sem avisos;
cinco avisos altos na cadeia de desenvolvimento do ESLint Next, sem correção
compatível indicada. CI remoto, leitor de tela e aparelhos reais não foram
observados; M1 mantém a pendência manual de T03. D03–D09 fora de Auth continuam
propostas, incluindo paginação, ciclos e regras de negócio.

Comandos e provisionamento administrativo: [identidade local](../../identity-local.md).
Artefatos privados em `.artifacts/t02-runtime/`, fora do Git; nunca anexar
estado, credenciais, mensagens ou logs completos a relatórios públicos.
