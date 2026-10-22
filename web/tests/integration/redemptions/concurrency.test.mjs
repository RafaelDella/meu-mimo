import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { redemptionFixture, closeRuntime, emittedOnce, noEmission } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('dois mimos disputam saldo para um sem saldo negativo ou efeito parcial', async t => {
  const f = await redemptionFixture(t);
  await f.credit(10);
  const rewards = await Promise.all([f.createReward({ name: 'Primeiro mimo', stock: 1 }), f.createReward({ name: 'Segundo mimo', stock: 1 })]);
  const requests = await Promise.all(rewards.map(reward => f.redemptionBody(reward)));
  const responses = await Promise.all(rewards.map((reward, index) => f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, requests[index])));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const loser = responses.findIndex(response => response.status === 409);
  assert.equal((await responses[loser].json()).code, 'balance_changed');
  assert.deepEqual(await f.emissionCounts(requests[loser].operationId), noEmission);
  assert.deepEqual(await f.emissionCounts(requests[1 - loser].operationId), emittedOnce);
  assert.equal((await f.rewardRow(rewards[loser])).stock, 1);
  assert.equal((await f.rewardRow(rewards[1 - loser])).stock, 0);
  assert.equal((await f.balance()).available, '0'); assert.equal((await f.tickets()).total, 1);
});

test('dois participantes com crédito real disputam a última unidade; só um é debitado', async t => {
  const f = await redemptionFixture(t);
  await f.credit(10, f.ana); await f.credit(10, f.bia);
  const reward = await f.createReward({ stock: 1 });
  const people = [f.ana, f.bia];
  const bodies = await Promise.all(people.map(person => f.redemptionBody(reward, person)));
  const responses = await Promise.all(people.map((person, index) => person.client.post(`${f.rewardPath(reward)}/resgatar`, bodies[index])));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const loser = responses.findIndex(response => response.status === 409);
  assert.equal((await responses[loser].json()).code, 'reward_unavailable');
  assert.equal((await f.balance(people[loser])).available, '10');
  assert.equal((await f.balance(people[1 - loser])).available, '0');
  assert.deepEqual(await f.emissionCounts(bodies[loser].operationId), noEmission);
  assert.deepEqual(await f.emissionCounts(bodies[1 - loser].operationId), emittedOnce);
  const row = await f.rewardRow(reward); assert.equal(row.stock, 0); assert.equal(row.stockRevision, 2);
});

test('consumo de outra pessoa mantém a prévia válida quando ainda existe uma unidade', async t => {
  const f = await redemptionFixture(t);
  await f.credit(10, f.ana); await f.credit(10, f.bia);
  const reward = await f.createReward({ stock: 2 });
  const ana = await f.redemptionBody(reward, f.ana);
  const bia = await f.redemptionBody(reward, f.bia);
  expectStatus(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, ana), 200);
  expectStatus(await f.bia.client.post(`${f.rewardPath(reward)}/resgatar`, bia), 200);
  assert.deepEqual(await f.emissionCounts(ana.operationId), emittedOnce);
  assert.deepEqual(await f.emissionCounts(bia.operationId), emittedOnce);
  const row = await f.rewardRow(reward);
  assert.equal(row.stock, 0); assert.equal(row.stockRevision, 3); assert.equal(row.version, 1);
});

test('mesma UUID simultânea e resposta perdida recuperam um ticket antes das regras mutáveis', async t => {
  const f = await redemptionFixture(t);
  await f.credit(10);
  const reward = await f.createReward({ stock: 1 });
  const request = await f.redemptionBody(reward);
  const path = `${f.rewardPath(reward)}/resgatar`;
  const responses = await Promise.all([1, 2].map(() => f.ana.client.post(path, request)));
  for (const response of responses) expectStatus(response, 200);
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.equal(bodies[0].ticket.id, bodies[1].ticket.id); assert.equal(bodies[0].ticket.code, bodies[1].ticket.code);
  const lookup = await f.lookup(reward, request.operationId);
  assert.equal(lookup.ticket.id, request.operationId);
  expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: 'pause' }), 200);
  await f.updateReward({ ...reward, stock: 0, stockRevision: 2 }, { cost: 99, available: false });
  expectStatus(await f.ana.client.post(path, request), 200);
  assert.deepEqual(await f.emissionCounts(request.operationId), emittedOnce);
  assert.equal((await f.balance()).available, '0');
  await errorCode(await f.ana.client.post(path, { ...request, expectedBalance: '0' }), 409, 'operation_conflict');
  assert.equal((await f.lookup(reward, request.operationId)).ticket.snapshot.cost, 10);
});

test('UUID não troca autor, loja, mimo ou corpo e consulta distingue intenção ausente', async t => {
  const f = await redemptionFixture(t);
  await f.credit(20, f.ana); await f.credit(20, f.bia);
  const reward = await f.createReward();
  const other = await f.createReward({ name: 'Outro mimo' });
  const ticket = await f.redeem(reward);
  await errorCode(await f.bia.client.post(`${f.rewardPath(reward)}/resgatar`, ticket.request), 409, 'operation_conflict');
  await errorCode(await f.ana.client.post(`${f.rewardPath(other)}/resgatar`, ticket.request), 409, 'operation_conflict');
  for (const extra of [{ expectedVersion: 2 }, { expectedBalance: '19' }]) {
    await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, { ...ticket.request, ...extra }), 409, 'operation_conflict');
  }
  const store = await f.createStore(f.owner, 'Outro contexto T09');
  await f.addMembership(store, f.owner, 'MERCHANT'); await f.addMembership(store, f.ana);
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward, store)}/resgatar`, ticket.request), 404);
  const local = await f.createReward({ name: 'Mimo da outra loja' }, f.owner, store);
  await errorCode(await f.ana.client.post(`${f.rewardPath(local, store)}/resgatar`, ticket.request), 409, 'operation_conflict');
  await errorCode(await f.bia.client.get(`${f.rewardPath(reward)}/operacoes/${ticket.id}`), 404);
  await errorCode(await f.ana.client.get(`${f.rewardPath(other)}/operacoes/${ticket.id}`), 404);
  assert.deepEqual(await f.lookup(reward, randomUUID()), { ticket: null });
  assert.deepEqual(await f.emissionCounts(ticket.id), emittedOnce);
});

test('edição antiga não repõe unidade consumida; prévia antiga revê custo, saldo e disponibilidade', async t => {
  const f = await redemptionFixture(t);
  await f.credit(30);
  const reward = await f.createReward({ stock: 3 });
  const oldEditor = f.rewardBody(reward, { name: 'Edição aberta antes do consumo' });
  const oldPreview = await f.redemptionBody(reward);
  await f.redeem(reward);
  await errorCode(await f.owner.client.patch(f.rewardPath(reward), oldEditor), 409, 'stock_changed');
  assert.equal((await f.rewardRow(reward)).stock, 2);
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, oldPreview), 409, 'balance_changed');
  const latest = await f.preview(reward, f.owner);
  const oldPrice = await f.redemptionBody(reward);
  const changed = await f.updateReward(latest, { cost: 11 });
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, oldPrice), 409, 'reward_changed');
  const oldAvailability = await f.redemptionBody(changed);
  await f.updateReward(changed, { available: false });
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, oldAvailability), 409);
  assert.deepEqual(await f.emissionCounts(oldPreview.operationId), noEmission);
  assert.deepEqual(await f.emissionCounts(oldPrice.operationId), noEmission);
  assert.deepEqual(await f.emissionCounts(oldAvailability.operationId), noEmission);
  assert.equal((await f.balance()).available, '20');
});
