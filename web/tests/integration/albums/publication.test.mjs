import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { albumFixture, closeRuntime, processBatch } from './helpers.mjs';
import { memoryOrigin } from '../media/origin-fixture.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('álbum publica três fotos e dois vídeos reais na ordem/legenda explícitas sem alterar finanças', async t => {
  const f = await albumFixture(t);
  const before = await f.financial();
  const assets = await f.ready(['photo.png', 'photo.webp', 'photo-gps-orientation.jpg', 'video.mp4', 'video.mov']);
  assert.equal((await f.album(f.ana)).total, 0);
  await errorCode(await f.ana.client.get(f.assetPath(assets[0].id)), 404);
  const ordered = [...assets].reverse().map((asset, i) => ({ assetId: asset.id, caption: i ? `Momento ${i}` : '🎁'.repeat(500) }));
  const result = await f.publish(ordered);
  assert.equal(result.appliedVersion, 2);
  const visible = await f.album(f.ana);
  assert.equal(visible.collectionId, null);
  assert.deepEqual(visible.items.map(item => item.assetId), ordered.map(item => item.assetId));
  assert.deepEqual(visible.items.map(item => item.position), [1, 2, 3, 4, 5]);
  assert.equal(Array.from(visible.items[0].caption).length, 500);
  assert.equal(visible.items.filter(item => item.mediaType === 'VIDEO').length, 2);
  assert.ok(visible.items.every(item => item.width > 0 && item.height > 0 && !item.canRemove));
  const video = visible.items.find(item => item.mediaType === 'VIDEO');
  const grant = await f.access(f.ana, video.assetId);
  const range = await f.ana.client.get(grant.url, { Range: 'bytes=0-31' });
  expectStatus(range, 206); assert.equal((await range.arrayBuffer()).byteLength, 32);
  assert.deepEqual((await f.ticket(f.ana)).album, { publishedCount: 5, thumbnailAssetId: ordered[0].assetId });
  assert.deepEqual(await f.financial(), before);
  assert.deepEqual(await f.counts(), { events: 1, items: 5, outbox: 1 });
});

test('falha de vídeo permanece privada e publicação parcial é explícita, com lote posterior independente', async t => {
  const f = await albumFixture(t);
  const photos = await f.ready(['photo.png', 'photo.webp']);
  const broken = await f.upload(f.owner, Buffer.from('vídeo inválido'), 'video/mp4');
  assert.deepEqual(await processBatch(), { processed: 0, failed: 1 });
  const draft = await f.album();
  await errorCode(await f.owner.client.post(`${f.albumPath()}/publicacoes`, f.body(draft, [photos[0].id, broken.id])), 409);
  assert.equal((await f.album(f.ana)).total, 0); assert.deepEqual(await f.counts(), { events: 0, items: 0, outbox: 0 });
  await f.publish(photos.map(asset => asset.id));
  assert.equal((await f.album(f.ana)).total, 2);
  await errorCode(await f.ana.client.get(f.assetPath(broken.id)), 404);
  expectStatus(await f.owner.client.post(`${f.assetPath(broken.id)}/remover`, {}), 200);
  const [replacement] = await f.ready(['video.mp4']);
  await f.publish([{ assetId: replacement.id, caption: 'Agora pronto' }]);
  assert.deepEqual((await f.album(f.ana)).items.map(item => item.position), [1, 2, 3]);
  assert.deepEqual(await f.counts(), { events: 3, items: 3, outbox: 2 });
});

test('início é recuperável por ticket e leitura ausente não cria; outro ticket do mesmo mimo permanece isolado', async t => {
  const f = await albumFixture(t);
  const original = await f.album();
  const response = await f.owner.client.post(`${f.albumPath()}/iniciar`, { operationId: randomUUID() });
  expectStatus(response, 201); assert.equal((await response.json()).album.id, original.id);
  const second = await memoryOrigin(f.owner, f.ana, f.store, f.participation, { id: (await f.ticket()).rewardId });
  assert.notEqual(second.id, f.memory.id); assert.notEqual(second.subjectId, f.memory.subjectId);
  const [asset] = await f.ready(); await f.publish([asset.id]);
  assert.equal((await f.album(f.ana, second)).total, 0);
  const thirdId = randomUUID();
  await errorCode(await f.owner.client.get(`/api/lojas/${f.store.id}/tickets/${thirdId}/album`), 404);
  assert.equal((await f.database.query('SELECT id FROM app."TicketAlbum" WHERE "redemptionId"=$1', [thirdId])).rowCount, 0);
});

test('replay distingue publicação aplicada de visão atual após remoção e novo lote', async t => {
  const f = await albumFixture(t);
  const assets = await f.ready(['photo.png', 'photo.webp']);
  const first = await f.publish([assets[0].id]);
  expectStatus(await f.owner.client.post(`${f.assetPath(assets[0].id)}/remover`, {}), 200);
  await f.publish([assets[1].id]);
  const response = await f.owner.client.post(`${f.albumPath()}/publicacoes`, first.request);
  expectStatus(response, 200); const replay = await response.json();
  assert.equal(replay.publication.id, first.publication.id); assert.equal(replay.appliedVersion, first.appliedVersion);
  assert.equal(replay.album.version, 4); assert.deepEqual(replay.album.items.map(item => item.assetId), [assets[1].id]);
  const lookup = await f.read(`${f.albumPath()}/operacoes/${first.request.operationId}`);
  assert.deepEqual(lookup.operation, replay);
  assert.equal((await f.read(`${f.albumPath()}/operacoes/${randomUUID()}`)).operation, null);
  assert.deepEqual(await f.counts(), { events: 3, items: 2, outbox: 2 });
});
