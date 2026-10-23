import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ticketFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('combinado revisável preserva data civil e histórico; realização não altera dinheiro ou estoque', async t => {
  const f = await ticketFixture(t);
  const original = f.issued;
  assert.equal(original.version, 1);
  const first = await f.transition(original, 'AGREE', { text: 'Café de manhã ☕', agreementDate: '2020-02-29' });
  assert.equal(first.ticket.status, 'AGREED'); assert.equal(first.ticket.agreementDate, '2020-02-29');
  assert.equal(first.appliedVersion, 2); assert.equal(first.event.kind, 'AGREE');
  const changed = await f.transition(original, 'AGREE', { text: 'Vamos conversar sobre o dia.', agreementDate: null });
  assert.equal(changed.ticket.agreementText, 'Vamos conversar sobre o dia.');
  assert.equal(changed.ticket.agreementDate, null);
  const result = await f.transition(original, 'FULFILL');
  assert.equal(result.ticket.status, 'FULFILLED'); assert.ok(result.ticket.fulfilledAt);
  assert.deepEqual(result.ticket.actions, []); assert.equal(result.event.delta, '0');
  assert.deepEqual(result.ticket.snapshot, original.snapshot);
  assert.equal(result.ticket.balanceBefore, original.balanceBefore); assert.equal(result.ticket.balanceAfter, original.balanceAfter);
  assert.equal((await f.balance()).available, '20'); assert.equal((await f.rewardRow(f.reward)).stock, 1);
  assert.equal((await f.ticketLedger(original)).length, 1);
  const history = await f.events(original);
  assert.deepEqual(history.items.map(event => event.kind), ['ISSUED', 'AGREE', 'AGREE', 'FULFILL']);
  assert.equal(history.items[1].agreementDate, '2020-02-29');
  assert.deepEqual(await f.summary(), { total: 1, outstanding: 0 });
  for (const action of ['AGREE', 'FULFILL', 'REQUEST_CANCELLATION', 'CANCEL']) {
    const body = { operationId: randomUUID(), expectedVersion: result.ticket.version, action,
      ...(action === 'AGREE' ? { text: 'Novo combinado', agreementDate: null } : {}),
      ...(action === 'REQUEST_CANCELLATION' ? { text: 'Pedido depois de realizar' } : {}),
      ...(action === 'CANCEL' ? { text: 'Não permitido', restock: false, expectedBalance: '20' } : {}) };
    await errorCode(await (action === 'REQUEST_CANCELLATION' ? f.ana : f.owner).client.post(f.transitionPath(original), body), 409);
  }
});

test('realização direta de aguardando combinar e replay depois de avançar distinguem evento e estado atual', async t => {
  const f = await ticketFixture(t);
  const agreement = await f.transition(f.issued, 'AGREE');
  const result = await f.transition(f.issued, 'FULFILL');
  const replay = await f.owner.client.post(f.transitionPath(f.issued), agreement.request);
  expectStatus(replay, 200);
  const recovered = await replay.json();
  assert.equal(recovered.ticket.status, 'FULFILLED'); assert.equal(recovered.appliedVersion, 2);
  assert.equal(recovered.event.id, agreement.event.id);
  const found = await f.operation(f.issued, agreement.request.operationId);
  assert.equal(found.operation.appliedVersion, 2); assert.equal(found.operation.ticket.version, result.ticket.version);
  const second = await f.redeem(f.reward);
  assert.equal((await f.transition(second, 'FULFILL')).ticket.status, 'FULFILLED');
  assert.equal((await f.balance()).available, '10');
});

for (const agreed of [false, true]) {
  test(`pedido bloqueia realização; recusa restaura ${agreed ? 'combinado' : 'aguardando'} sem apagar pedido`, async t => {
    const f = await ticketFixture(t);
    if (agreed) await f.transition(f.issued, 'AGREE', { text: 'Combinado preservado', agreementDate: '2026-12-01' });
    const request = await f.transition(f.issued, 'REQUEST_CANCELLATION', { text: 'Preciso cancelar' });
    assert.equal(request.ticket.status, 'CANCELLATION_REQUESTED');
    assert.equal(request.ticket.pendingCancellation.id, request.event.id);
    assert.equal(request.ticket.pendingCancellation.text, 'Preciso cancelar');
    assert.deepEqual(await f.summary(), { total: 1, outstanding: 1 });
    for (const action of ['FULFILL', 'AGREE']) {
      const body = await f.transitionBody(f.issued, action);
      await errorCode(await f.owner.client.post(f.transitionPath(f.issued), body), 409);
    }
    const refusal = await f.transition(f.issued, 'REJECT_CANCELLATION', { text: 'Já foi preparado; vamos conversar' });
    assert.equal(refusal.ticket.status, agreed ? 'AGREED' : 'WAITING_AGREEMENT');
    assert.equal(refusal.event.requestId, request.event.id); assert.equal(refusal.ticket.pendingCancellation, null);
    assert.equal(refusal.ticket.agreementText, agreed ? 'Combinado preservado' : '');
    const second = await f.transition(f.issued, 'REQUEST_CANCELLATION');
    const cancelled = await f.transition(f.issued, 'CANCEL');
    assert.equal(cancelled.event.requestId, second.event.id); assert.equal(cancelled.ticket.status, 'CANCELLED');
    assert.equal((await f.events(f.issued)).total, agreed ? 6 : 5);
    assert.equal((await f.balance()).available, '30');
  });
}

test('eventos crescem com paginação estável, sem carregar histórico ilimitado no detalhe', async t => {
  const f = await ticketFixture(t);
  for (let i = 0; i < 21; i++) await f.transition(f.issued, 'AGREE', { text: `Revisão ${i}` });
  const current = await f.ticket(f.issued);
  assert.equal(current.events.length, 20); assert.equal(current.eventsTotal, 22);
  const first = await f.events(f.issued); const last = await f.events(f.issued, '?page=2');
  assert.equal(first.total, 22); assert.equal(first.items.length, 20); assert.equal(last.items.length, 2);
  assert.deepEqual([...first.items, ...last.items].map(item => item.version), Array.from({ length: 22 }, (_, i) => i + 1));
  await errorCode(await f.ana.client.get(`${f.ticketPath(f.issued)}/eventos?pageSize=51`), 400);
});
