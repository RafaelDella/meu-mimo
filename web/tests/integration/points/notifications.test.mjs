import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { reviewFixture, closeRuntime, deliver } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('decisão e resposta notificam apenas a outra pessoa, uma vez e com destino da decisão exata', async t => {
  const f = await reviewFixture(t);
  const record = await f.received();
  const privateReason = 'Motivo privado T08 que não pertence ao resumo do aviso.';
  const contested = await f.decide(record, 'CONTEST', { reason: privateReason });
  expectStatus(await f.owner.client.post(`${f.submissionPath(record)}/analise`, contested.request), 200);
  await Promise.all([deliver(), deliver()]); await deliver();
  const anaPage = await f.read(f.ana, '/api/notificacoes');
  const reviews = anaPage.items.filter(item => item.kind === 'SUBMISSION_REVIEWED');
  assert.equal(reviews.length, 1); assert.equal((await f.read(f.bia, '/api/notificacoes')).total, 0);
  assert.doesNotMatch(JSON.stringify(anaPage), new RegExp(privateReason));
  const target = await f.read(f.ana, `/api/notificacoes/${reviews[0].id}/destino`);
  assert.equal(target.type, 'submission');
  assert.equal(target.path, `/lojas/${f.store.id}/registros/${record.id}?evento=${contested.event.id}`);
  const privateText = 'Texto complementar privado que não é resumo de novidade.';
  const response = await f.respond(record, { text: privateText });
  expectStatus(await f.ana.client.post(`${f.submissionPath(record)}/resposta`, response.request), 200);
  await Promise.all([deliver(), deliver()]); await deliver();
  const ownerPage = await f.read(f.owner, '/api/notificacoes');
  assert.equal(ownerPage.items.filter(item => item.kind === 'SUBMISSION_REVIEWED').length, 0);
  const answers = ownerPage.items.filter(item => item.kind === 'SUBMISSION_RESPONDED');
  assert.equal(answers.length, 1); assert.doesNotMatch(JSON.stringify(ownerPage), new RegExp(privateText));
  const answerTarget = await f.read(f.owner, `/api/notificacoes/${answers[0].id}/destino`);
  assert.equal(answerTarget.path, `/lojas/${f.store.id}/registros/${record.id}?evento=${response.event.id}`);
  const events = (await f.database.query(`SELECT e.key, e."reviewEventId", count(n.id)::int AS count
    FROM app."OutboxEvent" e LEFT JOIN app."Notification" n ON n."eventId"=e.id
    WHERE e."reviewEventId"=ANY($1::uuid[]) GROUP BY e.id`, [[contested.event.id, response.event.id]])).rows;
  assert.equal(events.length, 2);
  for (const event of events) {
    assert.equal(event.key, `submission.review:${event.reviewEventId}`); assert.equal(event.count, 1);
  }
});

test('novidade, contador e destino revalidam audiência depois de revogar a relação', async t => {
  const f = await reviewFixture(t);
  const record = await f.received();
  const decision = await f.decide(record, 'APPROVE');
  await deliver();
  const page = await f.read(f.ana, '/api/notificacoes');
  const item = page.items.find(notification => notification.kind === 'SUBMISSION_REVIEWED');
  assert.ok(item); assert.equal(page.unreadCount, 1);
  await errorCode(await f.bia.client.get(`/api/notificacoes/${item.id}/destino`), 404);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  const after = await f.read(f.ana, '/api/notificacoes');
  assert.equal(after.total, 0); assert.equal(after.unreadCount, 0);
  await errorCode(await f.ana.client.get(`/api/notificacoes/${item.id}/destino`), 404);
  await errorCode(await f.ana.client.get(`${f.submissionPath(record)}/operacoes/${decision.event.id}`), 404);
  assert.deepEqual(await f.counts(record), { ledger: 1, reviews: 1, outbox: 1 });
});
