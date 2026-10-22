import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { reviewFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('replay antigo recupera a decisão aplicada e estado atual sem reaplicar saldo ou auditar outra vez', async t => {
  const f = await reviewFixture(t);
  const record = await f.received();
  const body = await f.reviewBody(record, 'APPROVE');
  const path = `${f.submissionPath(record)}/analise`;
  const operationPath = `${f.submissionPath(record)}/operacoes/${body.operationId}`;
  await errorCode(await f.owner.client.get(operationPath), 404);
  expectStatus(await f.owner.client.post(path, body), 200);
  await f.decide(record, 'VOID');
  const response = await f.owner.client.post(path, body); expectStatus(response, 200);
  const replay = await response.json();
  assert.equal(replay.event.id, body.operationId); assert.equal(replay.event.kind, 'APPROVE');
  assert.equal(replay.event.delta, '15'); assert.equal(replay.appliedVersion, 1);
  assert.equal(replay.submission.status, 'VOIDED'); assert.equal(replay.submission.analysis.version, 2);
  const located = await f.operation(record, body.operationId);
  assert.equal(located.event.id, body.operationId); assert.equal(located.submission.status, 'VOIDED');
  await errorCode(await f.owner.client.post(path, { ...body, expectedBalance: '1' }), 409, 'operation_conflict');
  assert.equal((await f.balance()).available, '0');
  assert.deepEqual(await f.counts(record), { ledger: 2, reviews: 2, outbox: 2 });
  const other = await f.received({ name: 'Outra origem' });
  await errorCode(await f.owner.client.post(`${f.submissionPath(other)}/analise`, body), 409, 'operation_conflict');
  await errorCode(await f.owner.client.get(`${f.submissionPath(other)}/operacoes/${body.operationId}`), 404);
});

test('saldo alterado em outra conquista invalida a prévia inclusive nas ações sem dinheiro', async t => {
  const f = await reviewFixture(t);
  const record = await f.received();
  const stale = await f.reviewBody(record, 'APPROVE');
  const staleContest = await f.reviewBody(record, 'CONTEST');
  await f.received({ name: 'Outro crédito real', points: 25, approvalMode: 'AUTOMATIC' });
  for (const body of [stale, staleContest]) {
    await errorCode(await f.owner.client.post(`${f.submissionPath(record)}/analise`, body), 409, 'balance_changed');
  }
  assert.equal((await f.latest(record)).status, 'PENDING'); assert.equal((await f.latest(record)).analysis.version, 0);
  assert.deepEqual(await f.counts(record), { ledger: 0, reviews: 0, outbox: 0 });
  const current = await f.latest(record);
  assert.deepEqual(current.analysis.impacts.APPROVE, { available: '25', delta: '15', resulting: '40' });
  await f.decide(record, 'APPROVE'); assert.equal((await f.balance()).available, '40');
});

for (const table of ['PointsEntry', 'SubmissionReviewEvent', 'OutboxEvent']) {
  test(`falha em ${table} reverte aprovação inteira; operação pode ser repetida uma vez`, async t => {
    const f = await reviewFixture(t);
    const record = await f.received();
    const body = await f.reviewBody(record, 'APPROVE');
    const path = `${f.submissionPath(record)}/analise`;
    await f.withFailure(table, body.operationId, async () => {
      await errorCode(await f.owner.client.post(path, body), 503);
      const current = await f.latest(record);
      assert.equal(current.status, 'PENDING'); assert.equal(current.analysis.version, 0);
      assert.equal((await f.balance()).available, '0');
      assert.deepEqual(await f.counts(record), { ledger: 0, reviews: 0, outbox: 0 });
      assert.equal((await f.collection(record.collectionId)).retentionHold, true);
      await errorCode(await f.owner.client.get(`${f.submissionPath(record)}/operacoes/${body.operationId}`), 404);
    });
    expectStatus(await f.owner.client.post(path, body), 200);
    expectStatus(await f.owner.client.post(path, body), 200);
    assert.equal((await f.balance()).available, '15');
    assert.deepEqual(await f.counts(record), { ledger: 1, reviews: 1, outbox: 1 });
  });
}

test('falha após estorno desfaz decisão e movimento; retry preserva crédito inicial', async t => {
  const f = await reviewFixture(t);
  const record = await f.received({ approvalMode: 'AUTOMATIC' });
  const body = await f.reviewBody(record, 'VOID');
  const path = `${f.submissionPath(record)}/analise`;
  await f.withFailure('OutboxEvent', body.operationId, async () => {
    await errorCode(await f.owner.client.post(path, body), 503);
    assert.equal((await f.latest(record)).status, 'APPROVED');
    assert.equal((await f.balance()).available, '15');
    assert.deepEqual(await f.counts(record), { ledger: 1, reviews: 0, outbox: 0 });
  });
  expectStatus(await f.owner.client.post(path, body), 200);
  expectStatus(await f.owner.client.post(path, body), 200);
  assert.deepEqual((await f.ledger(record)).map(row => row.amount), ['15', '-15']);
  assert.equal((await f.balance()).available, '0');
});

test('duas UUIDs disputam aprovação inicial e a mesma UUID confirma uma única decisão', async t => {
  const f = await reviewFixture(t);
  const record = await f.received();
  const body = await f.reviewBody(record, 'APPROVE');
  const path = `${f.submissionPath(record)}/analise`;
  const responses = await Promise.all([body, { ...body, operationId: randomUUID() }].map(request => f.owner.client.post(path, request)));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const failed = responses.find(response => response.status === 409);
  assert.equal((await failed.json()).code, 'review_changed');
  assert.deepEqual(await f.counts(record), { ledger: 1, reviews: 1, outbox: 1 });
  const voidBody = await f.reviewBody(record, 'VOID');
  const repeated = await Promise.all([1, 2].map(() => f.owner.client.post(path, voidBody)));
  repeated.forEach(response => expectStatus(response, 200));
  assert.deepEqual(await f.counts(record), { ledger: 2, reviews: 2, outbox: 2 });
  assert.equal((await f.balance()).available, '0');
});

for (const actions of [['APPROVE', 'VOID'], ['CONTEST', 'VOID']]) {
  test(`${actions.join(' × ')} serializa a mesma versão sem dinheiro parcial`, async t => {
    const f = await reviewFixture(t);
    const record = await f.received({ approvalMode: actions[0] === 'CONTEST' ? 'AUTOMATIC' : 'MANUAL' });
    const bodies = await Promise.all(actions.map(action => f.reviewBody(record, action)));
    const responses = await Promise.all(bodies.map(body => f.owner.client.post(`${f.submissionPath(record)}/analise`, body)));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const current = await f.latest(record);
    const rows = await f.ledger(record);
    const sum = rows.reduce((total, row) => total + BigInt(row.amount), 0n);
    assert.equal(sum, current.status === 'VOIDED' ? 0n : 15n);
    assert.equal((await f.balance()).available, sum.toString());
    assert.equal((await f.counts(record)).reviews, 1); assert.equal((await f.counts(record)).outbox, 1);
  });
}

test('reabertura, recomposição e nova anulação concorrentes não bifurcam a cadeia financeira', async t => {
  const f = await reviewFixture(t);
  const record = await f.received({ approvalMode: 'AUTOMATIC' });
  await f.decide(record, 'VOID');
  for (const action of ['REOPEN', 'APPROVE', 'VOID']) {
    const body = await f.reviewBody(record, action);
    const responses = await Promise.all([body, { ...body, operationId: randomUUID() }].map(request =>
      f.owner.client.post(`${f.submissionPath(record)}/analise`, request)));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const failed = responses.find(response => response.status === 409);
    assert.equal((await failed.json()).code, 'review_changed');
  }
  const rows = await f.ledger(record);
  assert.deepEqual(rows.map(row => row.amount), ['15', '-15', '15', '-15']);
  assert.equal(new Set(rows.filter(row => row.compensatesEntryId).map(row => row.compensatesEntryId)).size, 3);
  assert.deepEqual(await f.counts(record), { ledger: 4, reviews: 4, outbox: 4 });
  const totals = await f.balance();
  assert.equal(totals.available, '0'); assert.equal(totals.today.credited, '15');
  assert.equal(totals.today.adjusted, '-15'); assert.equal(totals.today.approved, 1);
});
