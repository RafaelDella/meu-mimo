import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { ticketFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('cancelamento usa custo congelado, devolve uma vez e não repõe por padrão', async t => {
  const f = await ticketFixture(t);
  const row = await f.rewardRow(f.reward);
  const edited = await f.updateReward(row, { cost: 99, name: 'Mimo alterado' });
  await f.archiveReward(edited);
  const result = await f.transition(f.issued, 'CANCEL', { text: 'Cancelamento direto pelo lojista' });
  assert.equal(result.event.delta, '10'); assert.equal(result.event.restocked, false);
  assert.equal(result.ticket.status, 'CANCELLED'); assert.ok(result.ticket.cancelledAt);
  assert.equal(result.ticket.snapshot.cost, 10); assert.equal(result.ticket.snapshot.name, f.reward.name);
  assert.equal((await f.balance()).available, '30'); assert.equal((await f.rewardRow(f.reward)).stock, 1);
  const ledger = await f.ticketLedger(f.issued);
  const debit = ledger.find(item => item.kind === 'REDEMPTION_DEBIT');
  const refund = ledger.find(item => item.kind === 'REDEMPTION_REFUND');
  assert.equal(refund.amount, '10'); assert.equal(refund.compensatesEntryId, debit.id);
  assert.equal(refund.redemptionEventId, result.event.id);
  expectStatus(await f.owner.client.post(f.transitionPath(f.issued), result.request), 200);
  assert.equal((await f.ticketLedger(f.issued)).length, 2);
  const entries = await f.entries('?kind=REDEMPTION_REFUND');
  assert.equal(entries.total, 1); assert.equal(entries.items[0].origin.id, f.issued.id);
  assert.equal(entries.items[0].path, f.ticketPath(f.issued).replace('/api', ''));
  assert.deepEqual(await f.summary(), { total: 1, outstanding: 0 });
});

test('reposição explícita devolve unidade inclusive arquivada, sem reabrir catálogo nem mudar configuração', async t => {
  const f = await ticketFixture(t);
  const row = await f.rewardRow(f.reward);
  const archived = await f.archiveReward(row);
  const result = await f.transition(f.issued, 'CANCEL', { restock: true });
  assert.equal(result.event.restocked, true); assert.equal(result.event.stockBefore, 1); assert.equal(result.event.stockAfter, 2);
  assert.equal(result.event.stockRevision, row.stockRevision + 1);
  const now = await f.rewardRow(f.reward);
  assert.equal(now.stock, 2); assert.equal(now.version, archived.version); assert.ok(now.archivedAt);
  expectStatus(await f.owner.client.post(f.transitionPath(f.issued), result.request), 200);
  assert.equal((await f.rewardRow(f.reward)).stock, 2); assert.equal((await f.balance()).available, '30');
});

for (const mode of ['unlimited-issue', 'now-unlimited', 'at-limit']) {
  test(`reposição indisponível em ${mode} exige cancelar explicitamente sem reposição`, async t => {
    const f = await ticketFixture(t, { stock: mode === 'unlimited-issue' ? null : 2 });
    if (mode === 'unlimited-issue') await f.updateReward(await f.rewardRow(f.reward), { stock: 5 });
    else await f.updateReward(await f.rewardRow(f.reward), { stock: mode === 'at-limit' ? 1_000_000 : null });
    const current = await f.ticket(f.issued, f.owner);
    assert.equal(current.cancellationImpact.restock.eligible, false);
    const body = await f.transitionBody(f.issued, 'CANCEL', { restock: true });
    await errorCode(await f.owner.client.post(f.transitionPath(f.issued), body), 409);
    assert.equal((await f.balance()).available, '20'); assert.equal((await f.ticketLedger(f.issued)).length, 1);
    assert.equal((await f.transition(f.issued, 'CANCEL')).event.restocked, false);
    assert.equal((await f.balance()).available, '30');
  });
}

test('saldo ou revisão de estoque alterados exigem revisão e não causam estorno parcial', async t => {
  const f = await ticketFixture(t);
  const balanceBody = await f.transitionBody(f.issued, 'CANCEL');
  await f.credit(5);
  await errorCode(await f.owner.client.post(f.transitionPath(f.issued), balanceBody), 409);
  const stockBody = await f.transitionBody(f.issued, 'CANCEL', { restock: true });
  await f.updateReward(await f.rewardRow(f.reward), { stock: 10 });
  await errorCode(await f.owner.client.post(f.transitionPath(f.issued), stockBody), 409);
  assert.equal((await f.ticketLedger(f.issued)).length, 1); assert.equal((await f.ticket(f.issued)).status, 'WAITING_AGREEMENT');
  assert.equal((await f.rewardRow(f.reward)).stock, 10);
  await f.transition(f.issued, 'CANCEL'); assert.equal((await f.balance()).available, '35');
});

test('15→resgate10→anulação−15→cancelamento+10 deixa zero sem inflar ganhos ou ajustes de atividade', async t => {
  const f = await ticketFixture(t, { points: 15 });
  await f.decide(f.creditRecord, 'VOID');
  const before = await f.balance(); assert.equal(before.available, '-10');
  const result = await f.transition(f.issued, 'CANCEL');
  assert.equal(result.event.balanceBefore, '-10'); assert.equal(result.event.balanceAfter, '0');
  const afterBalance = await f.balance(); assert.equal(afterBalance.available, '0');
  assert.deepEqual(afterBalance.today, before.today); assert.equal(afterBalance.pending, before.pending);
  assert.deepEqual((await f.ledger(f.creditRecord)).map(entry => entry.amount), ['15', '-15']);
  assert.equal((await f.entries()).items.reduce((sum, row) => sum + BigInt(row.amount), 0n), 0n);
});
