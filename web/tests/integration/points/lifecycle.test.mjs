import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { reviewFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('pausa permite análise e foto de complemento real, mantendo novos registros bloqueados', async t => {
  const f = await reviewFixture(t);
  const record = await f.received({ frequency: 'WEEKLY', weeklyLimit: 2 });
  expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: 'pause' }), 200);
  await f.decide(record, 'CONTEST');
  const photo = await f.photo(await f.latest(record, f.ana)); await photo.process();
  await f.respond(record, { evidenceAssetId: photo.asset.id });
  await f.decide(record, 'APPROVE');
  assert.equal((await f.balance()).available, '15');
  await errorCode(await f.ana.client.post(`${f.activityPath(record.activity)}/preparar`, { operationId: randomUUID() }), 409);
  expectStatus(await f.owner.client.get(photo.target), 200);
});

test('contestação bloqueia encerramento correto; decisão final libera e fechado só aceita consulta', async t => {
  const f = await reviewFixture(t);
  const record = await f.received({ approvalMode: 'AUTOMATIC' });
  const contested = await f.decide(record, 'CONTEST');
  const close = `${f.base()}/participacoes/${f.participation.id}/encerrar`;
  await errorCode(await f.owner.client.post(close, {}), 409, 'pending_submissions');
  await errorCode(await f.owner.client.post(`${f.base()}/estado`, { action: 'close' }), 409, 'pending_submissions');
  expectStatus(await f.bia.client.post(`${f.base()}/participacoes/${f.otherParticipation.id}/encerrar`, {}), 200);
  const kept = await f.decide(record, 'APPROVE');
  expectStatus(await f.owner.client.post(close, {}), 200);
  const body = await f.reviewBody(record, 'VOID');
  await errorCode(await f.owner.client.post(`${f.submissionPath(record)}/analise`, body), 409, 'membership_closed');
  expectStatus(await f.ana.client.get(f.submissionPath(record)), 200);
  expectStatus(await f.ana.client.get(`${f.submissionPath(record)}/historico`), 200);
  expectStatus(await f.owner.client.get(`${f.submissionPath(record)}/operacoes/${kept.event.id}`), 200);
  const response = { operationId: randomUUID(), expectedVersion: kept.appliedVersion,
    requestId: contested.event.id, evidenceRevision: contested.submission.analysis.evidenceRevision,
    text: 'Resposta tardia.', evidenceAssetId: null };
  const rejected = await f.ana.client.post(`${f.submissionPath(record)}/resposta`, response);
  await errorCode(rejected, 409, 'membership_closed');
});

for (const action of ['CONTEST', 'REOPEN']) {
  test(`encerrar loja × ${action} nunca cria nova análise numa loja fechada`, async t => {
    const f = await reviewFixture(t);
    const record = await f.received({ approvalMode: 'AUTOMATIC' });
    if (action === 'REOPEN') await f.decide(record, 'VOID');
    const body = await f.reviewBody(record, action);
    const [decision, closing] = await Promise.all([
      f.owner.client.post(`${f.submissionPath(record)}/analise`, body),
      f.owner.client.post(`${f.base()}/estado`, { action: 'close' }),
    ]);
    assert.deepEqual([decision.status, closing.status].sort(), [200, 409]);
    const current = await f.latest(record);
    const row = (await f.database.query('SELECT state FROM app."Store" WHERE id=$1', [f.store.id])).rows[0];
    if (closing.status === 200) {
      assert.equal(row.state, 'CLOSED'); assert.ok(['APPROVED', 'VOIDED'].includes(current.status));
      await errorCode(await f.owner.client.post(`${f.submissionPath(record)}/analise`, body), 409, 'store_closed');
    } else {
      assert.equal(row.state, 'ACTIVE'); assert.equal(current.status, action === 'CONTEST' ? 'CONTESTED' : 'PENDING');
    }
    const totals = await f.balance();
    assert.equal(totals.available, action === 'CONTEST' ? '15' : '0');
  });
}
