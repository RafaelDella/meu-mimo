import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { redemptionFixture, rewardFields, closeRuntime, emittedOnce } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('participante, visitante e admin sem vínculo não administram catálogo nem consultam ticket alheio', async t => {
  const f = await redemptionFixture(t);
  await f.credit();
  const reward = await f.createReward(); const ticket = await f.redeem(reward);
  const admin = await f.user();
  await f.database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [admin.id]);
  for (const person of [f.ana, f.bia, admin]) {
    await errorCode(await person.client.post(`${f.base()}/mimos`, { operationId: randomUUID(), ...rewardFields() }), 404);
    await errorCode(await person.client.patch(f.rewardPath(reward), f.rewardBody(reward)), 404);
    await errorCode(await person.client.post(`${f.rewardPath(reward)}/arquivar`, f.archiveBody(reward)), 404);
  }
  for (const person of [f.bia, admin]) await errorCode(await person.client.get(f.ticketPath(ticket)), 404);
  for (const target of [`${f.base()}/mimos`, f.rewardPath(reward), `${f.base()}/tickets`, `${f.base()}/tickets/resumo`, f.ticketPath(ticket)]) {
    await errorCode(await admin.client.get(target), 404);
  }
  await errorCode(await f.bia.client.get(`${f.base()}/tickets?membershipId=${f.participation.id}`), 404);
  await errorCode(await f.bia.client.get(`${f.base()}/tickets/resumo?membershipId=${f.participation.id}`), 404);
  const store = await f.createStore(f.owner, 'Outro domínio privado');
  await f.addMembership(store, f.owner, 'MERCHANT'); await f.addMembership(store, f.ana);
  await errorCode(await f.ana.client.get(f.rewardPath(reward, store)), 404);
  await errorCode(await f.ana.client.get(f.ticketPath(ticket, store)), 404);
  expectStatus(await f.owner.client.get(f.ticketPath(ticket)), 200);
  await errorCode(await f.ana.client.get(`${f.base()}/tickets/${randomUUID()}`), 404);
  assert.equal((await f.tickets('', f.bia)).total, 0);
  assert.deepEqual(await f.emissionCounts(ticket.id), emittedOnce);
});

test('lojista não resgata na própria loja; identidade e saldo do corpo não dão autoridade', async t => {
  const f = await redemptionFixture(t);
  await f.credit(); const reward = await f.createReward();
  const request = await f.redemptionBody(reward);
  await errorCode(await f.owner.client.post(`${f.rewardPath(reward)}/resgatar`, request), 404);
  for (const extra of [{ participantMembershipId: f.otherParticipation.id }, { authorProfileId: f.bia.id },
    { cost: 1 }, { stock: 999 }, { balanceAfter: '999' }, { expectedBalance: 15 }, { expectedBalance: '1.5' }]) {
    await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, { ...request, ...extra }), 400);
  }
  assert.equal((await f.tickets()).total, 0); assert.equal((await f.balance()).available, '15');
});

test('sessão, origem e no-store protegem cadastro, edição, arquivo, resgate e recuperação', async t => {
  const f = await redemptionFixture(t);
  await f.credit(); const reward = await f.createReward(); const request = await f.redemptionBody(reward);
  const mutations = [
    [f.owner, `${f.base()}/mimos`, { operationId: randomUUID(), ...rewardFields() }, 'POST'],
    [f.owner, f.rewardPath(reward), f.rewardBody(reward), 'PATCH'],
    [f.owner, `${f.rewardPath(reward)}/arquivar`, f.archiveBody(reward), 'POST'],
    [f.ana, `${f.rewardPath(reward)}/resgatar`, request, 'POST'],
  ];
  for (const [person, path, body, method] of mutations) {
    await errorCode(await person.client.request(path, { method, json: body, headers: { Origin: 'https://example.test' } }), 403);
    await errorCode(await f.client().request(path, { method, json: body }), 401);
  }
  for (const path of [`${f.base()}/mimos`, f.rewardPath(reward), `${f.base()}/tickets`,
    `${f.base()}/tickets/resumo`, `${f.rewardPath(reward)}/operacoes/${request.operationId}`]) {
    expectStatus(await f.ana.client.get(path), 200); await errorCode(await f.client().get(path), 401);
  }
  assert.equal((await f.preview(reward)).version, 1); assert.equal((await f.balance()).available, '15');
});

test('revogação e suspensão prevalecem sobre ticket confirmado, replay e recuperação', async t => {
  const f = await redemptionFixture(t);
  await f.credit(); const reward = await f.createReward(); const ticket = await f.redeem(reward);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  for (const path of [f.ticketPath(ticket), `${f.base()}/tickets`, `${f.base()}/tickets/resumo`,
    f.rewardPath(reward), `${f.rewardPath(reward)}/operacoes/${ticket.id}`, `${f.base()}/pontos/movimentos`]) {
    const response = await f.ana.client.get(path);
    await errorCode(response, 404);
  }
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, ticket.request), 404);
  await errorCode(await f.owner.client.get(f.ticketPath(ticket)), 404);
  await f.credit(15, f.bia);
  const second = await f.redeem(reward, f.bia);
  await f.database.query('UPDATE app."Profile" SET "suspendedAt"=now() WHERE id=$1', [f.bia.id]);
  for (const response of [await f.bia.client.get(f.ticketPath(second)),
    await f.bia.client.post(`${f.rewardPath(reward)}/resgatar`, second.request)]) {
    assert.ok([401, 403].includes(response.status));
    assert.doesNotMatch(await response.text(), /Um mimo de integração|Recadinho|Conversem/);
  }
  assert.deepEqual(await f.emissionCounts(ticket.id), emittedOnce);
  assert.deepEqual(await f.emissionCounts(second.id), emittedOnce);
});
