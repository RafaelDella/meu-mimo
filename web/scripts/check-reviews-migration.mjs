import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function transaction(runtime, operation) {
  await runtime.query('BEGIN');
  try {
    const result = await operation();
    await runtime.query('COMMIT');
    return result;
  } catch (error) {
    await runtime.query('ROLLBACK');
    throw error;
  }
}

/** Executado pelo root somente no banco descartável, depois da prova de T07. */
export async function checkReviewsMigration(runtime, { storeId, merchantId, participantId, profileId, otherStoreId }) {
  const source = await runtime.query(`SELECT s.id,p.id AS "creditId",
    to_jsonb(s)-ARRAY['status','analysisVersion'] AS snapshot
    FROM app."ActivitySubmission" s JOIN app."PointsEntry" p ON p."submissionId"=s.id
    WHERE s."storeId"=$1 AND s."participantMembershipId"=$2 AND s."authorProfileId"=$3
      AND s.status='APPROVED' AND s."approvalMode"='AUTOMATIC' AND s."analysisVersion"=0
      AND s.points=10 AND p.kind='ACTIVITY_CREDIT' AND p.amount=10 AND p."reviewEventId" IS NULL
    ORDER BY s."createdAt",s.id LIMIT 1`, [storeId, participantId, profileId]);
  assert.equal(source.rowCount, 1, 'A prova T08 depende do crédito automático preservado de T07.');
  const { id: submissionId, creditId, snapshot } = source.rows[0];

  async function event({ id = randomUUID(), version, action, from, to, delta = '0', targetStoreId = storeId }) {
    await runtime.query(`INSERT INTO app."SubmissionReviewEvent"
      (id,"storeId","submissionId","actorProfileId",version,action,"fromStatus","toStatus",reason,"requestDigest",delta)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, targetStoreId, submissionId, merchantId, version, action, from, to,
      action === 'APPROVE' ? '' : 'Motivo fictício da prova', 'c'.repeat(64), delta]);
    return id;
  }

  async function movement({ eventId, kind, amount, compensatesId, targetSubmissionId = submissionId }) {
    const id = randomUUID();
    await runtime.query(`INSERT INTO app."PointsEntry"
      (id,"storeId","participantMembershipId","submissionId","actorProfileId",kind,amount,"sourceKey","reviewEventId","compensatesEntryId")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, storeId, participantId, targetSubmissionId, merchantId, kind, amount,
      `submission.${kind === 'ACTIVITY_REVERSAL' ? 'reverse' : 'restore'}:${eventId}`, eventId, compensatesId]);
    return id;
  }

  async function update(status) {
    await runtime.query('UPDATE app."ActivitySubmission" SET status=$2,"analysisVersion"="analysisVersion"+1 WHERE id=$1',
      [submissionId, status]);
  }

  async function state(status, version, total, entries) {
    const row = await runtime.query(`SELECT status,"analysisVersion",to_jsonb(s)-ARRAY['status','analysisVersion'] AS snapshot
      FROM app."ActivitySubmission" s WHERE id=$1`, [submissionId]);
    assert.equal(row.rows[0].status, status);
    assert.equal(row.rows[0].analysisVersion, version);
    assert.deepEqual(row.rows[0].snapshot, snapshot, 'Snapshot e instante da primeira aprovação devem permanecer iguais.');
    const ledger = await runtime.query(`SELECT COALESCE(sum(amount),0)::text AS total,count(*)::int AS count
      FROM app."PointsEntry" WHERE "submissionId"=$1`, [submissionId]);
    assert.deepEqual(ledger.rows[0], { total, count: entries });
  }

  // A falha diferida ocorre no COMMIT, e precisa desfazer a alteração da origem.
  await assert.rejects(transaction(runtime, () => update('VOIDED')), { code: '23514' });
  await state('APPROVED', 0, '10', 1);
  await assert.rejects(transaction(runtime, () => event({
    version: 1, action: 'VOID', from: 'APPROVED', to: 'VOIDED',
  })), { code: '23514' });
  await state('APPROVED', 0, '10', 1);
  await assert.rejects(transaction(runtime, async () => {
    await update('VOIDED');
    await event({ version: 1, action: 'VOID', from: 'APPROVED', to: 'VOIDED' });
  }), { code: '23514' });
  await state('APPROVED', 0, '10', 1);
  await assert.rejects(transaction(runtime, async () => {
    await update('VOIDED');
    await event({ version: 1, action: 'VOID', from: 'APPROVED', to: 'VOIDED', delta: '-10' });
  }), { code: '23514' });
  await state('APPROVED', 0, '10', 1);

  const voidId = randomUUID();
  let reversalId;
  await transaction(runtime, async () => {
    await update('VOIDED');
    await event({ id: voidId, version: 1, action: 'VOID', from: 'APPROVED', to: 'VOIDED', delta: '-10' });
    reversalId = await movement({ eventId: voidId, kind: 'ACTIVITY_REVERSAL', amount: '-10', compensatesId: creditId });
  });
  await state('VOIDED', 1, '0', 2);

  const reopenId = randomUUID();
  await transaction(runtime, async () => {
    await update('PENDING');
    await event({ id: reopenId, version: 2, action: 'REOPEN', from: 'VOIDED', to: 'PENDING' });
  });
  await state('PENDING', 2, '0', 2);
  assert.equal((await runtime.query('SELECT id FROM app."PointsEntry" WHERE "reviewEventId"=$1', [reopenId])).rowCount, 0);
  await assert.rejects(transaction(runtime, async () => {
    await update('APPROVED');
    await event({ version: 3, action: 'APPROVE', from: 'PENDING', to: 'APPROVED' });
  }), { code: '23514' });
  await state('PENDING', 2, '0', 2);

  const approveId = randomUUID();
  let restoreId;
  await transaction(runtime, async () => {
    await update('APPROVED');
    await event({ id: approveId, version: 3, action: 'APPROVE', from: 'PENDING', to: 'APPROVED', delta: '10' });
    restoreId = await movement({ eventId: approveId, kind: 'ACTIVITY_RESTORE', amount: '10', compensatesId: reversalId });
  });
  await state('APPROVED', 3, '10', 3);

  // Uma nova decisão válida ainda não pode compensar novamente o crédito antigo.
  await assert.rejects(transaction(runtime, async () => {
    await update('VOIDED');
    const duplicateId = await event({ version: 4, action: 'VOID', from: 'APPROVED', to: 'VOIDED', delta: '-10' });
    await movement({ eventId: duplicateId, kind: 'ACTIVITY_REVERSAL', amount: '-10', compensatesId: creditId });
  }), { code: '23505', constraint: 'PointsEntry_compensatesEntryId_key' });
  await state('APPROVED', 3, '10', 3);

  const chain = await runtime.query(`SELECT id,kind,amount::text,"reviewEventId","compensatesEntryId"
    FROM app."PointsEntry" WHERE "submissionId"=$1`, [submissionId]);
  const byId = new Map(chain.rows.map(row => [row.id, row]));
  assert.deepEqual(byId.get(creditId), { id: creditId, kind: 'ACTIVITY_CREDIT', amount: '10', reviewEventId: null, compensatesEntryId: null });
  assert.deepEqual(byId.get(reversalId), { id: reversalId, kind: 'ACTIVITY_REVERSAL', amount: '-10', reviewEventId: voidId, compensatesEntryId: creditId });
  assert.deepEqual(byId.get(restoreId), { id: restoreId, kind: 'ACTIVITY_RESTORE', amount: '10', reviewEventId: approveId, compensatesEntryId: reversalId });
  const events = await runtime.query(`SELECT id,version,action,delta::text,"actorProfileId"
    FROM app."SubmissionReviewEvent" WHERE "submissionId"=$1 ORDER BY version`, [submissionId]);
  assert.deepEqual(events.rows, [
    { id: voidId, version: 1, action: 'VOID', delta: '-10', actorProfileId: merchantId },
    { id: reopenId, version: 2, action: 'REOPEN', delta: '0', actorProfileId: merchantId },
    { id: approveId, version: 3, action: 'APPROVE', delta: '10', actorProfileId: merchantId },
  ]);

  await assert.rejects(event({ version: 4, action: 'VOID', from: 'APPROVED', to: 'VOIDED',
    targetStoreId: otherStoreId }), { code: '23503', constraint: 'Review_submission_store_fkey' });

  // Origem auxiliar existe só nesta transação, que será integralmente revertida.
  await assert.rejects(transaction(runtime, async () => {
    const activityId = randomUUID();
    const otherSubmissionId = randomUUID();
    const otherCreditId = randomUUID();
    await runtime.query('INSERT INTO app."Activity" (id,"storeId","createdByProfileId",name,points) VALUES ($1,$2,$3,$4,10)',
      [activityId, storeId, merchantId, 'Outra origem fictícia']);
    await runtime.query(`INSERT INTO app."ActivitySubmission"
      (id,"storeId","activityId","participantMembershipId","authorProfileId",status,"createdAt","receivedAt","approvedAt",
       "requestDigest","activityVersion","activityName","activityDescription","activityCategory","activitySticker",points,
       frequency,"weeklyLimit","approvalMode",caption,timezone,"localDate","periodKey","periodStart","periodEnd","occurrenceNumber")
      SELECT $1,"storeId",$2,"participantMembershipId","authorProfileId",'APPROVED',"createdAt","receivedAt","approvedAt",
       "requestDigest","activityVersion","activityName","activityDescription","activityCategory","activitySticker",points,
       frequency,"weeklyLimit","approvalMode",caption,timezone,"localDate","periodKey","periodStart","periodEnd","occurrenceNumber"
      FROM app."ActivitySubmission" WHERE id=$3`, [otherSubmissionId, activityId, submissionId]);
    await runtime.query(`INSERT INTO app."PointsEntry"
      (id,"storeId","participantMembershipId","submissionId","actorProfileId",kind,amount,"sourceKey")
      VALUES ($1,$2,$3,$4,$5,'ACTIVITY_CREDIT',10,$6)`,
    [otherCreditId, storeId, participantId, otherSubmissionId, profileId, `submission.credit:${otherSubmissionId}`]);
    await update('VOIDED');
    const crossId = await event({ version: 4, action: 'VOID', from: 'APPROVED', to: 'VOIDED', delta: '-10' });
    await movement({ eventId: crossId, kind: 'ACTIVITY_REVERSAL', amount: '-10', compensatesId: otherCreditId });
  }), { code: '23503', constraint: 'Points_compensation_context_fkey' });
  await state('APPROVED', 3, '10', 3);

  for (const table of ['SubmissionReviewEvent', 'PointsEntry']) {
    const privileges = await runtime.query(`SELECT
      has_table_privilege(current_user,$1,'SELECT') AS read,
      has_table_privilege(current_user,$1,'INSERT') AS create,
      has_table_privilege(current_user,$1,'UPDATE') AS update,
      has_table_privilege(current_user,$1,'DELETE') AS delete`, [`app."${table}"`]);
    assert.deepEqual(privileges.rows[0], { read: true, create: true, update: false, delete: false });
    await assert.rejects(runtime.query(`UPDATE app."${table}" SET "storeId"=$1 WHERE "submissionId"=$2`,
      [storeId, submissionId]), { code: '42501' });
    await assert.rejects(runtime.query(`DELETE FROM app."${table}" WHERE "submissionId"=$1`, [submissionId]), { code: '42501' });
  }
  await assert.rejects(runtime.query('UPDATE app."ActivitySubmission" SET "approvedAt"="approvedAt"+interval \'1 second\' WHERE id=$1',
    [submissionId]), { code: '42501' });
  const analysisGrant = await runtime.query(`SELECT has_column_privilege(current_user,
    'app."ActivitySubmission"','analysisVersion','UPDATE') AS granted`);
  assert.equal(analysisGrant.rows[0].granted, true);
  const constraints = await runtime.query(`SELECT conname,convalidated FROM pg_constraint
    WHERE connamespace='app'::regnamespace AND conname=ANY($1::text[]) ORDER BY conname`, [[
    'Review_submission_store_fkey', 'Review_request_context_fkey', 'Points_review_context_fkey',
    'Points_compensation_context_fkey', 'Outbox_review_context_fkey',
  ]]);
  assert.equal(constraints.rowCount, 5);
  assert.ok(constraints.rows.every(row => row.convalidated));
  const security = await runtime.query(`SELECT rowsecurity FROM pg_tables
    WHERE schemaname='app' AND tablename='SubmissionReviewEvent'`);
  assert.equal(security.rows[0].rowsecurity, true);
  await state('APPROVED', 3, '10', 3);
}
