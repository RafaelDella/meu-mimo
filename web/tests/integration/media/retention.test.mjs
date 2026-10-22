import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mediaFixture, closeRuntime, fileInput, fixtureBytes, processBatch } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { withStoreTransaction } from '../../../src/server/stores/transaction.ts';
import { setMediaRetention } from '../../../src/server/media/retention.ts';
import { expireMediaBatch, purgeOriginalMediaBatch } from '../../../src/server/media-worker/retention.ts';
import { purgeRemovedMediaBatch } from '../../../src/server/media-worker/cleanup.ts';
import { acceptMediaPart } from '../../../src/server/media-worker/parts.ts';

after(closeRuntime);
const currentRow = async (f, id) => (await f.database.query('SELECT * FROM app."MediaAsset" WHERE id=$1', [id])).rows[0];
async function retention(f, collection, hold, closedAt = null) {
  const identity = await f.identity(f.owner);
  return withStoreTransaction(identity, collection.storeId, scope => setMediaRetention(scope, collection.id, { hold, closedAt }));
}
async function ready(f, collection = f.memory, person = f.owner) {
  const asset = await f.upload(person, await fixtureBytes('photo.png'), 'image/png', collection);
  assert.deepEqual(await processBatch(), { processed: 1, failed: 0 });
  await f.publish(person, collection, [asset.id]);
  return asset;
}
function address(input) { return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url; }
function bounded(promise, label) {
  let timeout;
  return Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(label)), 10_000); })])
    .finally(() => clearTimeout(timeout));
}

test('mídia D08: órfão completa 24h, recente e lease vigente são preservados e publicado não vira órfão', async t => {
  const f = await mediaFixture(t);
  const [orphan, recent] = await f.reserve(f.owner, [fileInput(Buffer.from('ab')), fileInput(Buffer.from('cd'))]);
  expectStatus(await f.part(f.owner, orphan.id, Buffer.from('a')), 200);
  const leased = await f.upload(f.owner, await fixtureBytes('photo.png'));
  await f.database.query('UPDATE app."MediaAsset" SET state=\'PROCESSING\', "leaseToken"=$2, "leaseUntil"=now()+interval \'5 minutes\', "lastActivityAt"=now()-interval \'25 hours\' WHERE id=$1',
    [leased.id, randomUUID()]);
  const published = await ready(f);
  await f.database.query('UPDATE app."MediaAsset" SET "lastActivityAt"=now()-interval \'24 hours 1 minute\' WHERE id=$1', [orphan.id]);
  await f.database.query('UPDATE app."MediaAsset" SET "lastActivityAt"=now()-interval \'23 hours 59 minutes\' WHERE id=$1', [recent.id]);
  await f.database.query('UPDATE app."MediaAsset" SET "lastActivityAt"=now()-interval \'25 hours\' WHERE id=$1', [published.id]);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 1, expired: 0 });
  const hidden = await currentRow(f, orphan.id);
  assert.equal(hidden.state, 'REMOVING'); assert.ok(hidden.removedAt);
  assert.ok((await f.objectKeys(orphan.id)).length, 'A marcação lógica precede a exclusão física.');
  await errorCode(await f.owner.client.get(f.assetPath(orphan.id)), 404);
  assert.equal((await currentRow(f, recent.id)).state, 'UPLOADING');
  assert.equal((await currentRow(f, leased.id)).state, 'PROCESSING');
  assert.equal((await currentRow(f, published.id)).state, 'READY');
  assert.deepEqual(await purgeRemovedMediaBatch(), { purged: 1, failed: 0 });
  assert.deepEqual(await f.objectKeys(orphan.id), []);
  assert.equal((await currentRow(f, orphan.id)).state, 'REMOVED');
  await f.database.query('UPDATE app."MediaAsset" SET "leaseUntil"=now()-interval \'3 minutes\' WHERE id=$1', [leased.id]);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 1, expired: 0 });
  assert.equal((await currentRow(f, leased.id)).state, 'REMOVING');
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 0 });
});

test('mídia D08: retomada por parte renova atividade antes dos bytes externos e impede expurgo concorrente', async t => {
  const f = await mediaFixture(t);
  const bytes = await fixtureBytes('photo.png');
  const [asset] = await f.reserve(f.owner, [fileInput(bytes)]);
  const identity = await f.identity(f.owner);
  await f.database.query('UPDATE app."MediaAsset" SET "lastActivityAt"=now()-interval \'24 hours 1 minute\' WHERE id=$1', [asset.id]);
  const original = globalThis.fetch;
  let enter;
  let release;
  let held = false;
  const entered = new Promise(resolve => { enter = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const mock = t.mock.method(globalThis, 'fetch', async (input, init) => {
    if (!held && address(input).includes(`/storage/v1/object/${process.env.MEDIA_BUCKET}/${process.env.MEDIA_PREFIX}/${asset.id}/parts/`)) {
      held = true; enter(); await wait;
    }
    return original(input, init);
  });
  const work = acceptMediaPart({ identity, storeId: f.store.id, assetId: asset.id,
    action: 'part', offset: 0, expiresAt: Date.now() + 30_000 }, bytes);
  try {
    await bounded(entered, 'A parte não chegou à gravação externa.');
    assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 0 });
    const active = await currentRow(f, asset.id);
    assert.equal(active.state, 'UPLOADING'); assert.equal(active.uploadedBytes, 0);
    assert.ok(Date.now() - new Date(active.lastActivityAt).getTime() < 60_000);
    release(); assert.equal((await bounded(work, 'A parte retomada não encerrou.')).uploadedBytes, bytes.length);
  } finally { release(); await work.catch(() => {}); mock.mock.restore(); }
  assert.equal((await f.database.query('SELECT * FROM app."MediaPart" WHERE "assetId"=$1', [asset.id])).rowCount, 1);
});

test('mídia D08: evidência publicada expira em 180 dias somente depois da liberação da proteção', async t => {
  const f = await mediaFixture(t);
  const collections = [f.evidence, await f.collection('EVIDENCE'), await f.collection('EVIDENCE')];
  const assets = [];
  for (const collection of collections) assets.push(await ready(f, collection, f.ana));
  for (const asset of assets) await f.database.query('UPDATE app."MediaAsset" SET "publishedAt"=now()-interval \'180 days 1 minute\', "lastActivityAt"=now()-interval \'200 days\' WHERE id=$1', [asset.id]);
  await f.database.query('UPDATE app."MediaAsset" SET "publishedAt"=now()-interval \'179 days 23 hours 59 minutes\' WHERE id=$1', [assets[2].id]);
  await retention(f, collections[0], false); await retention(f, collections[2], false);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 1 });
  assert.equal((await currentRow(f, assets[0].id)).state, 'REMOVING');
  assert.equal((await currentRow(f, assets[1].id)).state, 'READY');
  assert.equal((await currentRow(f, assets[2].id)).state, 'READY');
  expectStatus(await f.owner.client.get((await f.access(f.owner, assets[1].id)).url), 200);
  await retention(f, collections[1], false);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 1 });
  assert.equal((await currentRow(f, assets[1].id)).state, 'REMOVING');
  const historical = await currentRow(f, assets[1].id);
  assert.ok(historical.publishedAt); assert.equal(historical.collectionId, collections[1].id);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 0 });
});

test('mídia D08: álbum ativo não expira, fechamento conta 12 meses UTC e hold mantém o prazo original', async t => {
  const f = await mediaFixture(t);
  const collections = [f.memory, await f.collection(), await f.collection(), await f.collection()];
  const assets = [];
  for (const collection of collections) assets.push(await ready(f, collection));
  for (const asset of assets) await f.database.query('UPDATE app."MediaAsset" SET "publishedAt"=now()-interval \'2 years\', "lastActivityAt"=now()-interval \'2 years\' WHERE id=$1', [asset.id]);
  const closed = new Date(); closed.setUTCFullYear(closed.getUTCFullYear() - 1); closed.setUTCDate(closed.getUTCDate() - 1);
  const deadline = new Date(closed); deadline.setUTCFullYear(deadline.getUTCFullYear() + 1);
  const recentlyClosed = new Date(); recentlyClosed.setUTCMonth(recentlyClosed.getUTCMonth() - 6);
  const active = await retention(f, collections[0], false);
  const ended = await retention(f, collections[1], false, closed);
  const protectedAlbum = await retention(f, collections[2], true, closed);
  await retention(f, collections[3], false, recentlyClosed);
  assert.equal(active.retentionUntil, null);
  assert.equal(ended.retentionUntil.toISOString(), deadline.toISOString());
  assert.equal(protectedAlbum.retentionUntil.toISOString(), deadline.toISOString());
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 1 });
  assert.equal((await currentRow(f, assets[0].id)).state, 'READY');
  assert.equal((await currentRow(f, assets[1].id)).state, 'REMOVING');
  assert.equal((await currentRow(f, assets[2].id)).state, 'READY');
  assert.equal((await currentRow(f, assets[3].id)).state, 'READY');
  const released = await retention(f, collections[2], false, closed);
  assert.equal(released.retentionUntil.toISOString(), protectedAlbum.retentionUntil.toISOString());
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 1 });
  assert.equal((await currentRow(f, assets[2].id)).state, 'REMOVING');
});

test('mídia D08: proteção padrão é conservadora, calendário limita fevereiro e origem não informa fechamento futuro', async t => {
  const f = await mediaFixture(t);
  const initial = (await f.database.query('SELECT * FROM app."MediaCollection" WHERE id=$1', [f.memory.id])).rows[0];
  assert.equal(initial.retentionHold, true); assert.equal(initial.retentionUntil, null);
  const closed = new Date('2024-02-29T12:34:56.000Z');
  const protectedAlbum = await retention(f, f.memory, true, closed);
  assert.equal(protectedAlbum.retentionUntil.toISOString(), '2025-02-28T12:34:56.000Z');
  const released = await retention(f, f.memory, false, closed);
  assert.equal(released.retentionUntil.toISOString(), protectedAlbum.retentionUntil.toISOString());
  await assert.rejects(retention(f, f.memory, false, new Date(Date.now() + 86_400_000)));
  await assert.rejects(retention(f, f.evidence, false, closed));
  await assert.rejects(retention(f, f.memory, 'false', null));
});

test('mídia D08: original READY aguarda lease/quarentena e elimina só partes sem mudar derivados ou URL', async t => {
  const f = await mediaFixture(t);
  const asset = await ready(f);
  const before = await currentRow(f, asset.id);
  const grant = await f.access(f.ana, asset.id);
  const response = await f.ana.client.get(grant.url); expectStatus(response, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  const keys = await f.objectKeys(asset.id);
  assert.ok(keys.some(key => key.includes('/parts/')));
  const derivatives = keys.filter(key => !key.includes('/parts/')).sort(); assert.equal(derivatives.length, 2);
  await f.database.query('UPDATE app."MediaAsset" SET "leaseToken"=$2, "leaseUntil"=now()+interval \'5 minutes\' WHERE id=$1', [asset.id, randomUUID()]);
  assert.deepEqual(await purgeOriginalMediaBatch(), { purged: 0, failed: 0 });
  await f.database.query('UPDATE app."MediaAsset" SET "leaseUntil"=now()-interval \'1 minute\' WHERE id=$1', [asset.id]);
  assert.deepEqual(await purgeOriginalMediaBatch(), { purged: 0, failed: 0 });
  await f.database.query('UPDATE app."MediaAsset" SET "leaseUntil"=now()-interval \'3 minutes\' WHERE id=$1', [asset.id]);
  assert.deepEqual(await purgeOriginalMediaBatch(), { purged: 1, failed: 0 });
  assert.deepEqual((await f.objectKeys(asset.id)).sort(), derivatives);
  assert.equal((await f.database.query('SELECT * FROM app."MediaPart" WHERE "assetId"=$1', [asset.id])).rowCount, 0);
  const current = await currentRow(f, asset.id);
  assert.equal(current.state, 'READY'); assert.equal(current.removedAt, null);
  assert.equal(current.outputVersion, before.outputVersion); assert.deepEqual(current.publishedAt, before.publishedAt);
  const stillVisible = await f.ana.client.get(grant.url); expectStatus(stillVisible, 200);
  assert.ok(Buffer.from(await stillVisible.arrayBuffer()).equals(bytes));
  assert.deepEqual(await purgeOriginalMediaBatch(), { purged: 0, failed: 0 });
});

test('mídia D08: falha física de original mantém READY consultável e retry30s limpa sem expor original', async t => {
  const f = await mediaFixture(t);
  const asset = await ready(f);
  const grant = await f.access(f.ana, asset.id);
  const original = globalThis.fetch;
  let injected = false;
  const mock = t.mock.method(globalThis, 'fetch', async (input, init) => {
    if (!injected && init?.method === 'DELETE' && address(input).endsWith(`/storage/v1/object/${process.env.MEDIA_BUCKET}`)) {
      injected = true; return Response.json({ message: 'Falha sintética ao excluir original.' }, { status: 503 });
    }
    return original(input, init);
  });
  try { assert.deepEqual(await purgeOriginalMediaBatch(), { purged: 0, failed: 1 }); }
  finally { mock.mock.restore(); }
  assert.equal(injected, true);
  const current = await currentRow(f, asset.id);
  assert.equal(current.state, 'READY'); assert.equal(current.removedAt, null);
  const remaining = new Date(current.availableAt).getTime() - Date.now();
  assert.ok(remaining > 20_000 && remaining <= 31_000, 'A falha agenda nova tentativa em 30 segundos.');
  expectStatus(await f.ana.client.get(grant.url), 200);
  assert.ok((await f.objectKeys(asset.id)).some(key => key.includes('/parts/')));
  assert.deepEqual(await purgeOriginalMediaBatch(), { purged: 0, failed: 0 });
  await f.database.query('UPDATE app."MediaAsset" SET "availableAt"=now()-interval \'1 second\' WHERE id=$1', [asset.id]);
  assert.deepEqual(await purgeOriginalMediaBatch(), { purged: 1, failed: 0 });
  const keys = await f.objectKeys(asset.id); assert.equal(keys.length, 2);
  assert.ok(keys.every(key => !key.includes('/parts/')));
  expectStatus(await f.ana.client.get(grant.url), 200);
});
