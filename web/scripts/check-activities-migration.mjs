import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

/** Executado somente no banco descartável criado por check-migrations. */
export async function checkActivitiesMigration(runtime, { storeId, merchantId, participantId, profileId, otherStoreId }) {
  const activityId = randomUUID();
  const submissionId = randomUUID();
  await runtime.query('INSERT INTO app."Activity" (id,"storeId","createdByProfileId",name,points) VALUES ($1,$2,$3,$4,10)',
    [activityId, storeId, merchantId, 'Atividade de prova']);
  await runtime.query('INSERT INTO app."ActivityEvent" (id,"storeId","activityId","actorProfileId",version,kind,"requestDigest",configuration) VALUES ($1,$2,$1,$3,1,$4,$5,$6)',
    [activityId, storeId, merchantId, 'CREATE', 'a'.repeat(64), '{}']);
  await runtime.query('INSERT INTO app."ActivitySubmission" (id,"storeId","activityId","participantMembershipId","authorProfileId") VALUES ($1,$2,$3,$4,$5)',
    [submissionId, storeId, activityId, participantId, profileId]);
  const credit = () => runtime.query('INSERT INTO app."PointsEntry" (id,"storeId","participantMembershipId","submissionId","actorProfileId",kind,amount,"sourceKey") VALUES ($1,$2,$3,$4,$5,$6,10,$7)',
    [randomUUID(), storeId, participantId, submissionId, profileId, 'ACTIVITY_CREDIT', `submission.credit:${submissionId}`]);
  await assert.rejects(credit(), { code: '23514' });
  await runtime.query(`UPDATE app."ActivitySubmission" SET status='APPROVED',"receivedAt"=now(),"approvedAt"=now(),
    "requestDigest"=$2,"activityVersion"=1,"activityName"='Atividade de prova',"activityDescription"='',
    "activityCategory"='',"activitySticker"='',points=10,frequency='ONCE',"weeklyLimit"=1,"approvalMode"='AUTOMATIC',
    timezone='America/Sao_Paulo',"localDate"='2026-10-22',"periodKey"='ONCE',"occurrenceNumber"=1 WHERE id=$1`,
  [submissionId, 'b'.repeat(64)]);
  await runtime.query('INSERT INTO app."SubmissionEvent" (id,"storeId","submissionId","actorProfileId",kind) VALUES ($1,$2,$3,$4,$5)',
    [randomUUID(), storeId, submissionId, profileId, 'RECEIVED']);
  await credit();
  await assert.rejects(credit(), { code: '23505' });
  await assert.rejects(runtime.query('UPDATE app."ActivitySubmission" SET caption=$1 WHERE id=$2', ['Reescrito', submissionId]), { code: '42501' });
  await assert.rejects(runtime.query('INSERT INTO app."ActivitySubmission" (id,"storeId","activityId","participantMembershipId","authorProfileId") VALUES ($1,$2,$3,$4,$5)',
    [randomUUID(), otherStoreId, activityId, participantId, profileId]), { code: '23503' });
  await assert.rejects(runtime.query('INSERT INTO app."ActivitySubmission" (id,"storeId","activityId","participantMembershipId","authorProfileId") VALUES ($1,$2,$3,$4,$5)',
    [randomUUID(), storeId, activityId, participantId, merchantId]), { code: '23503' });
  for (const table of ['ActivityEvent', 'SubmissionEvent', 'PointsEntry']) {
    await assert.rejects(runtime.query(`UPDATE app."${table}" SET "storeId"=$1`, [storeId]), { code: '42501' });
    await assert.rejects(runtime.query(`DELETE FROM app."${table}"`), { code: '42501' });
    assert.ok((await runtime.query(`SELECT id FROM app."${table}"`)).rowCount > 0);
  }
  const index = await runtime.query("SELECT indexdef FROM pg_indexes WHERE schemaname='app' AND indexname='PointsEntry_initial_credit_key'");
  assert.match(index.rows[0].indexdef, /UNIQUE.*submissionId.*WHERE.*ACTIVITY_CREDIT/);
}
