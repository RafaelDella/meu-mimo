import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { relationFixture, closeRuntime, deliver } from '../conversations/helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('só o destinatário lê, marca e resolve; autor, participante vizinho e admin não acessam o aviso', async t => {
  const f = await relationFixture(t);
  await f.post(f.ana, 'Entre nós.');
  await deliver();
  const page = await f.notifications(f.owner);
  assert.equal(page.unreadCount, 1);
  const notice = page.items[0];
  for (const person of [f.ana, f.bia, await f.user()]) {
    await f.database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1) ON CONFLICT DO NOTHING', [person.id]);
    await errorCode(await person.client.get(`/api/notificacoes/${notice.id}/destino`), 404);
    await errorCode(await person.client.post(`/api/notificacoes/${notice.id}/lida`, {}), 404);
  }
  const targetResponse = await f.owner.client.get(`/api/notificacoes/${notice.id}/destino`);
  expectStatus(targetResponse, 200);
  assert.deepEqual(await targetResponse.json(), { type: 'conversation', storeId: f.store.id,
    participantMembershipId: f.participation.id, conversationId: f.thread.id,
    subjectType: f.thread.subjectType, subjectId: f.thread.subjectId, path: null });
});

test('leitura idempotente não marca novo evento e consulta recupera entrega antiga atrasada', async t => {
  const f = await relationFixture(t);
  await f.post(f.ana, 'Primeira novidade.');
  await deliver();
  const first = (await f.notifications(f.owner)).items[0];
  const response = await f.owner.client.post(`/api/notificacoes/${first.id}/lida`, {});
  expectStatus(response, 200);
  const marked = await response.json();
  assert.ok(marked.readAt);
  assert.equal((await (await f.owner.client.post(`/api/notificacoes/${first.id}/lida`, {})).json()).readAt, marked.readAt);
  const later = await f.post(f.ana, 'Evento antigo que chegou depois.');
  const event = await f.eventFor(later);
  await f.database.query('UPDATE app."OutboxEvent" SET "createdAt"=now()-interval \'1 day\' WHERE id=$1', [event.id]);
  assert.equal((await f.notifications(f.owner)).unreadCount, 0);
  await deliver();
  const current = await f.notifications(f.owner);
  assert.equal(current.total, 2);
  assert.equal(current.unreadCount, 1);
  assert.equal(current.items[0].readAt, null);
  assert.equal(current.items[1].id, first.id);
  assert.ok(Date.parse(current.items[0].occurredAt) < Date.parse(current.items[1].occurredAt));
});

test('revogar a relação oculta item e contador e impede abrir aviso listado antes', async t => {
  const f = await relationFixture(t);
  await f.post(f.owner, 'Para a participante.');
  await deliver();
  const notice = (await f.notifications(f.ana)).items[0];
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  const hidden = await f.notifications(f.ana);
  assert.equal(hidden.total, 0);
  assert.equal(hidden.unreadCount, 0);
  await errorCode(await f.ana.client.get(`/api/notificacoes/${notice.id}/destino`), 404);
  await errorCode(await f.ana.client.post(`/api/notificacoes/${notice.id}/lida`, {}), 404);
});

test('encerramento preserva avisos; filtros, origem e paginação não ampliam audiência', async t => {
  const f = await relationFixture(t);
  await f.post(f.owner, 'Ainda temos uma pendência.');
  await deliver();
  await f.database.query('UPDATE app."Store" SET state=\'CLOSED\', "closedAt"=now() WHERE id=$1', [f.store.id]);
  await f.database.query('UPDATE app."Membership" SET "closedAt"=now() WHERE id=$1', [f.participation.id]);
  const notice = (await f.notifications(f.ana)).items[0];
  expectStatus(await f.ana.client.get(`/api/notificacoes/${notice.id}/destino`), 200);
  await errorCode(await f.ana.client.post(`/api/notificacoes/${notice.id}/lida`, {}, { Origin: 'https://example.invalid' }), 403);
  await errorCode(await f.ana.client.post(`/api/notificacoes/${notice.id}/lida`, { recipientProfileId: f.bia.id }), 400);
  for (const query of ['page=0', 'pageSize=51', 'page=NaN']) await errorCode(await f.ana.client.get(`/api/notificacoes?${query}`), 400);
  const scoped = await f.ana.client.get(`/api/notificacoes?storeId=${f.store.id}&pageSize=1`);
  expectStatus(scoped, 200);
  assert.equal((await scoped.json()).total, 1);
  await errorCode(await f.bia.client.get(`/api/notificacoes/${notice.id}/destino`), 404);
});
