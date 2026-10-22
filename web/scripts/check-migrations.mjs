import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { artifactRoot, readState, webRoot } from './local-runtime.mjs';
import { checkActivitiesMigration } from './check-activities-migration.mjs';
import { checkReviewsMigration } from './check-reviews-migration.mjs';
import { checkRedemptionsMigration } from './check-redemptions-migration.mjs';
import { checkTicketsMigration } from './check-tickets-migration.mjs';
import { checkAlbumsMigration } from './check-albums-migration.mjs';

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
  const beforeReviews = names.filter(name => name < '20261022235900');
  for (const name of beforeReviews.slice(1)) cpSync(path.join(source, name), path.join(migrations, name), { recursive: true });
  deploy();
  const preserved = await database.query('SELECT "displayName" FROM app."Profile" WHERE id = $1', [id]);
  assert.equal(preserved.rows[0].displayName, 'Pessoa fictícia');
  const applied = await database.query('SELECT count(*)::int AS count FROM app._prisma_migrations WHERE finished_at IS NOT NULL');
  assert.equal(applied.rows[0].count, beforeReviews.length);
  const policies = await database.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'app' AND rowsecurity = true");
  assert.equal(policies.rows[0].count, 21);
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
    for (const table of ['Invitation', 'StoreAudit', 'Conversation', 'Comment', 'OutboxEvent', 'Notification', 'MediaCollection', 'MediaAsset', 'MediaPart',
      'Activity', 'ActivityEvent', 'ActivitySubmission', 'SubmissionEvent', 'PointsEntry']) {
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
  const collectionId = randomUUID();
  const assetId = randomUUID();
  await runtime.query('INSERT INTO app."MediaCollection" (id,"storeId","participantMembershipId",purpose,"subjectId") VALUES ($1,$2,$3,$4,$5)',
    [collectionId, storeId, participantId, 'MEMORY', randomUUID()]);
  await runtime.query('INSERT INTO app."MediaAsset" (id,"collectionId","authorProfileId",revision,"mediaType","mimeType","byteLength",sha256) VALUES ($1,$2,$3,1,$4,$5,1,$6)',
    [assetId, collectionId, id, 'PHOTO', 'image/jpeg', 'c'.repeat(64)]);
  await runtime.query('INSERT INTO app."MediaPart" ("assetId", "offset", "byteLength", sha256) VALUES ($1,0,1,$2)', [assetId, 'c'.repeat(64)]);
  await runtime.query('UPDATE app."MediaAsset" SET "uploadedBytes" = 1, state = $1 WHERE id = $2', ['QUEUED', assetId]);
  await runtime.query('UPDATE app."MediaCollection" SET "uploadsClosedAt" = now() WHERE id = $1', [collectionId]);
  assert.equal((await runtime.query('SELECT id FROM app."MediaAsset" WHERE id = $1', [assetId])).rowCount, 1);
  for (const [sql, values] of [
    ['UPDATE app."MediaAsset" SET "authorProfileId" = $1 WHERE id = $2', [secondProfile, assetId]],
    ['UPDATE app."MediaAsset" SET sha256 = $1 WHERE id = $2', ['d'.repeat(64), assetId]],
    ['UPDATE app."MediaCollection" SET "subjectId" = $1 WHERE id = $2', [randomUUID(), collectionId]],
    ['UPDATE app."MediaPart" SET sha256 = $1 WHERE "assetId" = $2', ['d'.repeat(64), assetId]],
    ['DELETE FROM app."MediaAsset" WHERE id = $1', [assetId]],
  ]) await assert.rejects(runtime.query(sql, values), { code: '42501' });
  await runtime.query('DELETE FROM app."MediaPart" WHERE "assetId" = $1', [assetId]);
  const otherStoreId = randomUUID();
  await runtime.query('INSERT INTO app."Store" (id,"createdByProfileId") VALUES ($1,$2)', [otherStoreId, id]);
  await assert.rejects(runtime.query('INSERT INTO app."MediaCollection" (id,"storeId","participantMembershipId",purpose,"subjectId") VALUES ($1,$2,$3,$4,$5)',
    [randomUUID(), otherStoreId, participantId, 'MEMORY', randomUUID()]), { code: '23503' });
  const preservedConstraints = await runtime.query("SELECT count(*)::int AS count FROM pg_constraint WHERE conname = ANY($1::text[])",
    [['Conversation_membership_store_fkey', 'OutboxEvent_participant_store_fkey', 'OutboxEvent_recipient_store_fkey', 'MediaCollection_membership_store_fkey']]);
  assert.equal(preservedConstraints.rows[0].count, 4);
  await assert.rejects(runtime.query('UPDATE app."Membership" SET role = $1 WHERE id = $2', ['PARTICIPANT', membershipId]), { code: '42501' });
  assert.equal((await runtime.query('SELECT id FROM app."Profile" WHERE id = $1', [id])).rowCount, 1);
  await assert.rejects(runtime.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [id]), { code: '42501' });
  await assert.rejects(runtime.query('UPDATE app."Profile" SET "suspendedAt" = now() WHERE id = $1', [id]), { code: '42501' });
  await assert.rejects(runtime.query('CREATE TABLE app.forbidden (id int)'), { code: '42501' });
  await checkActivitiesMigration(runtime, { storeId, merchantId: id, participantId, profileId: secondProfile, otherStoreId });
  // O crédito T07 existe antes da evolução de análise e deve sobreviver intacto.
  for (const name of names.filter(name => name >= '20261022235900' && name < '20261022235940')) {
    cpSync(path.join(source, name), path.join(migrations, name), { recursive: true });
  }
  deploy();
  assert.equal((await database.query('SELECT count(*)::int AS count FROM app._prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].count,
    names.filter(name => name < '20261022235940').length);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='app' AND rowsecurity=true")).rows[0].count, 22);
  for (const role of ['anon', 'authenticated']) {
    await database.query('BEGIN');
    try {
      await database.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(database.query('SELECT * FROM app."SubmissionReviewEvent"'), { code: '42501' });
    } finally { await database.query('ROLLBACK'); }
  }
  await checkReviewsMigration(runtime, { storeId, merchantId: id, participantId, profileId: secondProfile, otherStoreId });
  const priorPoints = await database.query('SELECT to_jsonb(p) AS row FROM app."PointsEntry" p ORDER BY id');
  const priorSubmissions = await database.query('SELECT to_jsonb(s) AS row FROM app."ActivitySubmission" s ORDER BY id');
  for (const name of names.filter(name => name >= '20261022235940' && name < '20261022235950')) {
    cpSync(path.join(source, name), path.join(migrations, name), { recursive: true });
  }
  deploy();
  assert.equal((await database.query('SELECT count(*)::int AS count FROM app._prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].count,
    names.filter(name => name < '20261022235950').length);
  const nextPoints = await database.query('SELECT to_jsonb(p)-\'redemptionId\' AS row FROM app."PointsEntry" p ORDER BY id');
  assert.deepEqual(nextPoints.rows, priorPoints.rows, 'A cadeia financeira anterior deve permanecer intacta.');
  assert.deepEqual((await database.query('SELECT to_jsonb(s) AS row FROM app."ActivitySubmission" s ORDER BY id')).rows, priorSubmissions.rows);
  await checkRedemptionsMigration(database, runtime, { storeId, merchantId: id, participantId, profileId: secondProfile, otherStoreId });
  const beforeTickets = new Map();
  for (const table of ['Redemption', 'RedemptionEvent', 'Reward', 'RewardEvent', 'PointsEntry', 'OutboxEvent', 'ActivitySubmission']) {
    beforeTickets.set(table, (await database.query(`SELECT to_jsonb(t) AS row FROM app."${table}" t ORDER BY id`)).rows);
  }
  for (const name of names.filter(name => name >= '20261022235950' && name < '20261023001000')) {
    cpSync(path.join(source, name), path.join(migrations, name), { recursive: true });
  }
  deploy();
  assert.equal((await database.query('SELECT count(*)::int AS count FROM app._prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].count,
    names.filter(name => name < '20261023001000').length);
  const added = { Redemption: ['version', 'agreementText', 'agreementDate', 'cancellationFromStatus', 'fulfilledAt', 'cancelledAt'],
    RedemptionEvent: ['version', 'fromStatus', 'toStatus', 'text', 'agreementDate', 'requestDigest', 'requestId', 'delta',
      'restocked', 'stockBefore', 'stockAfter', 'stockRevision', 'balanceBefore', 'balanceAfter'],
    PointsEntry: ['redemptionEventId'], OutboxEvent: ['redemptionEventId'] };
  for (const [table, rows] of beforeTickets) {
    const current = (await database.query(`SELECT to_jsonb(t)-$1::text[] AS row FROM app."${table}" t ORDER BY id`, [added[table] ?? []])).rows;
    assert.deepEqual(current, rows, `T10 deve preservar integralmente os dados anteriores de ${table}.`);
  }
  await checkTicketsMigration(database, runtime, { storeId, merchantId: id, participantId, profileId: secondProfile, otherStoreId });
  const beforeAlbums = new Map();
  for (const table of ['Profile', 'Store', 'Membership', 'Reward', 'RewardEvent', 'Redemption', 'RedemptionEvent',
    'Activity', 'ActivityEvent', 'ActivitySubmission', 'SubmissionEvent', 'SubmissionReviewEvent', 'PointsEntry',
    'OutboxEvent', 'Notification', 'Conversation', 'Comment', 'MediaCollection', 'MediaAsset']) {
    beforeAlbums.set(table, (await database.query(`SELECT to_jsonb(t) AS row FROM app."${table}" t ORDER BY id`)).rows);
  }
  const beforeParts = (await database.query('SELECT to_jsonb(t) AS row FROM app."MediaPart" t ORDER BY "assetId", "offset"')).rows;
  for (const name of names.filter(name => name >= '20261023001000')) {
    cpSync(path.join(source, name), path.join(migrations, name), { recursive: true });
  }
  deploy();
  assert.equal((await database.query('SELECT count(*)::int AS count FROM app._prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].count, names.length);
  for (const [table, rows] of beforeAlbums) {
    const current = (await database.query(`SELECT to_jsonb(t)-$1::text[] AS row FROM app."${table}" t ORDER BY id`,
      [table === 'OutboxEvent' ? ['albumEventId'] : []])).rows;
    assert.deepEqual(current, rows, `T11 deve preservar todas as colunas anteriores de ${table}.`);
  }
  assert.deepEqual((await database.query('SELECT to_jsonb(t) AS row FROM app."MediaPart" t ORDER BY "assetId", "offset"')).rows, beforeParts);
  assert.equal((await runtime.query('SELECT id FROM app."TicketAlbum"')).rowCount, 0, 'Não associar coleções antigas implicitamente.');
  await checkAlbumsMigration(database, runtime, { storeId, merchantId: id, participantId, profileId: secondProfile,
    otherStoreId, legacyCollectionId: collectionId });
  process.stdout.write('Migrações: banco vazio, evolução com dados preservados, RLS e privilégios efetivos comprovados.\n');
} finally {
  await runtime?.end();
  await database?.end();
  if (created) await administrator.query(`DROP DATABASE "${databaseName}"`);
  await administrator.end();
}
