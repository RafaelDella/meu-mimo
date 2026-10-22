import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { mediaFixture, closeRuntime, fixtureBytes, fileInput, processBatch } from './helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';
import { purgeRemovedMediaBatch } from '../../../src/server/media-worker/cleanup.ts';

after(closeRuntime);

test('mídia: UUID com caixa diferente usa o mesmo objeto no upload, processamento e expurgo', async t => {
  const f = await mediaFixture(t);
  const bytes = await fixtureBytes('photo.png');
  const [asset] = await f.reserve(f.owner, [fileInput(bytes)]);
  const storageMetadata = new pg.Client({ connectionString: f.environment.authDatabaseURL });
  await storageMetadata.connect();
  const objects = () => storageMetadata.query('SELECT name FROM storage.objects WHERE bucket_id=$1 AND name ILIKE $2',
    [process.env.MEDIA_BUCKET, `${process.env.MEDIA_PREFIX}/${asset.id}/%`]);
  t.after(async () => {
    try {
      const remaining = await objects();
      if (remaining.rowCount) assert.equal((await f.storage.remove(remaining.rows.map(row => row.name))).error, null);
    } finally { await storageMetadata.end(); }
  });
  const target = `/api/lojas/${f.store.id.toUpperCase()}/midia/arquivos/${asset.id.toUpperCase()}`;
  expectStatus(await f.owner.client.request(`${target}/partes?offset=0`, { method: 'PUT', body: bytes,
    headers: { 'Content-Type': 'application/octet-stream' } }), 200);
  const stored = await objects();
  assert.equal(stored.rowCount, 1);
  // Storage.list usa busca sem diferenciar caixa; conferir o nome persistido.
  assert.ok(stored.rows.every(row => row.name.startsWith(`${process.env.MEDIA_PREFIX}/${asset.id}/`)),
    'Não criar prefixo alternativo por caixa do UUID recebido.');
  assert.equal((await f.objectKeys(asset.id)).length, 1);
  expectStatus(await f.owner.client.post(`${target}/concluir`, {}), 202);
  assert.deepEqual(await processBatch(), { processed: 1, failed: 0 });
  assert.equal((await f.asset(f.owner, asset.id)).state, 'READY');
  expectStatus(await f.owner.client.post(`${target}/remover`, {}), 200);
  assert.deepEqual(await purgeRemovedMediaBatch(), { purged: 1, failed: 0 });
  assert.deepEqual(await f.objectKeys(asset.id), []);
  assert.equal((await objects()).rowCount, 0);
});
