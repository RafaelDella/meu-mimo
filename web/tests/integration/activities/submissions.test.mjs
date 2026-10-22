import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { activityFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('preparar é idempotente e privado; manual recebido cria pendência sem saldo disponível', async t => {
  const f = await activityFixture(t);
  const activity = await f.create({ points: 40 });
  const id = randomUUID();
  const draft = await f.prepare(activity, f.ana, id);
  assert.equal(draft.id, id); assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.snapshot, null); assert.equal(draft.conversation, null);
  assert.equal((await f.prepare(activity, f.ana, id)).collectionId, draft.collectionId);
  await errorCode(await f.bia.client.post(`${f.activityPath(activity)}/preparar`, { operationId: id }), 409);
  assert.deepEqual(await f.counts(draft), { ledger: 0, events: 0, outbox: 0, conversations: 0 });
  await errorCode(await f.owner.client.get(f.submissionPath(draft)), 404);
  await errorCode(await f.bia.client.get(f.submissionPath(draft)), 404);
  const result = await f.submit(draft, f.ana, { caption: 'Uma conquista privada.' });
  assert.equal(result.status, 'PENDING'); assert.equal(result.pointsState, 'PENDING');
  assert.equal(result.snapshot.points, 40); assert.equal(result.caption, 'Uma conquista privada.');
  assert.ok(result.receivedAt); assert.equal(result.approvedAt, null); assert.ok(result.conversation.id);
  assert.deepEqual(await f.counts(result), { ledger: 0, events: 1, outbox: 1, conversations: 1 });
  const points = await f.balance();
  assert.equal(points.available, '0'); assert.equal(points.pending, '40');
  assert.equal(points.today.submitted, 1); assert.equal(points.today.approved, 0);
  assert.equal(points.today.credited, '0');
  assert.equal((await f.read(f.owner, `${f.base()}/registros?status=PENDING`)).items[0].id, result.id);
});

test('automático confirma uma vez ledger, snapshot, auditoria e evento; repetição não credita de novo', async t => {
  const f = await activityFixture(t);
  const activity = await f.create({ approvalMode: 'AUTOMATIC', points: 25 });
  const draft = await f.prepare(activity);
  const result = await f.submit(draft);
  assert.equal(result.status, 'APPROVED'); assert.equal(result.pointsState, 'CREDITED');
  assert.ok(result.approvedAt);
  const replay = await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, result.request);
  expectStatus(replay, 200); assert.equal((await replay.json()).id, result.id);
  await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, {
    ...result.request, caption: 'Outro pedido financeiro',
  }), 409);
  assert.deepEqual(await f.counts(result), { ledger: 1, events: 2, outbox: 1, conversations: 1 });
  const ledger = await f.database.query('SELECT kind, amount::text, "sourceKey" FROM app."PointsEntry" WHERE "submissionId"=$1', [result.id]);
  assert.deepEqual(ledger.rows, [{ kind: 'ACTIVITY_CREDIT', amount: '25', sourceKey: `submission.credit:${result.id}` }]);
  const points = await f.balance();
  assert.equal(points.available, '25'); assert.equal(points.pending, '0');
  assert.equal(points.today.approved, 1); assert.equal(points.today.credited, '25');
  const entries = await f.read(f.ana, `${f.base()}/pontos/movimentos`);
  assert.equal(entries.total, 1); assert.equal(entries.items[0].amount, '25');
  assert.equal(entries.items[0].path, `/lojas/${f.store.id}/registros/${result.id}`);
  const eventKinds = await f.database.query('SELECT kind FROM app."SubmissionEvent" WHERE "submissionId"=$1 ORDER BY kind', [result.id]);
  assert.deepEqual(eventKinds.rows.map(row => row.kind), ['AUTO_APPROVED', 'RECEIVED']);
});

test('legenda aceita 500 caracteres Unicode, rejeita 501 e não aceita data ou autor forjados', async t => {
  const f = await activityFixture(t);
  const activity = await f.create({ frequency: 'WEEKLY', weeklyLimit: 3 });
  const draft = await f.prepare(activity);
  await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`,
    f.body(draft, { caption: '🎁'.repeat(501) })), 400);
  const result = await f.submit(draft, f.ana, { caption: '🎁'.repeat(500) });
  assert.equal(Array.from(result.caption).length, 500);
  const second = await f.prepare(activity);
  for (const injected of [{ authorProfileId: f.bia.id }, { participantMembershipId: f.otherParticipation.id },
    { receivedAt: '2000-01-01T00:00:00Z' }, { points: 1_000_000 }, { approvalMode: 'AUTOMATIC' }]) {
    await errorCode(await f.ana.client.post(`${f.submissionPath(second)}/enviar`, f.body(second, injected)), 400);
  }
  assert.equal((await f.read(f.ana, f.submissionPath(second))).status, 'DRAFT');
  assert.equal((await f.read(f.owner, `${f.base()}/registros`)).total, 1);
});

test('edição preserva snapshot recebido e exige revisar rascunho preparado antes da mudança', async t => {
  const f = await activityFixture(t);
  const activity = await f.create({ frequency: 'WEEKLY', weeklyLimit: 3 });
  const received = await f.submit(await f.prepare(activity));
  const draft = await f.prepare(activity);
  await f.update(activity, { name: 'Nome novo', description: 'Nova regra', points: 70,
    frequency: 'ONCE', weeklyLimit: 1, approvalMode: 'AUTOMATIC' });
  await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft)), 409);
  assert.deepEqual(await f.counts(draft), { ledger: 0, events: 0, outbox: 0, conversations: 0 });
  const historic = await f.read(f.owner, f.submissionPath(received));
  assert.equal(historic.snapshot.activityVersion, 1); assert.equal(historic.snapshot.points, 15);
  assert.equal(historic.snapshot.name, activity.name); assert.equal(historic.status, 'PENDING');
  assert.equal(historic.activity.name, 'Nome novo');
});
