import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ticketFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('papel e audiência atuais protegem transição, eventos e operação sem bypass administrativo', async t => {
  const f = await ticketFixture(t);
  const admin = await f.user();
  await f.database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [admin.id]);
  const result = await f.transition(f.issued, 'AGREE');
  for (const person of [f.bia, admin]) {
    await errorCode(await person.client.get(`${f.ticketPath(f.issued)}/eventos`), 404);
    await errorCode(await person.client.get(`${f.ticketPath(f.issued)}/operacoes/${result.event.id}`), 404);
    await errorCode(await person.client.post(f.transitionPath(f.issued), await f.transitionBody(f.issued, 'FULFILL')), 404);
  }
  for (const action of ['AGREE', 'FULFILL', 'REJECT_CANCELLATION', 'CANCEL']) {
    await errorCode(await f.ana.client.post(f.transitionPath(f.issued), await f.transitionBody(f.issued, action)), 404);
  }
  await errorCode(await f.owner.client.post(f.transitionPath(f.issued), await f.transitionBody(f.issued, 'REQUEST_CANCELLATION')), 404);
  await errorCode(await f.ana.client.get(`${f.ticketPath(f.issued)}/operacoes/${result.event.id}`), 404);
  const otherStore = await f.createStore(f.owner);
  await f.addMembership(otherStore, f.owner, 'MERCHANT'); await f.addMembership(otherStore, f.ana);
  await errorCode(await f.owner.client.post(`${f.ticketPath(f.issued, otherStore)}/transicoes`, await f.transitionBody(f.issued, 'FULFILL')), 404);
  assert.equal((await f.events(f.issued)).total, 2);
});

test('sessão, CSRF e no-store protegem novos endpoints', async t => {
  const f = await ticketFixture(t);
  const body = await f.transitionBody(f.issued, 'FULFILL');
  await errorCode(await f.client().post(f.transitionPath(f.issued), body), 401);
  await errorCode(await f.owner.client.post(f.transitionPath(f.issued), body, { Origin: 'https://example.test' }), 403);
  for (const suffix of ['eventos', `operacoes/${randomUUID()}`]) {
    await errorCode(await f.client().get(`${f.ticketPath(f.issued)}/${suffix}`), 401);
    expectStatus(await f.owner.client.get(`${f.ticketPath(f.issued)}/${suffix}`), 200);
  }
  assert.equal((await f.events(f.issued)).total, 1);
});

for (const state of ['pause', 'participation-closed', 'store-closed']) {
  test(`${state} mantém combinado, pedido, recusa, cancelamento e conversa de ticket existente`, async t => {
    const f = await ticketFixture(t);
    const second = await f.redeem(f.reward);
    if (state === 'participation-closed') expectStatus(await f.owner.client.post(`${f.base()}/participacoes/${f.participation.id}/encerrar`, {}), 200);
    else expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: state === 'pause' ? 'pause' : 'close' }), 200);
    await f.transition(f.issued, 'AGREE');
    await f.transition(f.issued, 'REQUEST_CANCELLATION');
    await f.transition(f.issued, 'REJECT_CANCELLATION');
    assert.equal((await f.transition(f.issued, 'CANCEL', { restock: true })).ticket.status, 'CANCELLED');
    assert.equal((await f.transition(second, 'FULFILL')).ticket.status, 'FULFILLED');
    const path = `${f.base()}/conversas/${f.issued.conversation.id}/comentarios`;
    expectStatus(await f.ana.client.post(path, { operationId: randomUUID(), text: 'Conversa preservada' }), 201);
    assert.equal((await f.read(f.owner, path)).items[0].text, 'Conversa preservada');
    assert.deepEqual(await f.summary(), { total: 2, outstanding: 0 });
  });
}

test('revogação e suspensão negam leitura, operação e replay confirmado', async t => {
  const f = await ticketFixture(t);
  const result = await f.transition(f.issued, 'REQUEST_CANCELLATION');
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  for (const person of [f.ana, f.owner]) {
    await errorCode(await person.client.get(`${f.ticketPath(f.issued)}/eventos`), 404);
    await errorCode(await person.client.get(`${f.ticketPath(f.issued)}/operacoes/${result.event.id}`), 404);
    await errorCode(await person.client.post(f.transitionPath(f.issued), result.request), 404);
  }
  await f.database.query('UPDATE app."Profile" SET "suspendedAt"=now() WHERE id=$1', [f.owner.id]);
  const response = await f.owner.client.get(`${f.ticketPath(f.issued)}/eventos`);
  assert.ok([401, 403].includes(response.status)); assert.doesNotMatch(await response.text(), /Um combinado|Um mimo/);
});
