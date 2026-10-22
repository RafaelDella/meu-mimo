import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { redemptionFixture, closeRuntime, deliver, emittedOnce } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('dois workers notificam emissão uma vez apenas ao lojista e reautorizam o ticket real', async t => {
  const f = await redemptionFixture(t);
  await f.credit(); const reward = await f.createReward({ note: 'Segredo do vale não é resumo da notificação.' });
  const ticket = await f.redeem(reward);
  expectStatus(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, ticket.request), 200);
  await Promise.all([deliver(), deliver()]); await deliver();
  const owner = await f.read(f.owner, '/api/notificacoes');
  const notices = owner.items.filter(item => item.kind === 'REDEMPTION_ISSUED');
  assert.equal(notices.length, 1); assert.doesNotMatch(JSON.stringify(owner), /Segredo do vale/);
  for (const person of [f.ana, f.bia]) {
    assert.equal((await f.read(person, '/api/notificacoes')).items.filter(item => item.kind === 'REDEMPTION_ISSUED').length, 0);
    await errorCode(await person.client.get(`/api/notificacoes/${notices[0].id}/destino`), 404);
  }
  const destination = await f.read(f.owner, `/api/notificacoes/${notices[0].id}/destino`);
  assert.equal(destination.path, `/lojas/${f.store.id}/tickets/${ticket.id}`);
  assert.equal(destination.subjectId, ticket.id);
  const events = (await f.database.query(`SELECT e.kind, e."actorProfileId", e."recipientMembershipId",
    count(n.id)::int AS count FROM app."OutboxEvent" e LEFT JOIN app."Notification" n ON n."eventId"=e.id
    WHERE e."redemptionId"=$1 GROUP BY e.id`, [ticket.id])).rows;
  assert.equal(events.length, 1); assert.equal(events[0].kind, 'REDEMPTION_ISSUED');
  assert.equal(events[0].actorProfileId, f.ana.id); assert.equal(events[0].recipientMembershipId, f.merchant.id);
  assert.equal(events[0].count, 1);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.merchant.id]);
  assert.equal((await f.read(f.owner, '/api/notificacoes')).total, 0);
  await errorCode(await f.owner.client.get(`/api/notificacoes/${notices[0].id}/destino`), 404);
  assert.deepEqual(await f.emissionCounts(ticket.id), emittedOnce);
});

test('comentário no ticket resolve origem real e notifica só a outra pessoa da conversa', async t => {
  const f = await redemptionFixture(t);
  await f.credit(); const reward = await f.createReward(); const ticket = await f.redeem(reward);
  const path = `${f.base()}/conversas/${ticket.conversation.id}/comentarios`;
  const request = { operationId: randomUUID(), text: 'Vamos combinar o mimo por aqui.' };
  const created = await f.ana.client.post(path, request); expectStatus(created, 201);
  expectStatus(await f.ana.client.post(path, request), 201);
  await errorCode(await f.bia.client.get(path), 404);
  await errorCode(await f.bia.client.post(path, { operationId: randomUUID(), text: 'Não autorizado' }), 404);
  const comments = await f.read(f.owner, path);
  assert.equal(comments.total, 1); assert.equal(comments.items[0].text, request.text);
  await Promise.all([deliver(), deliver()]); await deliver();
  const owner = await f.read(f.owner, '/api/notificacoes');
  const notice = owner.items.find(item => item.kind === 'COMMENT_CREATED'); assert.ok(notice);
  const destination = await f.read(f.owner, `/api/notificacoes/${notice.id}/destino`);
  assert.equal(destination.subjectType, 'TICKET'); assert.equal(destination.subjectId, ticket.id);
  assert.equal(destination.conversationId, ticket.conversation.id);
  assert.equal(new URL(destination.path, f.environment.origin).pathname, `/lojas/${f.store.id}/tickets/${ticket.id}`);
  assert.equal((await f.read(f.bia, '/api/notificacoes')).total, 0);
  assert.equal((await f.read(f.ana, '/api/notificacoes')).items.filter(item => item.kind === 'COMMENT_CREATED').length, 0);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  await errorCode(await f.ana.client.get(path), 404);
  await errorCode(await f.ana.client.get(f.ticketPath(ticket)), 404);
});
