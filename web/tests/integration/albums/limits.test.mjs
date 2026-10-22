import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { albumFixture, closeRuntime, fileInput } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('publicação valida lote1–10, duplicação, versão, campos e Unicode antes de alterar álbum', async t => {
  const f = await albumFixture(t); const [asset] = await f.ready(); const current = await f.album();
  const valid = f.body(current, [asset.id]);
  const invalid = [
    { ...valid, items: [] }, { ...valid, items: Array.from({ length: 11 }, () => ({ assetId: randomUUID(), caption: '' })) },
    { ...valid, items: [valid.items[0], valid.items[0]] }, { ...valid, expectedVersion: 0 },
    { ...valid, expectedVersion: 1.5 }, { ...valid, storeId: f.store.id },
    { ...valid, items: [{ assetId: asset.id, caption: '🎁'.repeat(501) }] },
    { ...valid, items: [{ assetId: asset.id, caption: '\ud800' }] },
    { ...valid, items: [{ assetId: asset.id, caption: 'Texto\u0001' }] },
    { ...valid, items: [{ assetId: asset.id, caption: '', position: 7 }] },
  ];
  for (const request of invalid) await errorCode(await f.owner.client.post(`${f.albumPath()}/publicacoes`, request), 400);
  assert.deepEqual(await f.counts(), { events: 0, items: 0, outbox: 0 });
  const result = await f.publish([{ assetId: asset.id, caption: ' \t\u00a0 ' }]);
  assert.equal(result.album.items[0].caption, '');
});

test('capacidade20 inclui rascunho/falha; remoção autoral libera exatamente uma vaga sem finanças', async t => {
  const f = await albumFixture(t); const before = await f.financial();
  const first = await f.reserve(f.owner, Array.from({ length: 10 }, () => fileInput(Buffer.from('a'))));
  await f.reserve(f.owner, Array.from({ length: 10 }, () => fileInput(Buffer.from('b'))));
  await f.expireReserveQuota(f.owner);
  await errorCode(await f.owner.client.post(f.collectionPath(f.memory), { files: [fileInput(Buffer.from('c'))] }), 409);
  expectStatus(await f.owner.client.post(`${f.assetPath(first[0].id)}/remover`, {}), 200);
  expectStatus(await f.owner.client.post(`${f.assetPath(first[0].id)}/remover`, {}), 200);
  await f.reserve(f.owner, [fileInput(Buffer.from('d'))]);
  const active = await f.database.query('SELECT count(*)::int n FROM app."MediaAsset" WHERE "collectionId"=$1 AND "removedAt" IS NULL', [f.memory.id]);
  assert.equal(active.rows[0].n, 20);
  assert.deepEqual(await f.counts(), { events: 1, items: 0, outbox: 0 });
  assert.deepEqual(await f.financial(), before);
});

test('versão antiga e UUID alterada exigem revisão; item de outra publicação não gera outro aviso', async t => {
  const f = await albumFixture(t); const assets = await f.ready(['photo.png', 'photo.webp']);
  const current = await f.album(); const first = await f.publish([assets[0].id]);
  await errorCode(await f.owner.client.post(`${f.albumPath()}/publicacoes`, f.body(current, [assets[1].id])), 409);
  await errorCode(await f.owner.client.post(`${f.albumPath()}/publicacoes`, { ...first.request,
    items: [{ assetId: assets[0].id, caption: 'Alteração' }] }), 409);
  await errorCode(await f.owner.client.post(`${f.albumPath()}/publicacoes`, f.body(await f.album(), [assets[0].id])), 409);
  await f.publish([assets[1].id]); assert.deepEqual(await f.counts(), { events: 2, items: 2, outbox: 2 });
});

test('dez legendas de500 Unicode são aceitas em lote e paginação preserva posições', async t => {
  const f = await albumFixture(t);
  const assets = await f.ready(Array.from({ length: 10 }, () => 'photo.png'));
  await f.publish(assets.map(asset => ({ assetId: asset.id, caption: '🎁'.repeat(500) })));
  const first = await f.album(f.ana, f.memory, '?pageSize=3');
  const second = await f.album(f.ana, f.memory, '?page=2&pageSize=3');
  assert.equal(first.total, 10); assert.equal(first.items.length, 3);
  assert.deepEqual(first.items.map(item => item.position), [1, 2, 3]);
  assert.deepEqual(second.items.map(item => item.position), [4, 5, 6]);
  assert.deepEqual(await f.counts(), { events: 1, items: 10, outbox: 1 });
});
