import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mediaFixture, closeRuntime, fixtureBytes, processBatch } from './helpers.mjs';
import { expectStatus, errorCode } from '../helpers/http-client.mjs';
import { purgeRemovedMediaBatch } from '../../../src/server/media-worker/cleanup.ts';
import { partKey, putObject } from '../../../src/server/media-worker/storage.ts';

after(closeRuntime);

test('mídia: remoção explícita oculta antes do expurgo e preserva o histórico estruturado', async t => {
  const f = await mediaFixture(t);
  const asset = await f.upload(f.owner, await fixtureBytes('photo.png'));
  await processBatch(); await f.publish(f.owner, f.memory, [asset.id]);
  const grant = await f.access(f.ana, asset.id);
  assert.ok((await f.objectKeys(asset.id)).length > 0);
  expectStatus(await f.owner.client.post(`${f.assetPath(asset.id)}/remover`, {}), 200);
  await errorCode(await f.ana.client.get(grant.url), 404);
  assert.deepEqual(await purgeRemovedMediaBatch(), { purged: 1, failed: 0 });
  assert.deepEqual(await f.objectKeys(asset.id), []);
  const current = (await f.database.query('SELECT * FROM app."MediaAsset" WHERE id=$1', [asset.id])).rows[0];
  assert.equal(current.state, 'REMOVED'); assert.ok(current.removedAt); assert.ok(current.purgedAt); assert.ok(current.publishedAt);
  assert.equal((await f.database.query('SELECT id FROM app."MediaCollection" WHERE id=$1', [f.memory.id])).rowCount, 1);
  assert.equal((await f.database.query('SELECT * FROM app."MediaPart" WHERE "assetId"=$1', [asset.id])).rowCount, 0);
  assert.deepEqual(await purgeRemovedMediaBatch(), { purged: 0, failed: 0 });
});

test('mídia: falha física mantém remoção lógica e retry elimina objetos sem restaurar leitura', async t => {
  const f = await mediaFixture(t);
  const asset = await f.upload(f.owner, await fixtureBytes('photo.png'));
  expectStatus(await f.owner.client.post(`${f.assetPath(asset.id)}/remover`, {}), 200);
  const original = globalThis.fetch;
  let injected = false;
  const mock = t.mock.method(globalThis, 'fetch', async (input, init) => {
    if (!injected && init?.method === 'DELETE' && String(input).endsWith(`/storage/v1/object/${process.env.MEDIA_BUCKET}`)) {
      injected = true; return Response.json({ message: 'Falha sintética de expurgo.' }, { status: 503 });
    }
    return original(input, init);
  });
  try { assert.deepEqual(await purgeRemovedMediaBatch(), { purged: 0, failed: 1 }); }
  finally { mock.mock.restore(); }
  assert.equal(injected, true);
  await errorCode(await f.owner.client.get(f.assetPath(asset.id)), 404);
  assert.equal((await f.database.query('SELECT state FROM app."MediaAsset" WHERE id=$1', [asset.id])).rows[0].state, 'REMOVING');
  await f.database.query('UPDATE app."MediaAsset" SET "availableAt"=now()-interval \'1 second\' WHERE id=$1', [asset.id]);
  assert.deepEqual(await purgeRemovedMediaBatch(), { purged: 1, failed: 0 });
  assert.deepEqual(await f.objectKeys(asset.id), []);
});

test('mídia: expurgo espera consumidor antigo e reconcilia escrita privada tardia sem reabrir arquivo', async t => {
  const f = await mediaFixture(t);
  const asset = await f.upload(f.owner, await fixtureBytes('photo.png'));
  await f.database.query('UPDATE app."MediaAsset" SET "leaseUntil"=now()+interval \'5 minutes\' WHERE id=$1', [asset.id]);
  expectStatus(await f.owner.client.post(`${f.assetPath(asset.id)}/remover`, {}), 200);
  assert.deepEqual(await purgeRemovedMediaBatch(), { purged: 0, failed: 0 });
  await f.database.query('UPDATE app."MediaAsset" SET "leaseUntil"=now()-interval \'3 minutes\' WHERE id=$1', [asset.id]);
  assert.deepEqual(await purgeRemovedMediaBatch(), { purged: 1, failed: 0 });
  await putObject(partKey(asset.id, 0, 'f'.repeat(64)), Buffer.from('objeto sintético tardio'), 'application/octet-stream');
  await f.database.query('UPDATE app."MediaAsset" SET "availableAt"=now()-interval \'1 second\' WHERE id=$1', [asset.id]);
  assert.deepEqual(await purgeRemovedMediaBatch(), { purged: 1, failed: 0 });
  assert.deepEqual(await f.objectKeys(asset.id), []);
  await errorCode(await f.owner.client.get(f.assetPath(asset.id)), 404);
});
