import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ticketFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

for (const action of ['AGREE', 'FULFILL', 'REQUEST_CANCELLATION', 'CANCEL']) {
  test(`${action} repetida simultaneamente tem um evento e um resultado aplicado`, async t => {
    const f = await ticketFixture(t);
    const person = action === 'REQUEST_CANCELLATION' ? f.ana : f.owner;
    const body = await f.transitionBody(f.issued, action, action === 'CANCEL' ? { restock: true } : {});
    const replies = await Promise.all(Array.from({ length: 3 }, () => person.client.clone().post(f.transitionPath(f.issued), body)));
    for (const reply of replies) {
      expectStatus(reply, 200); const value = await reply.json(); assert.equal(value.event.id, body.operationId);
      assert.equal(value.appliedVersion, 2);
    }
    assert.equal((await f.events(f.issued)).total, 2);
    assert.equal((await f.ticketLedger(f.issued)).length, action === 'CANCEL' ? 2 : 1);
    assert.equal((await f.rewardRow(f.reward)).stock, action === 'CANCEL' ? 2 : 1);
  });
}

for (const pair of [['FULFILL', 'CANCEL'], ['FULFILL', 'REQUEST_CANCELLATION'], ['AGREE', 'REQUEST_CANCELLATION'], ['CANCEL', 'CANCEL']]) {
  test(`corrida ${pair.join(' × ')} aplica apenas uma transição da versão observada`, async t => {
    const f = await ticketFixture(t);
    const bodies = await Promise.all(pair.map(action => f.transitionBody(f.issued, action)));
    const replies = await Promise.all(pair.map((action, index) =>
      (action === 'REQUEST_CANCELLATION' ? f.ana : f.owner).client.clone().post(f.transitionPath(f.issued), bodies[index])));
    assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
    const winner = replies.findIndex(reply => reply.status === 200);
    const current = await f.ticket(f.issued);
    const cancelled = pair[winner] === 'CANCEL';
    assert.equal(current.version, 2); assert.equal((await f.events(f.issued)).total, 2);
    assert.equal((await f.ticketLedger(f.issued)).length, cancelled ? 2 : 1);
    assert.equal((await f.balance()).available, cancelled ? '30' : '20');
  });
}

test('recusa × confirmação do mesmo pedido aplica uma resolução, sem refund se recusa vencer', async t => {
  const f = await ticketFixture(t);
  await f.transition(f.issued, 'REQUEST_CANCELLATION');
  const bodies = await Promise.all(['REJECT_CANCELLATION', 'CANCEL'].map(action => f.transitionBody(f.issued, action)));
  const replies = await Promise.all(bodies.map(body => f.owner.client.clone().post(f.transitionPath(f.issued), body)));
  assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
  const current = await f.ticket(f.issued);
  assert.equal((await f.events(f.issued)).total, 3); assert.equal(current.pendingCancellation, null);
  assert.equal((await f.ticketLedger(f.issued)).length, current.status === 'CANCELLED' ? 2 : 1);
});

test('edição de quantidade × reposição nunca sobrescreve uma unidade sem revisar', async t => {
  const f = await ticketFixture(t);
  const row = await f.rewardRow(f.reward);
  const body = await f.transitionBody(f.issued, 'CANCEL', { restock: true });
  const edit = f.rewardBody(row, { stock: 5 });
  const replies = await Promise.all([
    f.owner.client.clone().post(f.transitionPath(f.issued), body),
    f.owner.client.clone().patch(f.rewardPath(f.reward), edit),
  ]);
  assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
  const cancelled = replies[0].status === 200;
  assert.equal((await f.rewardRow(f.reward)).stock, cancelled ? 2 : 5);
  assert.equal((await f.balance()).available, cancelled ? '30' : '20');
});

test('UUID não muda corpo, ação ou ticket; consulta de intenção ausente é autorizada', async t => {
  const f = await ticketFixture(t);
  const result = await f.transition(f.issued, 'AGREE');
  for (const extra of [{ text: 'Outro texto' }, { action: 'FULFILL' }, { expectedVersion: 99 }]) {
    await errorCode(await f.owner.client.post(f.transitionPath(f.issued), { ...result.request, ...extra }), extra.action ? 400 : 409);
  }
  const other = await f.redeem(f.reward);
  await errorCode(await f.owner.client.post(f.transitionPath(other), result.request), 409);
  assert.equal((await f.operation(f.issued, randomUUID())).operation, null);
  await errorCode(await f.bia.client.get(`${f.ticketPath(f.issued)}/operacoes/${randomUUID()}`), 404);
});

for (const table of ['Redemption', 'RedemptionEvent', 'PointsEntry', 'Reward', 'OutboxEvent']) {
  test(`falha em ${table} desfaz cancelamento inteiro; retry devolve e repõe uma vez`, async t => {
    const f = await ticketFixture(t);
    const body = await f.transitionBody(f.issued, 'CANCEL', { restock: true });
    await f.transitionFailure(table, body, async () => {
      await errorCode(await f.owner.client.post(f.transitionPath(f.issued), body), 503);
      assert.equal((await f.operation(f.issued, body.operationId)).operation, null);
      assert.equal((await f.ticket(f.issued)).status, 'WAITING_AGREEMENT');
      assert.equal((await f.events(f.issued)).total, 1); assert.equal((await f.ticketLedger(f.issued)).length, 1);
      assert.equal((await f.balance()).available, '20'); assert.equal((await f.rewardRow(f.reward)).stock, 1);
    });
    expectStatus(await f.owner.client.post(f.transitionPath(f.issued), body), 200);
    expectStatus(await f.owner.client.post(f.transitionPath(f.issued), body), 200);
    assert.equal((await f.ticketLedger(f.issued)).length, 2); assert.equal((await f.rewardRow(f.reward)).stock, 2);
    assert.equal((await f.events(f.issued)).total, 2);
  });
}
