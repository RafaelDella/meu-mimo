import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { reviewFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { expireMediaBatch } from '../../../src/server/media-worker/retention.ts';

after(closeRuntime);

async function agePublished(f, asset) {
  // Relógio de mídia sintética; não altera o snapshot nem o horário recebido do registro.
  await f.database.query(`UPDATE app."MediaAsset" SET "publishedAt"=now()-interval '180 days 1 minute',
    "lastActivityAt"=now()-interval '181 days' WHERE id=$1`, [asset.id]);
}

test('D08 protege todas as versões contestadas e libera prazo original ao decidir sem ressuscitar foto', async t => {
  const f = await reviewFixture(t);
  const draft = await f.prepare(await f.create({ approvalMode: 'AUTOMATIC' }));
  const first = await f.photo(draft); await first.process();
  const record = await f.submit(draft, f.ana, { evidenceAssetId: first.asset.id });
  await agePublished(f, first.asset);
  const before = await f.mediaRow(first.asset.id);
  await f.decide(record, 'CONTEST');
  assert.equal((await f.collection(record.collectionId)).retentionHold, true);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 0 });
  const second = await f.photo(await f.latest(record, f.ana)); await second.process();
  await f.respond(record, { evidenceAssetId: second.asset.id });
  await agePublished(f, second.asset);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 0 });
  expectStatus(await f.owner.client.get(first.target), 200); expectStatus(await f.owner.client.get(second.target), 200);
  await f.decide(record, 'APPROVE');
  assert.equal((await f.collection(record.collectionId)).retentionHold, false);
  assert.equal(new Date((await f.mediaRow(first.asset.id)).publishedAt).getTime(), new Date(before.publishedAt).getTime());
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 2 });
  await f.decide(record, 'VOID'); await f.decide(record, 'REOPEN');
  assert.equal((await f.collection(record.collectionId)).retentionHold, true);
  assert.equal((await f.mediaRow(first.asset.id)).state, 'REMOVING');
  assert.equal((await f.latest(record)).evidenceAssetId, first.asset.id);
  await errorCode(await f.owner.client.get(first.target), 404);
  assert.equal((await f.balance()).available, '0'); assert.equal((await f.balance()).pending, '15');
});

test('foto complementar perde a disputa para decisão e vira órfã após24h sem alterar crédito', async t => {
  const f = await reviewFixture(t);
  const record = await f.received(); await f.decide(record, 'CONTEST');
  const photo = await f.photo(await f.latest(record, f.ana)); await photo.process();
  const staleResponse = await f.responseBody(record, { evidenceAssetId: photo.asset.id });
  await f.decide(record, 'APPROVE');
  await errorCode(await f.ana.client.post(`${f.submissionPath(record)}/resposta`, staleResponse), 409, 'review_changed');
  assert.equal((await f.mediaRow(photo.asset.id)).publishedAt, null);
  await f.database.query('UPDATE app."MediaAsset" SET "lastActivityAt"=now()-interval \'24 hours 1 minute\' WHERE id=$1', [photo.asset.id]);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 1, expired: 0 });
  assert.equal((await f.mediaRow(photo.asset.id)).state, 'REMOVING');
  assert.equal((await f.balance()).available, '15');
  assert.deepEqual(await f.counts(record), { ledger: 1, reviews: 2, outbox: 2 });
});

test('contestação × expurgo preserva resultado serializável e nunca restaura bytes já expirados', async t => {
  const f = await reviewFixture(t);
  const draft = await f.prepare(await f.create({ approvalMode: 'AUTOMATIC' }));
  const photo = await f.photo(draft); await photo.process();
  const record = await f.submit(draft, f.ana, { evidenceAssetId: photo.asset.id });
  await agePublished(f, photo.asset);
  const request = await f.reviewBody(record, 'CONTEST');
  const [response, expired] = await Promise.all([
    f.owner.client.post(`${f.submissionPath(record)}/analise`, request), expireMediaBatch(),
  ]);
  expectStatus(response, 200);
  assert.ok([0, 1].includes(expired.expired)); assert.equal(expired.orphaned, 0);
  assert.equal((await f.collection(record.collectionId)).retentionHold, true);
  const current = await f.mediaRow(photo.asset.id);
  assert.equal(current.state, expired.expired === 0 ? 'READY' : 'REMOVING');
  if (current.state === 'READY') expectStatus(await f.owner.client.get(photo.target), 200);
  else await errorCode(await f.owner.client.get(photo.target), 404);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 0 });
  assert.equal((await f.balance()).available, '15');
});
