import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { integrationEnvironment } from './environment.mjs';
import { BrowserSession, expectStatus } from './http-client.mjs';

export async function createFixture(t) {
  const environment = integrationEnvironment();
  const database = new pg.Pool({ connectionString: environment.databaseURL, max: 2, connectionTimeoutMillis: 5000 });
  const authDatabase = environment.authDatabaseURL === environment.databaseURL ? database :
    new pg.Pool({ connectionString: environment.authDatabaseURL, max: 1, connectionTimeoutMillis: 5000 });
  const auth = createClient(environment.supabaseURL, environment.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const userIds = new Set();
  const emails = new Set();
  const storeIds = new Set();
  const rateKeys = new Set();
  const newEmail = () => `t02-${randomUUID()}@example.test`;
  const client = () => new BrowserSession(environment);

  async function createUser({ confirmed = true } = {}) {
    const email = newEmail();
    const password = `T02!${randomUUID()}`;
    emails.add(email);
    const { data, error } = await auth.auth.admin.createUser({ email, password, email_confirm: confirmed });
    assert.equal(error, null, 'A fixture exige o Auth real da stack local.');
    assert.ok(data.user?.id);
    userIds.add(data.user.id);
    return { id: data.user.id, email, password, client: client() };
  }

  async function login(user) {
    const response = await user.client.post('/api/auth/login', { email: user.email, password: user.password });
    expectStatus(response, 200);
    return user;
  }

  async function createStore(owner, name = 'Lojinha de integração') {
    const id = randomUUID();
    await database.query('INSERT INTO app."Store" (id, "createdByProfileId", name) VALUES ($1, $2, $3)',
      [id, owner.id, name]);
    storeIds.add(id);
    return { id, name };
  }

  async function addMembership(store, user, role = 'PARTICIPANT') {
    const id = randomUUID();
    await database.query('INSERT INTO app."Membership" (id, "storeId", "profileId", role) VALUES ($1, $2, $3, $4)',
      [id, store.id, user.id, role]);
    return { id, storeId: store.id, profileId: user.id, role };
  }

  async function deleteChain(table, reference, scope, values) {
    assert.ok(['PointsEntry:compensatesEntryId', 'SubmissionReviewEvent:requestId', 'RedemptionEvent:requestId'].includes(table + ':' + reference));
    const ids = (await database.query(`SELECT id FROM app."${table}" WHERE ${scope}`, values)).rows.map(row => row.id);
    let remaining = ids.length;
    while (remaining) {
      const result = await database.query(`DELETE FROM app."${table}" parent WHERE parent.id=ANY($1::uuid[])
        AND NOT EXISTS (SELECT 1 FROM app."${table}" child WHERE child."${reference}"=parent.id)`, [ids]);
      assert.ok(result.rowCount, 'A limpeza não pode romper referências fora desta fixture.');
      remaining -= result.rowCount;
    }
  }

  async function cleanup() {
    try {
      if (emails.size) {
        const result = await authDatabase.query('SELECT id FROM auth.users WHERE email = ANY($1::text[])', [[...emails]]);
        for (const row of result.rows) userIds.add(row.id);
        assert.ok(process.env.AUTH_RATE_LIMIT_SECRET, 'A limpeza exige o segredo da stack de testes.');
        for (const email of emails) for (const kind of ['login', 'recovery']) {
          rateKeys.add(createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET)
            .update(kind).update('\0').update(email.trim().toLowerCase()).update('\0')
            .update(kind === 'login' ? environment.origin : '').digest('hex'));
        }
      }
      const profiles = [...userIds];
      for (const profile of profiles) for (const kind of ['read', 'write']) {
        rateKeys.add(createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET)
          .update('meumimo:t04:domain-rate:v1\0').update(kind).update('\0').update(profile).digest('hex'));
      }
      for (const profile of profiles) for (const kind of ['reserve', 'part']) {
        rateKeys.add(createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET)
          .update(`media-${kind}\0${profile}`).digest('hex'));
      }
      const scope = '"storeId" = ANY($1::uuid[]) OR "actorProfileId" = ANY($2::uuid[]) OR "participantMembershipId" IN (SELECT id FROM app."Membership" WHERE "profileId" = ANY($2::uuid[])) OR "recipientMembershipId" IN (SELECT id FROM app."Membership" WHERE "profileId" = ANY($2::uuid[]))';
      const scopeValues = [[...storeIds], profiles];
      await database.query(`DELETE FROM app."Notification" WHERE "eventId" IN (SELECT id FROM app."OutboxEvent" WHERE ${scope})`, scopeValues);
      await database.query(`DELETE FROM app."OutboxEvent" WHERE ${scope}`, scopeValues);
      const submissionScope = '"storeId" = ANY($1::uuid[]) OR "authorProfileId" = ANY($2::uuid[]) OR "participantMembershipId" IN (SELECT id FROM app."Membership" WHERE "profileId" = ANY($2::uuid[]))';
      await deleteChain('PointsEntry', 'compensatesEntryId',
        `"storeId" = ANY($1::uuid[]) OR "submissionId" IN (SELECT id FROM app."ActivitySubmission" WHERE ${submissionScope}) OR "redemptionId" IN (SELECT id FROM app."Redemption" WHERE ${submissionScope}) OR "actorProfileId" = ANY($2::uuid[])`, scopeValues);
      await deleteChain('RedemptionEvent', 'requestId', `"redemptionId" IN (SELECT id FROM app."Redemption" WHERE ${submissionScope}) OR "actorProfileId" = ANY($2::uuid[])`, scopeValues);
      await database.query(`DELETE FROM app."Redemption" WHERE ${submissionScope}`, scopeValues);
      await database.query('DELETE FROM app."RewardEvent" WHERE "storeId" = ANY($1::uuid[]) OR "actorProfileId" = ANY($2::uuid[])', scopeValues);
      await database.query('DELETE FROM app."Reward" WHERE "storeId" = ANY($1::uuid[]) OR "createdByProfileId" = ANY($2::uuid[])', scopeValues);
      await deleteChain('SubmissionReviewEvent', 'requestId',
        `"submissionId" IN (SELECT id FROM app."ActivitySubmission" WHERE ${submissionScope}) OR "actorProfileId" = ANY($2::uuid[])`, scopeValues);
      await database.query(`DELETE FROM app."SubmissionEvent" WHERE "submissionId" IN (SELECT id FROM app."ActivitySubmission" WHERE ${submissionScope}) OR "actorProfileId" = ANY($2::uuid[])`, scopeValues);
      await database.query(`DELETE FROM app."ActivitySubmission" WHERE ${submissionScope}`, scopeValues);
      await database.query('DELETE FROM app."ActivityEvent" WHERE "storeId" = ANY($1::uuid[]) OR "actorProfileId" = ANY($2::uuid[])', scopeValues);
      await database.query('DELETE FROM app."Activity" WHERE "storeId" = ANY($1::uuid[]) OR "createdByProfileId" = ANY($2::uuid[])', scopeValues);
      const conversationScope = '"storeId" = ANY($1::uuid[]) OR "participantMembershipId" IN (SELECT id FROM app."Membership" WHERE "profileId" = ANY($2::uuid[]))';
      await database.query(`DELETE FROM app."Comment" WHERE "authorProfileId" = ANY($2::uuid[]) OR "conversationId" IN (SELECT id FROM app."Conversation" WHERE ${conversationScope})`, scopeValues);
      await database.query(`DELETE FROM app."Conversation" WHERE ${conversationScope}`, scopeValues);
      const mediaScope = '"authorProfileId" = ANY($2::uuid[]) OR "collectionId" IN (SELECT id FROM app."MediaCollection" WHERE ' + conversationScope + ')';
      const media = await database.query(`SELECT id FROM app."MediaAsset" WHERE ${mediaScope}`, scopeValues);
      if (media.rowCount) {
        assert.ok(['t06', 't07', 't08', 't09', 't10'].includes(environment.task), 'Mídia de fixture só pode existir nos domínios reservados T06/T07/T08/T09/T10.');
        const { listAssetObjects, deleteObjects } = await import('../../../src/server/media-worker/storage.ts');
        for (const item of media.rows) await deleteObjects(await listAssetObjects(item.id));
      }
      await database.query(`DELETE FROM app."MediaPart" WHERE "assetId" IN (SELECT id FROM app."MediaAsset" WHERE ${mediaScope})`, scopeValues);
      await database.query(`DELETE FROM app."MediaAsset" WHERE ${mediaScope}`, scopeValues);
      await database.query(`DELETE FROM app."MediaCollection" WHERE ${conversationScope}`, scopeValues);
      await database.query('DELETE FROM app."StoreAudit" WHERE "actorProfileId" = ANY($1::uuid[]) OR "storeId" = ANY($2::uuid[])', [profiles, [...storeIds]]);
      await database.query('DELETE FROM app."Invitation" WHERE "createdByProfileId" = ANY($1::uuid[]) OR "acceptedByProfileId" = ANY($1::uuid[]) OR "storeId" = ANY($2::uuid[])', [profiles, [...storeIds]]);
      await database.query('DELETE FROM app."SecurityAudit" WHERE "actorProfileId" = ANY($1::uuid[])', [profiles]);
      await database.query('DELETE FROM app."AuthSession" WHERE "profileId" = ANY($1::uuid[])', [profiles]);
      await database.query('DELETE FROM app."AdminGrant" WHERE "profileId" = ANY($1::uuid[])', [profiles]);
      await database.query('DELETE FROM app."Membership" WHERE "storeId" = ANY($1::uuid[]) OR "profileId" = ANY($2::uuid[])',
        [[...storeIds], profiles]);
      await database.query('DELETE FROM app."Store" WHERE id = ANY($1::uuid[])', [[...storeIds]]);
      await database.query('DELETE FROM app."Profile" WHERE id = ANY($1::uuid[])', [profiles]);
      if (rateKeys.size) await database.query('DELETE FROM app."AuthRateBucket" WHERE key = ANY($1::text[])', [[...rateKeys]]);
      for (const id of profiles) {
        const { error } = await auth.auth.admin.deleteUser(id);
        assert.equal(error, null, 'A limpeza deve remover somente usuários criados pela fixture.');
      }
    } finally {
      await database.end();
      if (authDatabase !== database) await authDatabase.end();
    }
  }

  t.after(cleanup);
  await database.query('SELECT 1');
  return {
    environment, database, auth, client, createUser, login, createStore, addMembership, newEmail,
    trackEmail: email => emails.add(email), trackUser: id => userIds.add(id), trackStore: id => storeIds.add(id), trackRateKey: key => rateKeys.add(key),
  };
}
