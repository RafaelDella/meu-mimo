# Identidade local — T02

Esta configuração atende desenvolvimento/testes fictícios, sem publicação.
Requer Node 24.12, os dois pacotes instalados e um engine Docker Linux ativo.
No Windows, os scripts procuram o executável do Docker Desktop por usuário
ou em Program Files; não executam o pacote npm homônimo e não alteram o PATH global.

## Preparar e executar

Na raiz, sem outro processo usando as portas reservadas:

```sh
npm --prefix web run local:start
npm --prefix web run local:prepare
npm --prefix web run db:migrate:dev
npm --prefix web run db:migrate:integration
npm --prefix web run db:migrate:check
npm run check
npm run web:test:integration
npm run web:test:e2e
```

`local:start` usa o CLI Supabase fixado no lockfile. A stack `meumimo-t02`
expõe somente API 54321, PostgreSQL 54322 e Mailpit 54324, em `127.0.0.1`.
Studio, Edge Runtime, analytics, pooler e processamento de imagens estão
desligados. Storage e Realtime são serviços da stack; seus fluxos de produto
ainda não foram implementados nem homologados.

O CLI 2.121.0 publica sem IP explícito. O helper de bind valida nomes,
labels, workdir, rede e volume antes de recriar apenas DB, Kong e Mailpit
com o mesmo image ID e mounts. Preserva os arquivos provisionados pelo CLI,
confere seu conteúdo em memória e verifica saúde e portas. Guarda os
predecessores parados para reversão. **Não inicie os predecessores sobre o
volume do DB em uso.** Se houver falha de restauração, o comando identifica
os nomes pendentes; resolva essa situação antes de iniciar outra stack.
Não use `supabase start` diretamente para contornar a restrição de portas.

O bootstrap cria `meumimo_t02_dev` para desenvolvimento e
`meumimo_t02_shadow` para geração de migrações; integração usa `postgres`
da mesma stack exclusiva. Não reseta nenhum banco existente.
`db:migrate:check` cria um banco de prova com nome aleatório reservado,
aplica estrutura, insere dados fictícios e aplica a evolução; ao terminar,
remove somente esse banco que acabou de criar. Os comandos recusam hosts,
portas, bancos ou parâmetros de conexão fora do contrato local.

O estado privado fica em `.artifacts/t02-runtime/integration.json`, ignorado.
Contém conexões de migração, credencial administrativa dos fixtures e o
segredo local de assinatura/limites. Não compartilhe seus arquivos ou logs.
`.env.local` recebe a conexão restrita de desenvolvimento, a chave publicável
do Auth, APP_ORIGIN, SUPABASE_URL e AUTH_RATE_LIMIT_SECRET. Não recebe as
credenciais administrativas. O bootstrap preserva arquivos personalizados; remova o
marcador da primeira linha antes de gerenciá-lo manualmente. Nunca coloque
service role ou conexão de migração em um arquivo carregado pelo Next.

Para desenvolver, execute `npm run web:dev` e abra
[conta](http://127.0.0.1:4301/conta). Os e-mails chegam somente ao
[Mailpit local](http://127.0.0.1:54324). Abra o link no mesmo navegador que
iniciou o cadastro/recuperação, pois o callback exige PKCE e contexto assinado.
O destino de convite é preservado; [T04](stores-local.md) implementa seu domínio.

## Migrações e papéis

Edite `web/prisma/schema.prisma`, use `db:migrate:create`, revise o SQL e
adicione permissões na mesma cadeia antes de aplicar com os comandos acima.
Não edite migrações já aplicadas. Não mantenha migrações Supabase concorrentes
para `app` nem recrie os schemas internos de Auth/Storage.

O runtime usa `meumimo_runtime`, sem superuser, criação de banco/papel ou
bypass de RLS. Pode criar perfis verificados, sessões, buckets e auditoria;
T04 também permite criar lojas/participações/convites e atualizar somente suas
colunas autorizadas. Grants permanecem somente leitura. Não pode inserir AdminGrant nem
alterar a suspensão de segurança. O schema `app` fica fora da Data API e
sem acesso para `anon`/`authenticated`. RLS restringe o papel de conexão;
os filtros de pessoa/loja continuam na aplicação, porque Prisma não recebe
a identidade Supabase automaticamente. Pool Prisma: máximo 5 conexões,
espera de conexão 5 s e ociosidade 10 s; nenhum pooling remoto foi validado.

## Administração separada

Não há cadastro público nem API de concessão administrativa. Para uma conta
local fictícia já verificada e com primeiro login concluído, o operador pode
provisionar o UUID do perfil por uma conexão administrativa ao banco de
desenvolvimento. Confira o UUID e o banco antes de executar o SQL:

```sql
INSERT INTO app."AdminGrant" ("profileId")
SELECT id FROM app."Profile"
WHERE id = 'UUID-DO-PERFIL'::uuid AND "suspendedAt" IS NULL
ON CONFLICT ("profileId") DO UPDATE
SET "grantedAt" = now(), "revokedAt" = NULL;
```

O grant não evita MFA: configure TOTP em `/conta` e confirme o código para
obter AAL2. `/api/admin/session` exige os dois requisitos e não concede acesso
a lojas. Para revogar, atualize `revokedAt` do grant com `now()` pela mesma
conexão administrativa. A próxima requisição verifica novamente o grant.
Não há interface administrativa completa nesta etapa.

## Verificação e limites

O driver de integração recusa reutilizar a porta 4302, inicia seu próprio
build de produção sem credenciais administrativas, testa por HTTP e encerra
somente esse processo. O build deve estar atualizado antes da execução.
Os fixtures usam service role e conexão de migração em processo separado,
criam pessoas fictícias e removem seus perfis, lojas, vínculos, sessões,
grants e buckets identificáveis. Auditoria anônima e mensagens fictícias
permanecem no ambiente de testes; não use dados pessoais nessa stack.

Login permite 5 tentativas/minuto por conta e origem validada da aplicação;
recuperação, 3/hora por destinatário. A origem não é um IP enviado pelo
cliente. IP confiável/proxy, controles globais e retenção operacional serão
reavaliados antes de publicar em T14. Paginação 20/máximo 50, leitura 120/minuto
e mutação 30/minuto por conta foram confirmados para T04. Upload e demais
políticas D04 continuam pendentes.

O Supabase local usa JWT de 5 minutos para testar renovação. Cookies são
HttpOnly, SameSite=Lax e Secure quando a origem usa HTTPS. Recuperação exige
contexto assinado vinculado ao verifier, com validade de uma hora, e método
AMR compatível no JWT verificado do Auth. Esse contexto não
autoriza loja/admin antes da troca de senha. Tokens, senha e e-mail não
entram na auditoria técnica. Publicação e serviços pagos continuam fora do escopo.
