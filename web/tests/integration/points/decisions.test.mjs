import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { reviewFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('contestar pendente conserva pendência; anular sem crédito não inventa débito nem nova ocorrência', async t => {
  const f = await reviewFixture(t);
  const record = await f.received({ frequency: 'ONCE', points: 40 });
  const contested = await f.decide(record, 'CONTEST');
  assert.equal(contested.submission.status, 'CONTESTED'); assert.equal(contested.event.delta, '0');
  assert.equal((await f.balance()).available, '0'); assert.equal((await f.balance()).pending, '40');
  const voided = await f.decide(record, 'VOID');
  assert.equal(voided.submission.status, 'VOIDED'); assert.equal(voided.event.delta, '0');
  assert.equal(voided.submission.pointsState, 'NONE'); assert.equal(voided.event.pointsEntryId, null);
  assert.equal((await f.balance()).pending, '0');
  assert.deepEqual(await f.counts(record), { ledger: 0, reviews: 2, outbox: 2 });
  const activity = await f.read(f.ana, f.activityPath(record.activity));
  assert.equal(activity.availability.used, 1); assert.equal(activity.availability.eligible, false);
  await errorCode(await f.ana.client.post(`${f.activityPath(record.activity)}/preparar`, { operationId: randomUUID() }), 409, 'activity_limit_reached');
  const reopened = await f.decide(record, 'REOPEN');
  assert.equal(reopened.submission.status, 'PENDING'); assert.equal(reopened.event.delta, '0');
  assert.equal(reopened.submission.id, record.id); assert.equal((await f.balance()).pending, '40');
  await f.decide(record, 'APPROVE');
  assert.equal((await f.balance()).available, '40'); assert.equal((await f.ledger(record)).length, 1);
});

test('contestar automático mantém crédito e manter não cria segundo ganho ou pendência', async t => {
  const f = await reviewFixture(t);
  const record = await f.received({ approvalMode: 'AUTOMATIC', points: 23 });
  assert.equal(record.analysis.approval.mode, 'AUTOMATIC');
  const contested = await f.decide(record, 'CONTEST');
  assert.equal(contested.submission.status, 'CONTESTED'); assert.equal(contested.submission.pointsState, 'CREDITED');
  assert.equal((await f.balance()).available, '23'); assert.equal((await f.balance()).pending, '0');
  const kept = await f.decide(record, 'APPROVE');
  assert.equal(kept.event.delta, '0'); assert.equal(kept.event.pointsEntryId, null);
  assert.equal(kept.submission.status, 'APPROVED'); assert.equal(kept.submission.approvedAt, record.approvedAt);
  assert.equal(kept.submission.snapshot.approvalMode, 'AUTOMATIC');
  assert.deepEqual(await f.counts(record), { ledger: 1, reviews: 2, outbox: 2 });
  assert.equal((await f.balance()).today.credited, '23'); assert.equal((await f.balance()).today.adjusted, '0');
});

test('ciclos repetidos preservam snapshot e cadeia de compensações sem multiplicar conquistas', async t => {
  const f = await reviewFixture(t);
  const record = await f.received({ name: 'Nome da ocasião', points: 15, frequency: 'ONCE' });
  const first = await f.decide(record, 'APPROVE');
  await f.update(record.activity, { name: 'Nome atual', points: 900, approvalMode: 'AUTOMATIC' });
  const activity = await f.read(f.owner, f.activityPath(record.activity));
  expectStatus(await f.owner.client.post(`${f.activityPath(activity)}/arquivar`, {
    operationId: randomUUID(), expectedVersion: activity.version,
  }), 200);
  for (const action of ['CONTEST', 'APPROVE', 'CONTEST', 'VOID', 'REOPEN', 'APPROVE', 'VOID', 'REOPEN', 'APPROVE']) {
    const result = await f.decide(record, action);
    assert.equal(result.submission.snapshot.name, 'Nome da ocasião'); assert.equal(result.submission.snapshot.points, 15);
    assert.equal(result.submission.occurrenceNumber, record.occurrenceNumber);
    if (action === 'REOPEN') { assert.equal(result.event.delta, '0'); assert.equal((await f.balance()).pending, '15'); }
  }
  const rows = await f.ledger(record);
  assert.deepEqual(rows.map(row => row.amount), ['15', '-15', '15', '-15', '15']);
  assert.deepEqual(rows.map(row => row.kind), ['ACTIVITY_CREDIT', 'ACTIVITY_REVERSAL', 'ACTIVITY_RESTORE', 'ACTIVITY_REVERSAL', 'ACTIVITY_RESTORE']);
  assert.equal(rows[0].compensatesEntryId, null);
  for (let index = 1; index < rows.length; index += 1) assert.equal(rows[index].compensatesEntryId, rows[index - 1].id);
  assert.equal(new Set(rows.map(row => row.reviewEventId)).size, rows.length);
  assert.equal(rows.reduce((sum, row) => sum + BigInt(row.amount), 0n), 15n);
  const balance = await f.balance();
  assert.equal(balance.available, '15'); assert.equal(balance.pending, '0');
  assert.equal(balance.today.approved, 1); assert.equal(balance.today.credited, '15'); assert.equal(balance.today.adjusted, '0');
  const current = await f.latest(record);
  assert.equal(current.approvedAt, first.submission.approvedAt); assert.equal(current.analysis.version, 10);
  const history = await f.history(record);
  assert.equal(history.total, 11); assert.equal(history.items.filter(item => item.kind === 'RECEIVED').length, 1);
});

test('motivos e respostas validam Unicode, campos financeiros e transições sem efeitos', async t => {
  const f = await reviewFixture(t);
  const record = await f.received();
  const body = await f.reviewBody(record, 'CONTEST');
  const path = `${f.submissionPath(record)}/analise`;
  for (const patch of [{ reason: '' }, { reason: '   ' }, { reason: '🎁'.repeat(501) },
    { expectedBalance: 0 }, { expectedBalance: '1.5' }, { expectedBalance: 'NaN' }, { points: 999 },
    { actorProfileId: f.ana.id }, { expectedVersion: -1 }, { action: 'RESPOND' }]) {
    await errorCode(await f.owner.client.post(path, { ...body, ...patch }), 400);
  }
  const accepted = await f.decide(record, 'CONTEST', { reason: '🎁'.repeat(500) });
  assert.equal(Array.from(accepted.event.reason).length, 500);
  const response = await f.responseBody(record);
  for (const patch of [{ text: '', evidenceAssetId: null }, { text: '🎁'.repeat(501) },
    { participantMembershipId: f.otherParticipation.id }, { evidenceRevision: -1 }]) {
    await errorCode(await f.ana.client.post(`${f.submissionPath(record)}/resposta`, { ...response, ...patch }), 400);
  }
  assert.deepEqual(await f.counts(record), { ledger: 0, reviews: 1, outbox: 1 });
  const replied = await f.respond(record, { text: '🎁'.repeat(500) });
  assert.equal(Array.from(replied.event.text).length, 500);
  assert.equal(replied.event.kind, 'RESPOND'); assert.equal(replied.event.delta, '0');
  await errorCode(await f.owner.client.post(path, await f.reviewBody(record, 'REOPEN')), 409, 'review_changed');
});

test('aprovação com motivo preenchido é entrada inválida sem decisão ou crédito parcial', async t => {
  const f = await reviewFixture(t);
  const record = await f.received();
  const body = await f.reviewBody(record, 'APPROVE');
  const path = `${f.submissionPath(record)}/analise`;
  await errorCode(await f.owner.client.post(path, { ...body, reason: 'Motivo fora do contrato de aprovação.' }), 400);
  const current = await f.latest(record);
  assert.equal(current.status, 'PENDING'); assert.equal(current.analysis.version, 0);
  assert.equal((await f.balance()).available, '0'); assert.equal((await f.balance()).pending, '15');
  assert.deepEqual(await f.counts(record), { ledger: 0, reviews: 0, outbox: 0 });
  await errorCode(await f.owner.client.get(`${f.submissionPath(record)}/operacoes/${body.operationId}`), 404);
});
