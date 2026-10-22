import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { redemptionFixture, closeRuntime, emittedOnce, noEmission } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('crédito real emite ticket, débito, reserva, evento, conversa e outbox na mesma operação', async t => {
  const f = await redemptionFixture(t);
  await f.credit(15);
  const reward = await f.createReward({ stock: 2, name: 'Vale da ocasião', note: 'Recadinho histórico' });
  const preview = await f.preview(reward);
  assert.deepEqual(preview.availability, { eligible: true, reason: 'AVAILABLE',
    available: '15', pending: '0', resulting: '5', shortfall: '0' });
  const ticket = await f.redeem(reward);
  assert.equal(ticket.id, ticket.request.operationId); assert.ok(ticket.code);
  assert.equal(ticket.status, 'WAITING_AGREEMENT');
  assert.equal(ticket.participantMembershipId, f.participation.id);
  assert.equal(ticket.balanceBefore, '15'); assert.equal(ticket.balanceAfter, '5');
  assert.equal(ticket.snapshot.name, 'Vale da ocasião'); assert.equal(ticket.snapshot.cost, 10);
  assert.equal(ticket.snapshot.rewardVersion, 1); assert.equal(ticket.events.length, 1);
  assert.equal(ticket.events[0].kind, 'ISSUED');
  assert.equal(ticket.conversation.subjectId, ticket.id); assert.equal(ticket.conversation.subjectType, 'TICKET');
  assert.deepEqual(await f.emissionCounts(ticket.id), emittedOnce);
  const [entry] = await f.emissionLedger(ticket.id);
  assert.equal(entry.kind, 'REDEMPTION_DEBIT'); assert.equal(entry.amount, '-10');
  assert.equal(entry.submissionId, null); assert.equal(entry.reviewEventId, null); assert.equal(entry.compensatesEntryId, null);
  assert.equal(entry.sourceKey, `redemption.debit:${ticket.id}`);
  const row = await f.rewardRow(reward);
  assert.equal(row.stock, 1); assert.equal(row.version, 1); assert.equal(row.stockRevision, 2);
  const frozen = (await f.database.query('SELECT * FROM app."Redemption" WHERE id=$1', [ticket.id])).rows[0];
  assert.equal(frozen.stockBefore, 2); assert.equal(frozen.stockAfter, 1); assert.equal(frozen.stockRevision, 2);
  const current = await f.updateReward({ ...reward, stock: 1, stockRevision: 2 }, { name: 'Outro nome', note: 'Outro recado', cost: 99 });
  await f.archiveReward(current);
  const historical = await f.ticket(ticket);
  assert.deepEqual(historical.snapshot, ticket.snapshot); assert.equal(historical.code, ticket.code);
  assert.equal((await f.balance()).available, '5');
  const entries = await f.entries('?kind=REDEMPTION_DEBIT');
  assert.equal(entries.total, 1); assert.equal(entries.items[0].redemptionId, ticket.id);
  assert.equal(entries.items[0].activityName, null); assert.equal(entries.items[0].rewardName, 'Vale da ocasião');
  assert.equal(entries.items[0].path, `/lojas/${f.store.id}/tickets/${ticket.id}`);
  assert.equal((await f.balance()).today.credited, '15');
});

test('ilimitado não altera configuração/revisão, e uma unidade usa saldo exato', async t => {
  const f = await redemptionFixture(t);
  await f.credit(10);
  const reward = await f.createReward();
  const ticket = await f.redeem(reward);
  assert.equal(ticket.balanceAfter, '0');
  const row = await f.rewardRow(reward);
  assert.equal(row.stock, null); assert.equal(row.version, 1); assert.equal(row.stockRevision, 1);
  const frozen = (await f.database.query('SELECT "stockBefore", "stockAfter", "stockRevision" FROM app."Redemption" WHERE id=$1', [ticket.id])).rows[0];
  assert.deepEqual(frozen, { stockBefore: null, stockAfter: null, stockRevision: null });
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, await f.redemptionBody(reward)), 409, 'insufficient_points');
  assert.equal((await f.tickets()).total, 1);
});

for (const table of ['Redemption', 'RedemptionEvent', 'PointsEntry', 'Reward', 'Conversation', 'OutboxEvent']) {
  test(`falha em ${table} reverte emissão inteira; retry da intenção produz uma vez`, async t => {
    const f = await redemptionFixture(t);
    await f.credit(15);
    const reward = await f.createReward({ stock: 2 });
    const body = await f.redemptionBody(reward);
    const path = `${f.rewardPath(reward)}/resgatar`;
    await f.withEmissionFailure(table, body, reward, async () => {
      await errorCode(await f.ana.client.post(path, body), 503);
      assert.deepEqual(await f.emissionCounts(body.operationId), noEmission);
      assert.equal((await f.balance()).available, '15');
      const row = await f.rewardRow(reward);
      assert.equal(row.stock, 2); assert.equal(row.stockRevision, 1); assert.equal(row.version, 1);
      assert.deepEqual(await f.lookup(reward, body.operationId), { ticket: null });
    });
    expectStatus(await f.ana.client.post(path, body), 200);
    expectStatus(await f.ana.client.post(path, body), 200);
    assert.deepEqual(await f.emissionCounts(body.operationId), emittedOnce);
    assert.equal((await f.balance()).available, '5'); assert.equal((await f.rewardRow(reward)).stock, 1);
    assert.equal((await f.lookup(reward, body.operationId)).ticket.id, body.operationId);
  });
}

test('crédito15 → resgate10 → anulação−15 preserva ticket, saldo−10 e cadeia da conquista', async t => {
  const f = await redemptionFixture(t);
  const credit = await f.credit(15);
  const reward = await f.createReward({ stock: 3 });
  const ticket = await f.redeem(reward);
  await f.decide(credit, 'CONTEST'); assert.equal((await f.balance()).available, '5');
  const decision = await f.decide(credit, 'VOID');
  assert.equal(decision.event.delta, '-15'); assert.equal((await f.balance()).available, '-10');
  assert.deepEqual((await f.ticket(ticket)).snapshot, ticket.snapshot);
  assert.equal((await f.ticket(ticket)).status, 'WAITING_AGREEMENT');
  const preview = await f.preview(reward);
  assert.equal(preview.availability.shortfall, '20'); assert.equal(preview.availability.resulting, '-20');
  const body = await f.redemptionBody(reward);
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, body), 409, 'insufficient_points');
  assert.deepEqual(await f.emissionCounts(body.operationId), noEmission);
  await f.decide(credit, 'REOPEN'); assert.equal((await f.balance()).available, '-10');
  const restored = await f.decide(credit, 'APPROVE');
  expectStatus(await f.owner.client.post(`${f.submissionPath(credit)}/analise`, restored.request), 200);
  assert.equal((await f.balance()).available, '5');
  assert.deepEqual((await f.ledger(credit)).map(entry => entry.amount), ['15', '-15', '15']);
  assert.deepEqual(await f.emissionCounts(ticket.id), emittedOnce);
  assert.equal((await f.rewardRow(reward)).stock, 2);
  const all = await f.entries();
  assert.equal(all.items.reduce((sum, entry) => sum + BigInt(entry.amount), 0n), 5n);
  assert.equal(all.items.filter(entry => entry.kind === 'REDEMPTION_DEBIT').length, 1);
  assert.equal((await f.balance()).pending, '0');
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, { ...body, operationId: randomUUID(), expectedBalance: '5' }), 409, 'insufficient_points');
});
