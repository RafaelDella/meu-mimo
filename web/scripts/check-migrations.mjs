import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { artifactRoot, readState, webRoot } from './local-runtime.mjs';

const state = readState();
const databaseName = `meumimo_t02_migrations_${randomUUID().replaceAll('-', '')}`;
if (!/^meumimo_t02_migrations_[a-f0-9]{32}$/.test(databaseName)) throw new Error('Banco de prova inválido.');
const target = new URL(state.integration.T02_DATABASE_URL);
target.pathname = `/${databaseName}`;
target.searchParams.set('schema', 'app');
const directory = path.join(artifactRoot, databaseName);
const migrations = path.join(directory, 'migrations');
mkdirSync(migrations, { recursive: true });
const source = path.join(webRoot, 'prisma/migrations');
const names = readdirSync(source).filter(name => /^\d{14}_/.test(name)).sort();
assert.ok(names.length >= 2, 'A prova precisa de estrutura e evolução de permissões.');
cpSync(path.join(source, 'migration_lock.toml'), path.join(migrations, 'migration_lock.toml'));
cpSync(path.join(source, names[0]), path.join(migrations, names[0]), { recursive: true });
const configuration = path.join(directory, 'prisma.config.mjs');
writeFileSync(configuration, `export default ${JSON.stringify({
  schema: path.join(webRoot, 'prisma/schema.prisma'),
  migrations: { path: migrations }, datasource: { url: target.toString() },
})};\n`, { mode: 0o600 });

function deploy() {
  execFileSync(process.execPath, [path.join(webRoot, 'node_modules/prisma/build/index.js'),
    'migrate', 'deploy', '--config', configuration], {
    cwd: webRoot, stdio: 'inherit', windowsHide: true,
  });
}

const administrator = new pg.Client({ connectionString: state.integration.T02_DATABASE_URL });
await administrator.connect();
let created = false;
let database;
let runtime;
try {
  // Nome imprevisível, exclusivo desta execução; nunca esvazia bancos existentes.
  await administrator.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  deploy();
  database = new pg.Client({ connectionString: target.toString() });
  await database.connect();
  const id = randomUUID();
  const storeId = randomUUID();
  const membershipId = randomUUID();
  await database.query('INSERT INTO app."Profile" (id, "displayName") VALUES ($1, $2)', [id, 'Pessoa fictícia']);
  await database.query('INSERT INTO app."Store" (id, "createdByProfileId", name) VALUES ($1, $2, $3)', [storeId, id, 'Lojinha anterior']);
  await database.query('INSERT INTO app."Membership" (id, "storeId", "profileId", role) VALUES ($1, $2, $3, $4)', [membershipId, storeId, id, 'MERCHANT']);
  for (const name of names.slice(1)) cpSync(path.join(source, name), path.join(migrations, name), { recursive: true });
  deploy();
  const preserved = await database.query('SELECT "displayName" FROM app."Profile" WHERE id = $1', [id]);
  assert.equal(preserved.rows[0].displayName, 'Pessoa fictícia');
  const applied = await database.query('SELECT count(*)::int AS count FROM app._prisma_migrations WHERE finished_at IS NOT NULL');
  assert.equal(applied.rows[0].count, names.length);
  const policies = await database.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'app' AND rowsecurity = true");
  assert.equal(policies.rows[0].count, 13);
  const priorStore = await database.query('SELECT state, timezone, name FROM app."Store" WHERE id = $1', [storeId]);
  assert.deepEqual(priorStore.rows[0], { state: 'ACTIVE', timezone: 'America/Sao_Paulo', name: 'Lojinha anterior' });
  const priorMembership = await database.query('SELECT "closedAt", role FROM app."Membership" WHERE id = $1', [membershipId]);
  assert.deepEqual(priorMembership.rows[0], { closedAt: null, role: 'MERCHANT' });
  const secondProfile = randomUUID();
  await database.query('INSERT INTO app."Profile" (id) VALUES ($1)', [secondProfile]);
  await assert.rejects(database.query('INSERT INTO app."Membership" (id, "storeId", "profileId", role) VALUES ($1, $2, $3, $4)',
    [randomUUID(), storeId, secondProfile, 'MERCHANT']), { code: '23505' });
  await assert.rejects(database.query('INSERT INTO app."Membership" (id, "storeId", "profileId", role) VALUES ($1, $2, $3, $4)',
    [randomUUID(), storeId, id, 'PARTICIPANT']), { code: '23505' });
  const flags = await database.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = 'meumimo_runtime'");
  assert.ok(Object.values(flags.rows[0]).every(value => value === false));
  for (const role of ['anon', 'authenticated']) {
    await database.query('BEGIN');
    try {
      await database.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(database.query('SELECT * FROM app."Profile"'), { code: '42501' });
    } finally { await database.query('ROLLBACK'); }
    for (const table of ['Invitation', 'StoreAudit', 'Conversation', 'Comment', 'OutboxEvent', 'Notification']) {
      await database.query('BEGIN');
      try {
        await database.query(`SET LOCAL ROLE ${role}`);
        await assert.rejects(database.query(`SELECT * FROM app."${table}"`), { code: '42501' });
      } finally { await database.query('ROLLBACK'); }
    }
  }
  const runtimeURL = new URL(state.runtime.DATABASE_URL);
  runtimeURL.pathname = `/${databaseName}`;
  runtime = new pg.Client({ connectionString: runtimeURL.toString() });
  await runtime.connect();
  await runtime.query('UPDATE app."Profile" SET "displayName" = $1 WHERE id = $2', ['Nome atualizado', id]);
  const invitationId = randomUUID();
  await runtime.query('INSERT INTO app."Invitation" (id, "storeId", "createdByProfileId", "tokenHash", "expiresAt") VALUES ($1, $2, $3, $4, now() + interval \'7 days\')',
    [invitationId, storeId, id, 'a'.repeat(64)]);
  assert.equal((await runtime.query('SELECT id FROM app."Invitation" WHERE id = $1', [invitationId])).rowCount, 1);
  await runtime.query('UPDATE app."Invitation" SET "revokedAt" = now() WHERE id = $1', [invitationId]);
  await assert.rejects(runtime.query('UPDATE app."Invitation" SET "tokenHash" = $1 WHERE id = $2', ['b'.repeat(64), invitationId]), { code: '42501' });
  await assert.rejects(runtime.query('DELETE FROM app."Invitation" WHERE id = $1', [invitationId]), { code: '42501' });
  const participantId = randomUUID();
  const conversationId = randomUUID();
  const commentId = randomUUID();
  const eventId = randomUUID();
  const notificationId = randomUUID();
  await runtime.query('INSERT INTO app."Membership" (id, "storeId", "profileId", role) VALUES ($1,$2,$3,$4)',
    [participantId, storeId, secondProfile, 'PARTICIPANT']);
  await runtime.query('INSERT INTO app."Conversation" (id,"storeId","participantMembershipId","subjectType","subjectId") VALUES ($1,$2,$3,$4,$5)',
    [conversationId, storeId, participantId, 'TICKET', randomUUID()]);
  await runtime.query('INSERT INTO app."Comment" (id,"conversationId","authorProfileId",text) VALUES ($1,$2,$3,$4)',
    [commentId, conversationId, id, 'Comentário fictício']);
  await assert.rejects(runtime.query('UPDATE app."Comment" SET text = $1 WHERE id = $2', ['Alterado', commentId]), { code: '42501' });
  await assert.rejects(runtime.query('UPDATE app."Conversation" SET "subjectId" = $1 WHERE id = $2', [randomUUID(), conversationId]), { code: '42501' });
  await runtime.query('INSERT INTO app."OutboxEvent" (id,key,kind,"storeId","participantMembershipId","actorProfileId","recipientMembershipId","commentId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [eventId, `comment.created:${commentId}`, 'COMMENT_CREATED', storeId, participantId, id, participantId, commentId]);
  await runtime.query('INSERT INTO app."Notification" (id,"eventId") VALUES ($1,$2)', [notificationId, eventId]);
  await runtime.query('UPDATE app."Notification" SET "readAt" = now() WHERE id = $1', [notificationId]);
  await assert.rejects(runtime.query('UPDATE app."OutboxEvent" SET "recipientMembershipId" = $1 WHERE id = $2', [membershipId, eventId]), { code: '42501' });
  await assert.rejects(runtime.query('DELETE FROM app."Notification" WHERE id = $1', [notificationId]), { code: '42501' });
  await assert.rejects(runtime.query('UPDATE app."Membership" SET role = $1 WHERE id = $2', ['PARTICIPANT', membershipId]), { code: '42501' });
  assert.equal((await runtime.query('SELECT id FROM app."Profile" WHERE id = $1', [id])).rowCount, 1);
  await assert.rejects(runtime.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [id]), { code: '42501' });
  await assert.rejects(runtime.query('UPDATE app."Profile" SET "suspendedAt" = now() WHERE id = $1', [id]), { code: '42501' });
  await assert.rejects(runtime.query('CREATE TABLE app.forbidden (id int)'), { code: '42501' });
  process.stdout.write('Migrações: banco vazio, evolução com dados preservados, RLS e privilégios efetivos comprovados.\n');
} finally {
  await runtime?.end();
  await database?.end();
  if (created) await administrator.query(`DROP DATABASE "${databaseName}"`);
  await administrator.end();
}
