import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function prepareInvitationCodesMigration(database, { storeId, profileId, participantId, ownerId }) {
  const id = randomUUID();
  await database.query(`INSERT INTO app."Invitation" (id,"storeId","createdByProfileId","tokenHash","expiresAt",
    "acceptedAt","acceptedByProfileId","acceptedMembershipId") VALUES ($1,$2,$3,$4,now()+interval '7 days',now(),$5,$6)`,
  [id, storeId, ownerId, id.replaceAll('-', '').repeat(2), profileId, participantId]);
  return id;
}

export async function invitationCodesSnapshot(database) {
  const invitations = (await database.query(`SELECT to_jsonb(i)-ARRAY['kind','codeHash','codeNonce','creationDigest','maxUses','useCount'] AS row
    FROM app."Invitation" i ORDER BY id`)).rows;
  const outbox = (await database.query(`SELECT to_jsonb(e)-'invitationUseId' AS row FROM app."OutboxEvent" e ORDER BY id`)).rows;
  return { invitations, outbox };
}

export async function checkInvitationCodesMigration(database, runtime, before, acceptedId, { storeId, ownerId }) {
  assert.deepEqual(await invitationCodesSnapshot(database), before);
  const use = (await database.query(`SELECT u.*,i."acceptedAt",i."acceptedByProfileId",i."acceptedMembershipId",i."useCount"
    FROM app."InvitationUse" u JOIN app."Invitation" i ON i.id=u."invitationId" WHERE i.id=$1`, [acceptedId])).rows;
  assert.equal(use.length, 1);
  assert.equal(use[0].createdAt.getTime(), use[0].acceptedAt.getTime());
  assert.equal(use[0].profileId, use[0].acceptedByProfileId);
  assert.equal(use[0].membershipId, use[0].acceptedMembershipId);
  assert.equal(use[0].useCount, 1);
  const codeId = randomUUID();
  const input = [codeId, storeId, ownerId, codeId.replaceAll('-', '').repeat(2), 'd'.repeat(64), 'e'.repeat(64)];
  await runtime.query(`INSERT INTO app."Invitation" (id,"storeId","createdByProfileId","tokenHash",kind,"codeHash","codeNonce","creationDigest","maxUses")
    VALUES ($1,$2,$3,$4,'CODE',$5,0,$6,NULL)`, input);
  assert.equal((await runtime.query('SELECT "expiresAt","maxUses" FROM app."Invitation" WHERE id=$1', [codeId])).rows[0].expiresAt, null);
  await assert.rejects(runtime.query('UPDATE app."Invitation" SET "useCount"=1 WHERE id=$1', [codeId]), { code: '23514' });
  await assert.rejects(runtime.query('UPDATE app."Invitation" SET "maxUses"=3 WHERE id=$1', [codeId]), { code: '42501' });
  await assert.rejects(runtime.query('UPDATE app."InvitationUse" SET "createdAt"=clock_timestamp() WHERE id=$1', [acceptedId]), { code: '42501' });
  await assert.rejects(runtime.query('DELETE FROM app."InvitationUse" WHERE id=$1', [acceptedId]), { code: '42501' });
  for (const role of ['anon', 'authenticated']) {
    await database.query('BEGIN');
    try {
      await database.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(database.query('SELECT * FROM app."InvitationUse"'), { code: '42501' });
    } finally { await database.query('ROLLBACK'); }
  }
  const rls = await database.query(`SELECT relrowsecurity FROM pg_class WHERE oid='app."InvitationUse"'::regclass`);
  assert.equal(rls.rows[0].relrowsecurity, true);
}
