import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mediaFixture, closeRuntime, digest, fileInput, fixtureBytes, processBatch } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { acceptMediaPart } from '../../../src/server/media-worker/parts.ts';

after(closeRuntime);

function address(input) { return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url; }
function bounded(promise, label) {
  let timeout;
  return Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(label)), 10_000); })])
    .finally(() => clearTimeout(timeout));
}
function holdFirstOutput(t, id) {
  const original = globalThis.fetch;
  let enter;
  let release;
  let claimed = false;
  const entered = new Promise(resolve => { enter = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const mock = t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = address(input);
    if (!claimed && url.includes(`/storage/v1/object/${process.env.MEDIA_BUCKET}/${process.env.MEDIA_PREFIX}/${id}/`) && url.endsWith('/display.jpg')) {
      claimed = true; enter(); await held;
    }
    return original(input, init);
  });
  return { entered: bounded(entered, 'O worker não chegou à gravação do derivado.'), release,
    restore: () => mock.mock.restore() };
}

test('mídia: parte salva no Storage antes da falha de confirmação retoma sem duplicar', async t => {
  const f = await mediaFixture(t);
  const bytes = await fixtureBytes('photo.png');
  const [asset] = await f.reserve(f.owner, [fileInput(bytes)]);
  const identity = await f.identity(f.owner);
  const envelope = { identity, storeId: f.store.id, assetId: asset.id, action: 'part', offset: 0, expiresAt: Date.now() + 30_000 };
  const original = globalThis.fetch;
  let interrupted = false;
  const mock = t.mock.method(globalThis, 'fetch', async (input, init) => {
    const response = await original(input, init);
    if (!interrupted && response.ok && address(input).includes(`/storage/v1/object/${process.env.MEDIA_BUCKET}/${process.env.MEDIA_PREFIX}/${asset.id}/parts/0-${digest(bytes)}`)) {
      interrupted = true;
      // Storage confirmou os bytes; simula queda antes de confirmar MediaPart.
      throw new Error('Interrupção sintética entre Storage e confirmação.');
    }
    return response;
  });
  try { await assert.rejects(acceptMediaPart(envelope, bytes)); }
  finally { mock.mock.restore(); }
  assert.equal(interrupted, true);
  assert.equal((await f.objectKeys(asset.id)).length, 1);
  assert.equal((await f.database.query('SELECT * FROM app."MediaPart" WHERE "assetId" = $1', [asset.id])).rowCount, 0);
  assert.equal((await f.asset(f.owner, asset.id)).uploadedBytes, 0);
  const recovered = await acceptMediaPart(envelope, bytes);
  assert.equal(recovered.uploadedBytes, bytes.length);
  assert.equal((await f.database.query('SELECT * FROM app."MediaPart" WHERE "assetId" = $1', [asset.id])).rowCount, 1);
  assert.equal((await f.objectKeys(asset.id)).length, 1);
});

test('mídia: remover durante publicação de derivado impede consumidor antigo de restaurar visibilidade', async t => {
  const f = await mediaFixture(t);
  const asset = await f.upload(f.owner, await fixtureBytes('photo.png'));
  const gate = holdFirstOutput(t, asset.id);
  const work = processBatch(1);
  try {
    await gate.entered;
    const processing = await f.asset(f.owner, asset.id); assert.equal(processing.state, 'PROCESSING');
    await errorCode(await f.owner.client.post(`${f.assetPath(asset.id)}/acesso`, { variant: 'display' }), 404);
    expectStatus(await f.owner.client.post(`${f.assetPath(asset.id)}/remover`, {}), 200);
    await errorCode(await f.owner.client.get(f.assetPath(asset.id)), 404);
    gate.release();
    assert.deepEqual(await bounded(work, 'O consumidor antigo não encerrou.'), { processed: 0, failed: 1 });
  } finally { gate.release(); await work; gate.restore(); }
  const current = (await f.database.query('SELECT * FROM app."MediaAsset" WHERE id = $1', [asset.id])).rows[0];
  assert.ok(current.removedAt); assert.equal(current.outputVersion, null); assert.notEqual(current.state, 'READY');
  assert.ok((await f.objectKeys(asset.id)).every(key => key.includes('/parts/')));
});

test('mídia: lease expirado admite nova tentativa sem resultado ou exclusão do consumidor antigo', async t => {
  const f = await mediaFixture(t);
  const asset = await f.upload(f.owner, await fixtureBytes('photo.png'));
  const gate = holdFirstOutput(t, asset.id);
  const oldWork = processBatch(1);
  let firstToken;
  let secondToken;
  try {
    await gate.entered;
    firstToken = (await f.database.query('SELECT "leaseToken" FROM app."MediaAsset" WHERE id = $1', [asset.id])).rows[0].leaseToken;
    assert.ok(firstToken);
    await f.database.query('UPDATE app."MediaAsset" SET "leaseUntil" = now() - interval \'1 second\' WHERE id = $1', [asset.id]);
    assert.deepEqual(await processBatch(1), { processed: 1, failed: 0 });
    const second = (await f.database.query('SELECT * FROM app."MediaAsset" WHERE id = $1', [asset.id])).rows[0];
    secondToken = second.outputVersion;
    assert.equal(second.state, 'READY'); assert.notEqual(secondToken, firstToken);
    gate.release();
    assert.deepEqual(await bounded(oldWork, 'O consumidor com lease antigo não encerrou.'), { processed: 0, failed: 1 });
  } finally { gate.release(); await oldWork; gate.restore(); }
  const current = (await f.database.query('SELECT * FROM app."MediaAsset" WHERE id = $1', [asset.id])).rows[0];
  assert.equal(current.state, 'READY'); assert.equal(current.outputVersion, secondToken);
  const keys = await f.objectKeys(asset.id);
  assert.equal(keys.filter(key => key.includes(`/${firstToken}/`)).length, 0);
  assert.equal(keys.filter(key => key.includes(`/${secondToken}/`)).length, 2);
  expectStatus(await f.owner.client.get((await f.access(f.owner, asset.id)).url), 200);
});

test('mídia: nova sessão consulta progresso persistido e revogação impede os bytes restantes', async t => {
  const f = await mediaFixture(t);
  const bytes = Buffer.from('duas partes persistidas para retomar');
  const [asset] = await f.reserve(f.ana, [fileInput(bytes)], f.evidence);
  expectStatus(await f.part(f.ana, asset.id, bytes.subarray(0, 10)), 200);
  // Nova sessão HTTP usa o mesmo banco/Storage e não recebe token nativo de upload.
  const fresh = await f.login({ ...f.ana, client: f.client() });
  assert.equal((await f.asset(fresh, asset.id)).uploadedBytes, 10);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt" = now() WHERE id = $1', [f.participation.id]);
  await errorCode(await f.part(fresh, asset.id, bytes.subarray(10), 10), 404);
  const progress = (await f.database.query('SELECT "uploadedBytes" FROM app."MediaAsset" WHERE id = $1', [asset.id])).rows[0];
  assert.equal(progress.uploadedBytes, 10);
});
