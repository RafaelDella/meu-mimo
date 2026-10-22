import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { redemptionFixture, closeRuntime, emittedOnce, noEmission } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('pausa permite catálogo administrativo e histórico; emissão nova bloqueia e replay recupera', async t => {
  const f = await redemptionFixture(t);
  await f.credit(30); const reward = await f.createReward(); const ticket = await f.redeem(reward);
  const next = await f.redemptionBody(reward);
  expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: 'pause' }), 200);
  assert.equal((await f.preview(reward)).availability.reason, 'STORE_PAUSED');
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, next), 409, 'store_paused');
  assert.deepEqual(await f.emissionCounts(next.operationId), noEmission);
  const changed = await f.updateReward(reward, { note: 'Alterado durante a pausa.' });
  const another = await f.createReward({ name: 'Criado durante a pausa.' }); await f.archiveReward(another);
  expectStatus(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, ticket.request), 200);
  assert.equal((await f.ticket(ticket)).snapshot.note, reward.note);
  assert.equal((await f.tickets()).total, 1);
  expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: 'resume' }), 200);
  await f.redeem(changed); assert.equal((await f.balance()).available, '10');
});

test('tickets existentes não impedem encerrar participação ou loja; consulta e replay autorizados ficam', async t => {
  const f = await redemptionFixture(t);
  await f.credit(30); const reward = await f.createReward(); const ticket = await f.redeem(reward);
  const next = await f.redemptionBody(reward);
  expectStatus(await f.owner.client.post(`${f.base()}/participacoes/${f.participation.id}/encerrar`, {}), 200);
  assert.equal((await f.preview(reward)).availability.reason, 'MEMBERSHIP_CLOSED');
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, next), 409, 'membership_closed');
  expectStatus(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, ticket.request), 200);
  assert.equal((await f.ticket(ticket)).id, ticket.id);
  expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: 'close' }), 200);
  expectStatus(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, ticket.request), 200);
  assert.equal((await f.lookup(reward, ticket.id)).ticket.id, ticket.id);
  assert.equal((await f.tickets()).total, 1); assert.deepEqual(await f.summary(), { total: 1, outstanding: 1 });
  assert.deepEqual(await f.emissionCounts(next.operationId), noEmission);
  assert.equal((await f.balance()).available, '20');
});

for (const action of ['pause', 'close']) {
  test(`${action} concorrente com emissão serializa sem ticket novo após a transição`, async t => {
    const f = await redemptionFixture(t);
    await f.credit(20); const reward = await f.createReward({ stock: 2 });
    const request = await f.redemptionBody(reward);
    const [issuance, transition] = await Promise.all([
      f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, request),
      f.owner.client.post(`${f.base()}/estado`, { action }),
    ]);
    expectStatus(transition, 200); assert.ok([200, 409].includes(issuance.status));
    const count = issuance.status === 200 ? 1 : 0;
    assert.deepEqual(await f.emissionCounts(request.operationId), count ? emittedOnce : noEmission);
    assert.equal((await f.balance()).available, count ? '10' : '20');
    assert.equal((await f.rewardRow(reward)).stock, 2 - count);
    const next = await f.redemptionBody(reward);
    await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, next), 409, `store_${action === 'pause' ? 'paused' : 'closed'}`);
    assert.deepEqual(await f.emissionCounts(next.operationId), noEmission);
    if (count) expectStatus(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, request), 200);
  });
}
