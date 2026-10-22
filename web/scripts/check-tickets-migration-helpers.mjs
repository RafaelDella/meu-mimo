import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function transaction(client, work) {
  await client.query('BEGIN');
  try { const result = await work(); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
}

/** Operações SQL reais, somente no banco descartável exclusivo da prova. */
export function ticketOperations(runtime, context, ticketId) {
  const { storeId, merchantId, participantId, profileId } = context;
  const readTicket = async () => (await runtime.query('SELECT * FROM app."Redemption" WHERE id=$1', [ticketId])).rows[0];
  const readReward = async () => (await runtime.query(`SELECT r.* FROM app."Reward" r JOIN app."Redemption" t ON t."rewardId"=r.id WHERE t.id=$1`, [ticketId])).rows[0];
  const readBalance = async () => (await runtime.query(`SELECT COALESCE(sum(amount),0)::text AS value FROM app."PointsEntry"
    WHERE "storeId"=$1 AND "participantMembershipId"=$2`, [storeId, participantId])).rows[0].value;
  async function auditReward(reward, kind) {
    const { id, storeId: ignoredStore, createdByProfileId, version, createdAt, ...configuration } = reward;
    void ignoredStore; void createdByProfileId; void createdAt;
    await runtime.query(`INSERT INTO app."RewardEvent" (id,"storeId","rewardId","actorProfileId",version,kind,"requestDigest",configuration)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), storeId, id, merchantId, version, kind, 'c'.repeat(64), configuration]);
  }
  async function refund(eventId, ticket, now, overrides = {}) {
    const debit = (await runtime.query(`SELECT id FROM app."PointsEntry" WHERE "redemptionId"=$1 AND kind='REDEMPTION_DEBIT'`, [ticketId])).rows[0];
    const values = { id: randomUUID(), storeId, participantId, ticketId, eventId, merchantId,
      amount: ticket.rewardCost, debitId: debit.id, key: `redemption.refund:${ticketId}`, now, ...overrides };
    await runtime.query(`INSERT INTO app."PointsEntry" (id,"storeId","participantMembershipId","redemptionId","redemptionEventId",
      "actorProfileId",kind,amount,"sourceKey","compensatesEntryId","createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,'REDEMPTION_REFUND',$7,$8,$9,$10)`,
    [values.id, values.storeId, values.participantId, values.ticketId, values.eventId, values.merchantId,
      values.amount, values.key, values.debitId, values.now]);
  }
  async function transition(kind, { omit = '', restock = false, eventOverrides = {}, skipStockUpdate = false, textOverride } = {}) {
    const ticket = await readTicket();
    const reward = await readReward();
    const balance = await readBalance();
    const now = (await runtime.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const eventId = randomUUID();
    const requested = kind === 'REQUEST_CANCELLATION';
    const cancelled = kind === 'CANCEL';
    const toStatus = { AGREE: 'AGREED', FULFILL: 'FULFILLED', REQUEST_CANCELLATION: 'CANCELLATION_REQUESTED',
      REJECT_CANCELLATION: ticket.cancellationFromStatus, CANCEL: 'CANCELLED' }[kind];
    const requestId = ticket.status === 'CANCELLATION_REQUESTED' ? (await runtime.query(`SELECT id FROM app."RedemptionEvent"
      WHERE "redemptionId"=$1 AND version=$2`, [ticketId, ticket.version])).rows[0].id : null;
    if (omit !== 'projection') await runtime.query(`UPDATE app."Redemption" SET status=$2,version=version+1,
      "agreementText"=$3,"agreementDate"=$4,"cancellationFromStatus"=$5,"fulfilledAt"=$6,"cancelledAt"=$7 WHERE id=$1`,
    [ticketId, toStatus, kind === 'AGREE' ? textOverride ?? 'Combinado fictício' : ticket.agreementText,
      kind === 'AGREE' ? '2020-02-29' : ticket.agreementDate, requested ? ticket.status : null,
      kind === 'FULFILL' ? now : null, cancelled ? now : null]);
    const event = { id: eventId, storeId, ticketId, actorId: requested ? profileId : merchantId,
      kind, version: ticket.version + 1, fromStatus: ticket.status, toStatus,
      text: textOverride ?? (kind === 'AGREE' ? 'Combinado fictício' : kind === 'FULFILL' ? '' : 'Motivo fictício'),
      date: kind === 'AGREE' ? '2020-02-29' : null, requestId,
      delta: cancelled ? ticket.rewardCost : 0, restock,
      stockBefore: restock ? reward.stock : null, stockAfter: restock ? reward.stock + 1 : null,
      revision: restock ? reward.stockRevision + 1 : null, balanceBefore: cancelled ? balance : null,
      balanceAfter: cancelled ? String(BigInt(balance) + BigInt(ticket.rewardCost)) : null, ...eventOverrides };
    if (omit !== 'event') await runtime.query(`INSERT INTO app."RedemptionEvent"
      (id,"storeId","redemptionId","actorProfileId",kind,version,"fromStatus","toStatus",text,"agreementDate","requestDigest",
      "requestId",delta,restocked,"stockBefore","stockAfter","stockRevision","balanceBefore","balanceAfter","createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [event.id, event.storeId, event.ticketId, event.actorId, kind, event.version, event.fromStatus, event.toStatus,
      event.text, event.date, 'd'.repeat(64), event.requestId, event.delta, event.restock,
      event.stockBefore, event.stockAfter, event.revision, event.balanceBefore, event.balanceAfter, now]);
    if (cancelled && omit !== 'refund') await refund(eventId, ticket, now);
    if (restock && !skipStockUpdate) await runtime.query(`UPDATE app."Reward" SET stock=stock+1,"stockRevision"="stockRevision"+1 WHERE id=$1`, [reward.id]);
    if (omit !== 'outbox') await runtime.query(`INSERT INTO app."OutboxEvent"
      (id,key,kind,"storeId","participantMembershipId","actorProfileId","recipientMembershipId","redemptionId","redemptionEventId")
      SELECT $1,$2,'REDEMPTION_UPDATED',$3,$4,$5,m.id,$6,$7 FROM app."Membership" m
      WHERE m."storeId"=$3 AND ${requested ? "m.role='MERCHANT'" : 'm.id=$4'}`,
    [randomUUID(), `redemption.updated:${eventId}`, storeId, participantId, event.actorId, ticketId, eventId]);
    return { eventId, now, ticket, event };
  }
  async function assertNoChange(work, code = '23514') {
    const before = await readTicket();
    const balance = await readBalance();
    const reward = await readReward();
    await assert.rejects(transaction(runtime, work), { code });
    assert.deepEqual(await readTicket(), before);
    assert.deepEqual(await readReward(), reward);
    assert.equal(await readBalance(), balance);
  }
  return { readTicket, readReward, readBalance, auditReward, refund, transition, assertNoChange };
}
