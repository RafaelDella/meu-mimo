import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mediaFixture, closeRuntime, digest, fileInput, PART_BYTES } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('mídia: reserva e partes idênticas são idempotentes, divergências não alteram bytes', async t => {
  const f = await mediaFixture(t);
  const bytes = Buffer.from('uma foto fictícia que ainda não foi decodificada');
  const input = fileInput(bytes);
  const [first] = await f.reserve(f.owner, [input]);
  const [repeat] = await f.reserve(f.owner, [input]);
  assert.deepEqual(repeat, first);
  await errorCode(await f.owner.client.post(f.collectionPath(f.memory), { files: [{ ...input, sha256: digest(Buffer.from('outro')) }] }), 409);
  const otherCollection = await f.collection();
  await errorCode(await f.owner.client.post(f.collectionPath(otherCollection), { files: [input] }), 409);
  const initial = await f.part(f.owner, first.id, bytes); expectStatus(initial, 200);
  assert.equal((await initial.json()).uploadedBytes, bytes.length);
  const replay = await f.part(f.owner, first.id, bytes); expectStatus(replay, 200);
  assert.equal((await replay.json()).uploadedBytes, bytes.length);
  await errorCode(await f.part(f.owner, first.id, Buffer.alloc(bytes.length, 8)), 409);
  assert.equal((await f.database.query('SELECT * FROM app."MediaPart" WHERE "assetId" = $1', [first.id])).rowCount, 1);
  assert.equal((await f.objectKeys(first.id)).length, 1);
  expectStatus(await f.owner.client.post(`${f.assetPath(first.id)}/concluir`, {}), 202);
  expectStatus(await f.owner.client.post(`${f.assetPath(first.id)}/concluir`, {}), 202);
});

test('mídia: sequência de partes, limite de 5 MiB e tamanho reservado são verificados', async t => {
  const f = await mediaFixture(t);
  const bytes = Buffer.alloc(PART_BYTES + 7, 4);
  const [asset] = await f.reserve(f.owner, [fileInput(bytes)]);
  await errorCode(await f.part(f.owner, asset.id, bytes.subarray(0, PART_BYTES + 1)), 413);
  await errorCode(await f.part(f.owner, asset.id, bytes.subarray(0, 1), 1), 409);
  await errorCode(await f.part(f.owner, asset.id, bytes.subarray(0, 1), -1), 400);
  await errorCode(await f.part(f.owner, asset.id, Buffer.alloc(0)), 400);
  await errorCode(await f.part(f.owner, asset.id, bytes.subarray(0, 1), 0, { 'Content-Type': 'text/plain' }), 415);
  expectStatus(await f.part(f.owner, asset.id, bytes.subarray(0, PART_BYTES)), 200);
  const resumed = await f.asset(f.owner, asset.id);
  assert.equal(resumed.uploadedBytes, PART_BYTES);
  await errorCode(await f.owner.client.post(`${f.assetPath(asset.id)}/concluir`, {}), 409);
  await errorCode(await f.part(f.owner, asset.id, Buffer.alloc(8), PART_BYTES), 409);
  expectStatus(await f.part(f.owner, asset.id, bytes.subarray(PART_BYTES), PART_BYTES), 200);
  assert.equal((await f.asset(f.owner, asset.id)).uploadedBytes, bytes.length);
  expectStatus(await f.owner.client.post(`${f.assetPath(asset.id)}/concluir`, {}), 202);
});

test('mídia: concorrência da mesma parte confirma uma linha e reserva concorrente não duplica', async t => {
  const f = await mediaFixture(t);
  const bytes = Buffer.from('bytes concorrentes de exemplo');
  const input = fileInput(bytes);
  const copies = await Promise.all([f.reserve(f.owner, [input]), f.reserve(f.owner, [input])]);
  assert.equal(copies[0][0].id, copies[1][0].id);
  const parts = await Promise.all([f.part(f.owner, input.operationId, bytes), f.part(f.owner, input.operationId, bytes)]);
  for (const response of parts) expectStatus(response, 200);
  assert.equal((await f.database.query('SELECT id FROM app."MediaAsset" WHERE id = $1', [input.operationId])).rowCount, 1);
  assert.equal((await f.database.query('SELECT * FROM app."MediaPart" WHERE "assetId" = $1', [input.operationId])).rowCount, 1);
  assert.equal((await f.asset(f.owner, input.operationId)).uploadedBytes, bytes.length);
});

test('mídia: limite de álbum conta envio/processamento e lote inválido não reserva parcialmente', async t => {
  const f = await mediaFixture(t);
  const files = () => Array.from({ length: 10 }, () => fileInput(Buffer.from('x')));
  const first = await f.reserve(f.owner, files());
  // Ajuste do relógio de quota só da fixture permite provar a capacidade sem aguardar um minuto.
  await f.expireReserveQuota(f.owner);
  const second = await f.reserve(f.owner, files());
  assert.equal(first.length + second.length, 20);
  await f.expireReserveQuota(f.owner);
  const overflow = fileInput(Buffer.from('x'));
  await errorCode(await f.owner.client.post(f.collectionPath(f.memory), { files: [overflow] }), 409);
  assert.equal((await f.database.query('SELECT id FROM app."MediaAsset" WHERE id = $1', [overflow.operationId])).rowCount, 0);
  const invalidBatch = [...files(), fileInput(Buffer.from('x'))];
  await errorCode(await f.owner.client.post(f.collectionPath(await f.collection()), { files: invalidBatch }), 400);
  await errorCode(await f.owner.client.post(f.collectionPath(await f.collection()), { files: [first[0]] }), 400);
});

test('mídia: 20 autorizações por minuto têm quota própria e não derrubam a consulta', async t => {
  const f = await mediaFixture(t);
  const inputs = Array.from({ length: 10 }, () => fileInput(Buffer.from('x')));
  await f.reserve(f.owner, inputs);
  await f.reserve(f.owner, inputs);
  const extra = await f.owner.client.post(f.collectionPath(f.memory), { files: [fileInput(Buffer.from('x'))] });
  const body = await errorCode(extra, 429, 'rate_limited');
  assert.equal(typeof body.message, 'string');
  assert.ok(Number(extra.headers.get('Retry-After')) > 0);
  expectStatus(await f.owner.client.get(f.collectionPath(f.memory)), 200);
});

test('mídia: metadados inválidos, excesso, tipo e autoria são rejeitados antes do transporte', async t => {
  const f = await mediaFixture(t);
  const good = fileInput(Buffer.from('x'));
  for (const [patch, status] of [
    [{ byteLength: 10_000_001 }, 413], [{ mediaType: 'VIDEO', mimeType: 'video/mp4', byteLength: 100_000_001 }, 413],
    [{ mimeType: 'image/heic' }, 415], [{ mimeType: 'image/svg+xml' }, 415], [{ mimeType: 'image/gif' }, 415],
    [{ byteLength: 0 }, 400], [{ byteLength: 1.5 }, 400], [{ sha256: 'inventado' }, 400], [{ operationId: '../arquivo' }, 400],
    [{ path: '/objeto/arbitrario' }, 400],
  ]) await errorCode(await f.owner.client.post(f.collectionPath(f.memory), { files: [{ ...good, ...patch }] }), status);
  await errorCode(await f.owner.client.post(f.collectionPath(f.memory), { files: [good, good] }), 400);
  await errorCode(await f.owner.client.post(f.collectionPath(f.evidence), { files: [good] }), 404);
  await errorCode(await f.ana.client.post(f.collectionPath(f.memory), { files: [good] }), 404);
  await errorCode(await f.ana.client.post(f.collectionPath(f.evidence), {
    files: [{ ...good, operationId: randomUUID(), mediaType: 'VIDEO', mimeType: 'video/mp4' }],
  }), 415);
  const [asset] = await f.reserve(f.owner, [good]);
  await errorCode(await f.part(f.ana, asset.id, Buffer.from('x')), 404);
  await errorCode(await f.bia.client.post(`${f.assetPath(asset.id)}/concluir`, {}), 404);
});
