import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { reviewFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('resposta formal única mantém contestação e permite nova solicitação sem substituir texto anterior', async t => {
  const f = await reviewFixture(t);
  const record = await f.received();
  const firstRequest = await f.decide(record, 'CONTEST', { reason: 'Primeiro esclarecimento.' });
  assert.equal(firstRequest.submission.analysis.requestId, firstRequest.event.id);
  const repeatRequest = await f.reviewBody(record, 'CONTEST');
  await errorCode(await f.owner.client.post(`${f.submissionPath(record)}/analise`, repeatRequest), 409, 'review_changed');
  const answered = await f.respond(record, { text: 'Minha primeira resposta.' });
  assert.equal(answered.event.requestId, firstRequest.event.id); assert.equal(answered.submission.status, 'CONTESTED');
  assert.equal(answered.submission.analysis.canRespond, false); assert.equal(answered.event.delta, '0');
  const path = `${f.submissionPath(record)}/resposta`;
  expectStatus(await f.ana.client.post(path, answered.request), 200);
  await errorCode(await f.ana.client.post(path, { ...answered.request, text: 'Outra resposta.' }), 409, 'operation_conflict');
  await errorCode(await f.ana.client.post(path, { ...answered.request, operationId: randomUUID(),
    expectedVersion: answered.submission.analysis.version }), 409, 'review_changed');
  const secondRequest = await f.decide(record, 'CONTEST', { reason: 'Outro esclarecimento necessário.' });
  assert.notEqual(secondRequest.event.id, firstRequest.event.id);
  assert.ok(secondRequest.submission.analysis.evidenceRevision > firstRequest.submission.analysis.evidenceRevision);
  const oldBody = { ...answered.request, operationId: randomUUID(), expectedVersion: secondRequest.appliedVersion };
  await errorCode(await f.ana.client.post(path, oldBody), 409, 'review_changed');
  await f.respond(record, { text: 'Minha segunda resposta.' });
  const history = await f.history(record);
  assert.deepEqual(history.items.filter(item => item.kind === 'RESPOND').map(item => item.text).sort(),
    ['Minha primeira resposta.', 'Minha segunda resposta.']);
  assert.equal((await f.balance()).available, '0'); assert.equal((await f.balance()).pending, '15');
});

test('foto complementar precisa ser READY da revisão atual; foto inicial e legenda ficam preservadas', async t => {
  const f = await reviewFixture(t);
  const draft = await f.prepare(await f.create());
  const original = await f.photo(draft); await original.process();
  const record = await f.submit(draft, f.ana, { caption: 'Legenda inicial imutável.', evidenceAssetId: original.asset.id });
  await f.decide(record, 'CONTEST');
  const current = await f.latest(record, f.ana);
  const extra = await f.photo(current);
  await errorCode(await f.owner.client.get(extra.target), 404);
  await errorCode(await f.bia.client.get(extra.target), 404);
  const body = await f.responseBody(record, { text: '', evidenceAssetId: extra.asset.id });
  const path = `${f.submissionPath(record)}/resposta`;
  await errorCode(await f.ana.client.post(path, body), 409, 'media_not_ready');
  assert.equal((await f.mediaRow(extra.asset.id)).publishedAt, null);
  await extra.process();
  await errorCode(await f.ana.client.post(path, { ...body, evidenceAssetId: original.asset.id }), 404);
  const anotherDraft = await f.prepare(await f.create({ name: 'Outra evidência' }), f.bia);
  const otherPhoto = await f.photo(anotherDraft, f.bia); await otherPhoto.process();
  await errorCode(await f.ana.client.post(path, { ...body, evidenceAssetId: otherPhoto.asset.id }), 404);
  expectStatus(await f.ana.client.post(path, body), 200);
  expectStatus(await f.owner.client.get(original.target), 200); expectStatus(await f.owner.client.get(extra.target), 200);
  const resulting = await f.latest(record);
  assert.equal(resulting.evidenceAssetId, original.asset.id); assert.equal(resulting.caption, 'Legenda inicial imutável.');
  assert.equal(resulting.status, 'CONTESTED'); assert.equal(resulting.analysis.canRespond, false);
  const history = await f.history(record);
  assert.equal(history.items.find(item => item.kind === 'RESPOND').evidenceAssetId, extra.asset.id);
  assert.ok((await f.mediaRow(original.asset.id)).publishedAt); assert.ok((await f.mediaRow(extra.asset.id)).publishedAt);
  assert.equal((await f.collection(record.collectionId)).retentionHold, true);
  assert.ok((await f.collection(record.collectionId)).uploadsClosedAt);
  await errorCode(await f.ana.client.post(`${extra.target}/remover`, {}), 409);
});

test('dois complementos da mesma solicitação disputam versão e notificam uma só vez', async t => {
  const f = await reviewFixture(t);
  const record = await f.received(); await f.decide(record, 'CONTEST');
  const first = await f.responseBody(record);
  const second = { ...first, operationId: randomUUID(), text: 'Segunda intenção concorrente.' };
  const responses = await Promise.all([first, second].map(body => f.ana.client.post(`${f.submissionPath(record)}/resposta`, body)));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.deepEqual(await f.counts(record), { ledger: 0, reviews: 2, outbox: 2 });
  const current = await f.latest(record);
  assert.equal(current.status, 'CONTESTED'); assert.equal(current.analysis.version, 2);
});

test('responder com foto × decidir não publica evidência após a decisão vencedora', async t => {
  const f = await reviewFixture(t);
  const record = await f.received(); await f.decide(record, 'CONTEST');
  const photo = await f.photo(await f.latest(record, f.ana)); await photo.process();
  const responseBody = await f.responseBody(record, { evidenceAssetId: photo.asset.id });
  const reviewBody = await f.reviewBody(record, 'APPROVE');
  const [response, decision] = await Promise.all([
    f.ana.client.post(`${f.submissionPath(record)}/resposta`, responseBody),
    f.owner.client.post(`${f.submissionPath(record)}/analise`, reviewBody),
  ]);
  assert.deepEqual([response.status, decision.status].sort(), [200, 409]);
  const current = await f.latest(record);
  assert.equal(current.analysis.version, 2);
  assert.equal(Boolean((await f.mediaRow(photo.asset.id)).publishedAt), response.status === 200);
  assert.equal((await f.balance()).available, decision.status === 200 ? '15' : '0');
  if (decision.status === 200) {
    assert.equal(current.status, 'APPROVED'); await errorCode(await f.owner.client.get(photo.target), 404);
  } else {
    assert.equal(current.status, 'CONTESTED'); expectStatus(await f.owner.client.get(photo.target), 200);
  }
});

test('falha de outbox no complemento desfaz publicação e fechamento de uploads; retry é idempotente', async t => {
  const f = await reviewFixture(t);
  const record = await f.received(); await f.decide(record, 'CONTEST');
  const photo = await f.photo(await f.latest(record, f.ana)); await photo.process();
  const body = await f.responseBody(record, { evidenceAssetId: photo.asset.id });
  const path = `${f.submissionPath(record)}/resposta`;
  await f.withFailure('OutboxEvent', body.operationId, async () => {
    await errorCode(await f.ana.client.post(path, body), 503);
    assert.equal((await f.latest(record)).analysis.version, 1);
    assert.equal((await f.mediaRow(photo.asset.id)).publishedAt, null);
    assert.equal((await f.collection(record.collectionId)).uploadsClosedAt, null);
    await errorCode(await f.owner.client.get(photo.target), 404);
    assert.deepEqual(await f.counts(record), { ledger: 0, reviews: 1, outbox: 1 });
  });
  expectStatus(await f.ana.client.post(path, body), 200); expectStatus(await f.ana.client.post(path, body), 200);
  assert.ok((await f.mediaRow(photo.asset.id)).publishedAt);
  assert.deepEqual(await f.counts(record), { ledger: 0, reviews: 2, outbox: 2 });
  const result = await f.operation(record, body.operationId, f.ana);
  assert.equal(result.event.kind, 'RESPOND'); assert.equal(result.event.evidenceAssetId, photo.asset.id);
});
