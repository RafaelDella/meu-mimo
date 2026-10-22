import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { albumFixture, closeRuntime, fileInput, fixtureBytes, processBatch } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { expireMediaBatch } from '../../../src/server/media-worker/retention.ts';
import { purgeRemovedMediaBatch } from '../../../src/server/media-worker/cleanup.ts';
after(closeRuntime);

const closeMember = f => f.owner.client.post(`/api/lojas/${f.store.id}/participacoes/${f.participation.id}/encerrar`, {});
const closeStore = f => f.owner.client.post(`/api/lojas/${f.store.id}/estado`, { action: 'close' });
const retentionRow = async f => (await f.database.query('SELECT "retentionHold","retentionUntil" FROM app."MediaCollection" WHERE id=$1', [f.memory.id])).rows[0];

test('pausa e encerramento preservam publicação dentro dos doze meses sem reabrir o contexto', async t => {
  const f = await albumFixture(t);
  expectStatus(await f.owner.client.post(`/api/lojas/${f.store.id}/estado`, { action: 'pause' }), 200);
  const [first] = await f.ready(); await f.publish([first.id]);
  assert.equal((await retentionRow(f)).retentionUntil, null);
  expectStatus(await closeMember(f), 200); const firstDeadline = (await retentionRow(f)).retentionUntil;
  expectStatus(await closeStore(f), 200);
  await f.transition('FULFILL');
  const before = await f.financial(); const [second] = await f.ready(['photo.webp']); await f.publish([second.id]);
  assert.equal((await f.album(f.ana)).total, 2);
  const current = await retentionRow(f);
  assert.equal(current.retentionHold, false); assert.equal(current.retentionUntil.toISOString(), firstDeadline.toISOString());
  assert.equal((await f.ticket()).status, 'FULFILLED'); assert.deepEqual(await f.financial(), before);
});

for (const first of ['member', 'store']) test(`primeiro encerramento ${first} usa29/02→28/02; hold protege existentes sem novo upload e resolução tardia não renova`, async t => {
  const f = await albumFixture(t); const assets = await f.ready(['photo.png', 'photo.webp']);
  await f.publish([assets[0].id]); const grant = await f.access(f.ana, assets[0].id);
  expectStatus(await (first === 'member' ? closeMember(f) : closeStore(f)), 200);
  // Relógio histórico da origem: mantém domínio/financeiro provenientes das APIs reais.
  const table = first === 'member' ? 'Membership' : 'Store';
  const id = first === 'member' ? f.participation.id : f.store.id;
  await f.database.query(`UPDATE app."${table}" SET "closedAt"='2024-02-29T12:34:56Z' WHERE id=$1`, [id]);
  expectStatus(await (first === 'member' ? closeStore(f) : closeMember(f)), 200);
  const held = await retentionRow(f);
  assert.equal(held.retentionUntil.toISOString(), '2025-02-28T12:34:56.000Z'); assert.equal(held.retentionHold, true);
  const album = await f.album(); assert.equal(album.permissions.canUpload, false);
  assert.equal(album.unavailableReason, 'RETENTION_EXPIRED'); assert.equal(album.total, 1);
  await errorCode(await f.owner.client.post(f.collectionPath(f.memory), { files: [fileInput(Buffer.from('novo'))] }), 409);
  await errorCode(await f.owner.client.post(`${f.albumPath()}/publicacoes`, f.body(album, [assets[1].id])), 409);
  expectStatus(await f.ana.client.get(grant.url, { Range: 'bytes=0-15' }), 206);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 0 });
  await f.transition(first === 'member' ? 'FULFILL' : 'CANCEL');
  const released = await retentionRow(f);
  assert.equal(released.retentionHold, false); assert.equal(released.retentionUntil.toISOString(), held.retentionUntil.toISOString());
  assert.equal((await f.album(f.ana)).total, 0);
  await errorCode(await f.ana.client.get(grant.url, { Range: 'bytes=0-15' }), 404);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 1 });
  assert.deepEqual(await purgeRemovedMediaBatch(), { purged: 1, failed: 0 });
  assert.deepEqual(await f.objectKeys(assets[0].id), []);
});

test('pedido em análise conserva hold até decisão e encerramento não ignora álbum de vínculo revogado', async t => {
  const f = await albumFixture(t); const [asset] = await f.ready(); await f.publish([asset.id]);
  await f.transition('REQUEST_CANCELLATION', 'Pedido privado', f.memory, f.ana);
  assert.equal((await retentionRow(f)).retentionHold, true);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  expectStatus(await closeStore(f), 200);
  const row = await retentionRow(f); assert.ok(row.retentionUntil); assert.equal(row.retentionHold, true);
  await errorCode(await f.owner.client.get(f.albumPath()), 404);
});

test('UUID nil válida não permite ler metadados de álbum vencido antes da manutenção', async t => {
  const f = await albumFixture(t); const bytes = await fixtureBytes('photo.png');
  const [asset] = await f.reserve(f.owner, [fileInput(bytes, 'image/png', '00000000-0000-0000-0000-000000000000')]);
  expectStatus(await f.part(f.owner, asset.id, bytes), 200);
  expectStatus(await f.owner.client.post(`${f.assetPath(asset.id)}/concluir`, {}), 202);
  assert.deepEqual(await processBatch(), { processed: 1, failed: 0 });
  await f.publish([{ assetId: asset.id, caption: 'Legenda que deve sair da consulta' }]);
  expectStatus(await closeMember(f), 200);
  await f.database.query('UPDATE app."Membership" SET "closedAt"=\'2024-02-29T12:34:56Z\' WHERE id=$1', [f.participation.id]);
  await f.transition('FULFILL');
  const expired = await f.album(f.ana);
  assert.equal(expired.total, 0); assert.deepEqual(expired.items, []);
});
