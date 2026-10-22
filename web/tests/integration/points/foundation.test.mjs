import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { reviewFixture, closeRuntime } from './helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('aprovação manual confirma crédito único do snapshot, auditoria, saldo e notificação juntos', async t => {
  const f = await reviewFixture(t);
  const record = await f.received({ points: 15 });
  const request = { operationId: randomUUID(), expectedVersion: 0,
    action: 'APPROVE', reason: '', expectedBalance: '0' };
  const response = await f.owner.client.post(`${f.submissionPath(record)}/analise`, request);
  expectStatus(response, 200);
  const result = await response.json();
  assert.equal(result.appliedVersion, 1); assert.equal(result.event.id, request.operationId);
  assert.equal(result.event.kind, 'APPROVE'); assert.equal(result.event.delta, '15');
  assert.equal(result.submission.status, 'APPROVED'); assert.equal(result.submission.pointsState, 'CREDITED');
  assert.equal(result.submission.analysis.version, 1);
  assert.equal(result.submission.analysis.approval.mode, 'MANUAL');
  assert.equal((await f.balance()).available, '15'); assert.equal((await f.balance()).pending, '0');
  assert.deepEqual(await f.counts(record), { ledger: 1, reviews: 1, outbox: 1 });
  const [entry] = await f.ledger(record);
  assert.equal(entry.kind, 'ACTIVITY_CREDIT'); assert.equal(entry.amount, '15');
  assert.equal(entry.actorProfileId, f.owner.id); assert.equal(entry.reviewEventId, result.event.id);
  assert.equal(entry.compensatesEntryId, null); assert.equal(entry.sourceKey, `submission.credit:${record.id}`);
});
