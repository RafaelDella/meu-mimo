import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { activityFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

for (const frequency of ['ONCE', 'DAILY', 'WEEKLY']) {
  test(`duas UUIDs disputam a última ocorrência ${frequency}; apenas uma confirma e credita`, async t => {
    const f = await activityFixture(t);
    const activity = await f.create({ frequency, approvalMode: 'AUTOMATIC', points: 30 });
    const first = await f.prepare(activity);
    const second = await f.prepare(activity);
    const responses = await Promise.all([first, second].map(draft =>
      f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft))));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const rejected = responses.find(response => response.status === 409);
    assert.equal((await rejected.json()).code, 'activity_limit_reached');
    assert.equal((await f.balance()).available, '30');
    const rows = await f.database.query('SELECT status, "occurrenceNumber" FROM app."ActivitySubmission" WHERE "activityId"=$1 ORDER BY status', [activity.id]);
    assert.equal(rows.rows.filter(row => row.status === 'APPROVED').length, 1);
    assert.equal(rows.rows.filter(row => row.status === 'DRAFT').length, 1);
    assert.equal(rows.rows.find(row => row.status === 'APPROVED').occurrenceNumber, 1);
  });
}

test('duplo envio da mesma UUID recupera o resultado sem evento ou crédito adicional', async t => {
  const f = await activityFixture(t);
  const draft = await f.prepare(await f.create({ approvalMode: 'AUTOMATIC' }));
  const responses = await Promise.all([1, 2].map(() => f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft))));
  responses.forEach(response => expectStatus(response, 200));
  assert.deepEqual(await f.counts(draft), { ledger: 1, events: 2, outbox: 1, conversations: 1 });
  assert.equal((await f.balance()).available, '15');
});

for (const table of ['SubmissionEvent', 'OutboxEvent']) {
  test(`falha em ${table} reverte crédito, ocorrência e publicação; retry é único`, async t => {
    const f = await activityFixture(t);
    const draft = await f.prepare(await f.create({ approvalMode: 'AUTOMATIC' }));
    await f.withConstraint(table, `"submissionId" <> '${draft.id}'::uuid`, async () => {
      await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft)), 503);
      assert.equal((await f.read(f.ana, f.submissionPath(draft))).status, 'DRAFT');
      assert.deepEqual(await f.counts(draft), { ledger: 0, events: 0, outbox: 0, conversations: 0 });
      assert.equal((await f.balance()).available, '0');
      const collection = await f.database.query('SELECT "uploadsClosedAt", "retentionHold" FROM app."MediaCollection" WHERE id=$1', [draft.collectionId]);
      assert.equal(collection.rows[0].uploadsClosedAt, null); assert.equal(collection.rows[0].retentionHold, true);
    });
    await f.submit(draft);
    assert.deepEqual(await f.counts(draft), { ledger: 1, events: 2, outbox: 1, conversations: 1 });
  });
}

test('vários registros semanais no mesmo dia consomem N; editar frequência conta todos recebidos', async t => {
  const f = await activityFixture(t);
  let activity = await f.create({ frequency: 'WEEKLY', weeklyLimit: 4, approvalMode: 'AUTOMATIC' });
  const preparedBeforeLimit = await f.prepare(activity);
  const records = [];
  for (let index = 0; index < 3; index += 1) records.push(await f.submit(await f.prepare(activity)));
  assert.equal(new Set(records.map(record => record.localDate)).size, 1);
  activity = await f.update(activity, { frequency: 'DAILY', weeklyLimit: 1 });
  let view = await f.read(f.ana, f.activityPath(activity));
  assert.equal(view.availability.used, 3); assert.equal(view.availability.remaining, 0);
  const draft = await f.read(f.ana, f.submissionPath(preparedBeforeLimit));
  await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft)), 409, 'activity_limit_reached');
  activity = await f.update(activity, { frequency: 'WEEKLY', weeklyLimit: 3 });
  view = await f.read(f.ana, f.activityPath(activity));
  assert.equal(view.availability.used, 3); assert.equal(view.availability.eligible, false);
  activity = await f.update(activity, { frequency: 'ONCE', weeklyLimit: 1 });
  view = await f.read(f.ana, f.activityPath(activity));
  assert.equal(view.availability.used, 3);
  const historic = await f.read(f.ana, f.submissionPath(records[0]));
  assert.equal(historic.snapshot.frequency, 'WEEKLY'); assert.equal(historic.snapshot.weeklyLimit, 4);
});

test('regra, data e fuso divergentes pedem revisão sem receber ou gerar efeitos', async t => {
  const f = await activityFixture(t);
  const activity = await f.create();
  const draft = await f.prepare(activity);
  const path = `${f.submissionPath(draft)}/enviar`;
  await errorCode(await f.ana.client.post(path, f.body(draft, { expectedLocalDate: '2000-01-01' })), 409, 'period_changed');
  await errorCode(await f.ana.client.post(path, f.body(draft, { expectedTimezone: 'Europe/Lisbon' })), 409, 'timezone_changed');
  await f.update(activity, { points: 90 });
  await errorCode(await f.ana.client.post(path, f.body(draft)), 409, 'activity_changed');
  assert.deepEqual(await f.counts(draft), { ledger: 0, events: 0, outbox: 0, conversations: 0 });
  const revised = await f.read(f.ana, f.submissionPath(draft));
  assert.equal(revised.review.expectedVersion, 2);
  const result = await f.submit(revised);
  assert.equal(result.snapshot.points, 90);
});

test('resposta perdida recupera envio mesmo após pausa, arquivo e encerramento, sempre com audiência atual', async t => {
  const f = await activityFixture(t);
  const activity = await f.create({ approvalMode: 'AUTOMATIC' });
  const draft = await f.prepare(activity);
  const result = await f.submit(draft);
  expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: 'pause' }), 200);
  expectStatus(await f.ana.client.post(`${f.submissionPath(result)}/enviar`, result.request), 200);
  expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: 'resume' }), 200);
  expectStatus(await f.owner.client.post(`${f.activityPath(activity)}/arquivar`, {
    operationId: randomUUID(), expectedVersion: activity.version,
  }), 200);
  expectStatus(await f.ana.client.post(`${f.submissionPath(result)}/enviar`, result.request), 200);
  expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: 'close' }), 200);
  expectStatus(await f.ana.client.post(`${f.submissionPath(result)}/enviar`, result.request), 200);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  await errorCode(await f.ana.client.post(`${f.submissionPath(result)}/enviar`, result.request), 404);
  assert.deepEqual(await f.counts(result), { ledger: 1, events: 2, outbox: 1, conversations: 1 });
});

for (const action of ['archive', 'pause', 'edit']) {
  test(`${action} concorrente ao envio serializa a regra sem crédito parcial`, async t => {
    const f = await activityFixture(t);
    const activity = await f.create({ approvalMode: 'AUTOMATIC', points: 31 });
    const draft = await f.prepare(activity);
    const mutation = () => action === 'archive' ? f.owner.client.post(`${f.activityPath(activity)}/arquivar`,
      { operationId: randomUUID(), expectedVersion: 1 }) : action === 'pause' ?
      f.owner.client.post(`${f.base()}/estado`, { action: 'pause' }) :
      f.owner.client.patch(f.activityPath(activity), { operationId: randomUUID(), expectedVersion: 1,
        name: activity.name, description: activity.description, category: '', sticker: '', points: 99,
        frequency: 'DAILY', weeklyLimit: 1, approvalMode: 'AUTOMATIC' });
    const [received, changed] = await Promise.all([
      f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft)), mutation(),
    ]);
    expectStatus(changed, 200);
    assert.ok([200, 409].includes(received.status));
    const counts = await f.counts(draft);
    assert.equal(counts.ledger, received.status === 200 ? 1 : 0);
    assert.equal(counts.outbox, received.status === 200 ? 1 : 0);
    assert.equal((await f.balance()).available, received.status === 200 ? '31' : '0');
    const current = await f.read(f.ana, f.submissionPath(draft));
    if (received.status === 200) assert.equal(current.snapshot.points, 31);
    else assert.equal(current.status, 'DRAFT');
  });
}
