import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ticketOperations, transaction } from './check-tickets-migration-helpers.mjs';

/** Evolução T09→T10 com uma emissão anterior verdadeira e cadeia financeira preservada. */
export async function checkTicketsMigration(database, runtime, context) {
  const { storeId, merchantId, participantId, otherStoreId } = context;
  const ticketId = (await runtime.query('SELECT id FROM app."Redemption" WHERE "storeId"=$1', [storeId])).rows[0].id;
  const operations = ticketOperations(runtime, context, ticketId);
  const { readTicket, readReward, readBalance, auditReward, refund, transition, assertNoChange } = operations;
  const original = await readTicket();
  assert.equal(original.version, 1);
  assert.equal(original.agreementText, '');
  assert.equal(original.agreementDate, null);
  const issued = (await runtime.query('SELECT * FROM app."RedemptionEvent" WHERE "redemptionId"=$1', [ticketId])).rows[0];
  assert.equal(issued.kind, 'ISSUED');
  assert.equal(issued.version, 1);
  assert.equal(issued.toStatus, 'WAITING_AGREEMENT');
  assert.equal(issued.delta, '0');
  assert.equal(issued.restocked, false);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='app' AND rowsecurity")).rows[0].n, 26);
  for (const role of ['anon', 'authenticated']) {
    await database.query('BEGIN');
    try {
      await database.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(database.query('SELECT * FROM app."RedemptionEvent"'), { code: '42501' });
    } finally { await database.query('ROLLBACK'); }
  }
  for (const sql of [
    'UPDATE app."Redemption" SET "rewardCost"=1 WHERE id=$1',
    'UPDATE app."Redemption" SET "storeId"=$2 WHERE id=$1',
    'UPDATE app."RedemptionEvent" SET text=\'Alterado\' WHERE "redemptionId"=$1',
    'UPDATE app."PointsEntry" SET amount=1 WHERE "redemptionId"=$1',
    'DELETE FROM app."Redemption" WHERE id=$1',
  ]) await assert.rejects(runtime.query(sql, sql.includes('$2') ? [ticketId, otherStoreId] : [ticketId]), { code: '42501' });
  // Até o proprietário do banco é impedido de trocar uma fotografia pela projeção.
  await assert.rejects(database.query('UPDATE app."Redemption" SET "rewardCost"="rewardCost"+1 WHERE id=$1', [ticketId]), { code: '23514' });
  await assertNoChange(() => transition('AGREE', { omit: 'event' }));
  await assertNoChange(() => transition('AGREE', { omit: 'projection' }));
  await assertNoChange(() => transition('AGREE', { omit: 'outbox' }));
  for (const text of ['\t', '\u00a0', '\ufeff', '\u2003', '\u0001', 'Motivo\u007f']) {
    await assertNoChange(() => transition('AGREE', { textOverride: text }));
    await assertNoChange(() => transition('REQUEST_CANCELLATION', { textOverride: text }));
  }
  await assertNoChange(() => transition('AGREE', { eventOverrides: { actorId: context.profileId } }));
  await assertNoChange(() => transition('CANCEL', { omit: 'refund' }));
  await assertNoChange(() => refund(randomUUID(), original, new Date()));
  await assertNoChange(() => transition('CANCEL', { eventOverrides: { balanceBefore: null, balanceAfter: null } }));
  await assertNoChange(() => transition('CANCEL', { restock: true, skipStockUpdate: true }));
  await assertNoChange(async () => {
    const reward = await readReward();
    await runtime.query('UPDATE app."Reward" SET stock=stock+1,"stockRevision"="stockRevision"+1 WHERE id=$1', [reward.id]);
  });
  // Uma alteração administrativa auditada por último não serve de reposição.
  await assertNoChange(async () => {
    const before = await readReward();
    await runtime.query('UPDATE app."Reward" SET stock=stock+1,"stockRevision"="stockRevision"+1,version=version+1 WHERE id=$1', [before.id]);
    await transition('CANCEL', { restock: true, skipStockUpdate: true, eventOverrides: {
      stockBefore: before.stock, stockAfter: before.stock + 1, revision: before.stockRevision + 1,
    } });
    await auditReward(await readReward(), 'UPDATE');
  });
  await transaction(runtime, () => transition('AGREE'));
  assert.equal((await readTicket()).agreementDate, '2020-02-29');
  await transaction(runtime, () => transition('REQUEST_CANCELLATION'));
  assert.equal((await readTicket()).cancellationFromStatus, 'AGREED');
  await assertNoChange(() => transition('FULFILL'));
  await transaction(runtime, () => transition('REJECT_CANCELLATION'));
  assert.equal((await readTicket()).status, 'AGREED');
  assert.equal((await readTicket()).cancellationFromStatus, null);
  await transaction(runtime, () => transition('REQUEST_CANCELLATION'));
  // Arquivar não perde a reserva limitada nem a possibilidade de devolver.
  await transaction(runtime, async () => {
    const reward = await readReward();
    await runtime.query('UPDATE app."Reward" SET "archivedAt"=clock_timestamp(),version=version+1 WHERE id=$1', [reward.id]);
    await auditReward(await readReward(), 'ARCHIVE');
  });
  const rewardBefore = await readReward();
  const balanceBefore = await readBalance();
  const cancellation = await transaction(runtime, () => transition('CANCEL', { restock: true }));
  const current = await readTicket();
  assert.equal(current.status, 'CANCELLED');
  assert.equal(current.version, 6);
  assert.equal(current.agreementText, 'Combinado fictício');
  assert.equal(current.rewardCost, original.rewardCost);
  assert.equal(current.balanceBefore, original.balanceBefore);
  assert.equal(current.balanceAfter, original.balanceAfter);
  assert.equal(await readBalance(), String(BigInt(balanceBefore) + BigInt(original.rewardCost)));
  const rewardAfter = await readReward();
  assert.equal(rewardAfter.stock, rewardBefore.stock + 1);
  assert.equal(rewardAfter.stockRevision, rewardBefore.stockRevision + 1);
  assert.equal(rewardAfter.version, rewardBefore.version);
  assert.deepEqual(rewardAfter.archivedAt, rewardBefore.archivedAt);
  await assertNoChange(() => refund(cancellation.eventId, original, cancellation.now));
  await assertNoChange(() => transition('CANCEL'));
  await assertNoChange(async () => {
    await runtime.query('UPDATE app."Redemption" SET status=\'WAITING_AGREEMENT\',version=version+1,"cancelledAt"=NULL,"agreementText"=\'\',"agreementDate"=NULL WHERE id=$1', [ticketId]);
  });
  assert.equal((await runtime.query(`SELECT count(*)::int AS n FROM app."PointsEntry" WHERE "redemptionId"=$1 AND kind='REDEMPTION_REFUND'`, [ticketId])).rows[0].n, 1);
  assert.equal((await runtime.query(`SELECT count(*)::int AS n FROM app."RedemptionEvent" WHERE "redemptionId"=$1`, [ticketId])).rows[0].n, 6);
  assert.equal((await runtime.query(`SELECT count(*)::int AS n FROM app."OutboxEvent" WHERE "redemptionId"=$1 AND kind::text='REDEMPTION_UPDATED'`, [ticketId])).rows[0].n, 5);
  const constraints = await database.query(`SELECT conname,convalidated FROM pg_constraint WHERE connamespace='app'::regnamespace AND conname=ANY($1::text[])`, [[
    'Ticket_state_check', 'Ticket_event_check', 'Ticket_normalized_text_check', 'Ticket_event_normalized_text_check',
    'Ticket_request_context_fkey', 'Points_ticket_event_context_fkey',
    'Points_ticket_compensation_context_fkey', 'Outbox_ticket_event_context_fkey',
    'Points_review_context_fkey', 'Points_compensation_context_fkey', 'Outbox_review_context_fkey',
  ]]);
  assert.equal(constraints.rowCount, 11);
  assert.ok(constraints.rows.every(row => row.convalidated));
  assert.equal((await runtime.query('SELECT "actorProfileId" FROM app."RedemptionEvent" WHERE id=$1', [cancellation.eventId])).rows[0].actorProfileId, merchantId);
  assert.equal((await runtime.query('SELECT "participantMembershipId" FROM app."PointsEntry" WHERE "redemptionEventId"=$1', [cancellation.eventId])).rows[0].participantMembershipId, participantId);
}
