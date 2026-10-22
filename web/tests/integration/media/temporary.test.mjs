import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mediaFixture, closeRuntime, fixtureBytes, processBatch } from './helpers.mjs';
import { cleanupMediaBatch } from '../../../src/server/media-worker/retention.ts';

after(closeRuntime);

async function temporary(t, prefix, bytes, minutes) {
  const root = path.resolve(process.env.MEDIA_TEMP_DIR);
  assert.equal(path.basename(root), 'integration');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, prefix));
  assert.equal(path.dirname(path.resolve(directory)), root);
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'input'), bytes, { flag: 'wx', mode: 0o600 });
  const date = new Date(Date.now() - minutes * 60_000);
  await utimes(directory, date, date);
  return directory;
}

test('mídia D08: reinício reconcilia original temporário abandonado mesmo após READY e expurgo do Storage', async t => {
  const f = await mediaFixture(t);
  const bytes = await fixtureBytes('photo-gps-orientation.jpg');
  const asset = await f.upload(f.owner, bytes, 'image/jpeg');
  assert.deepEqual(await processBatch(), { processed: 1, failed: 0 });
  // Representa assemble concluído por tentativa anterior que morreu sem finally.
  // O formato antigo também precisa ser reconciliado após atualizar o processo.
  const abandoned = await temporary(t, `${asset.id}-`, bytes, 15);
  assert.ok((await readFile(path.join(abandoned, 'input'))).equals(bytes));
  const grant = await f.access(f.owner, asset.id);
  const result = await cleanupMediaBatch();
  assert.equal(result.failed, 0); assert.equal(result.originalsPurged, 1);
  assert.equal((await f.objectKeys(asset.id)).filter(key => key.includes('/parts/')).length, 0);
  await assert.rejects(readFile(path.join(abandoned, 'input')), { code: 'ENOENT' });
  assert.equal((await f.owner.client.get(grant.url)).status, 200);
});

test('mídia D08: temporário recente, lease ativo e diretório desconhecido permanecem protegidos', async t => {
  const f = await mediaFixture(t);
  const bytes = await fixtureBytes('photo.png');
  const asset = await f.upload(f.owner, bytes);
  const token = randomUUID();
  await f.database.query('UPDATE app."MediaAsset" SET state=\'PROCESSING\', "leaseToken"=$2, "leaseUntil"=now()+interval \'5 minutes\' WHERE id=$1', [asset.id, token]);
  const active = await temporary(t, `${asset.id}-${token}-`, bytes, 15);
  const recent = await temporary(t, `${randomUUID()}-${randomUUID()}-`, bytes, 1);
  const unknown = await temporary(t, 'arquivo-fora-do-padrao-', bytes, 15);
  assert.equal((await cleanupMediaBatch()).failed, 0);
  for (const directory of [active, recent, unknown]) {
    assert.ok((await readFile(path.join(directory, 'input'))).equals(bytes));
  }
});
