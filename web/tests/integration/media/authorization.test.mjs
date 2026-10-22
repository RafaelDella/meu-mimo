import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mediaFixture, closeRuntime, fileInput, fixtureBytes, processBatch } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { registerMediaCollection, nextEvidenceRevision } from '../../../src/server/media/registration.ts';
import { withStoreTransaction } from '../../../src/server/stores/transaction.ts';

after(closeRuntime);

test('mídia: só a origem interna registra coleção, sem trocar loja ou participante', async t => {
  const f = await mediaFixture(t);
  const currentIdentity = await f.identity(f.owner);
  const input = { purpose: 'MEMORY', subjectId: f.memory.subjectId, participantMembershipId: f.participation.id };
  const existing = await withStoreTransaction(currentIdentity, f.store.id, scope => registerMediaCollection(scope, input));
  assert.equal(existing.id, f.memory.id);
  await assert.rejects(withStoreTransaction(currentIdentity, f.store.id, scope => registerMediaCollection(scope,
    { ...input, participantMembershipId: f.otherParticipation.id })));
  const outsider = await f.user();
  const another = await f.createStore(outsider); await f.addMembership(another, outsider, 'MERCHANT');
  const otherMember = await f.addMembership(another, f.ana);
  await assert.rejects(withStoreTransaction(await f.identity(outsider), another.id, scope => registerMediaCollection(scope,
    { ...input, participantMembershipId: otherMember.id })));
  assert.equal((await f.owner.client.post(`/api/lojas/${f.store.id}/midia`, input)).status, 404);
  await errorCode(await f.owner.client.post(`/api/lojas/${f.store.id}/midia/${randomUUID()}`, { files: [fileInput(Buffer.from('x'))] }), 404);
});

test('mídia: rascunho é do autor; publicação libera somente a relação e admin não amplia audiência', async t => {
  const f = await mediaFixture(t);
  const item = await f.upload(f.ana, await fixtureBytes('photo.png'), 'image/png', f.evidence);
  await processBatch();
  expectStatus(await f.ana.client.get(f.assetPath(item.id)), 200);
  await errorCode(await f.owner.client.get(f.assetPath(item.id)), 404);
  await errorCode(await f.owner.client.post(`${f.assetPath(item.id)}/acesso`, { variant: 'display' }), 404);
  const list = await f.owner.client.get(f.collectionPath(f.evidence)); expectStatus(list, 200);
  assert.equal((await list.json()).items.length, 0);
  await f.publish(f.ana, f.evidence, [item.id]);
  expectStatus(await f.owner.client.get(f.assetPath(item.id)), 200);
  expectStatus(await f.owner.client.post(`${f.assetPath(item.id)}/acesso`, { variant: 'thumbnail' }), 200);
  await errorCode(await f.bia.client.get(f.assetPath(item.id)), 404);
  await errorCode(await f.bia.client.get(f.collectionPath(f.evidence)), 404);
  const outsider = await f.user();
  await f.database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [outsider.id]);
  await errorCode(await outsider.client.get(f.assetPath(item.id)), 404);
  const another = await f.createStore(outsider); await f.addMembership(another, outsider, 'MERCHANT');
  await errorCode(await outsider.client.get(f.assetPath(item.id, another)), 404);
  const dto = await f.asset(f.ana, item.id);
  for (const secret of ['sha256', 'authorProfileId', 'outputVersion', 'leaseToken', 'path', 'url', 'serviceRoleKey']) assert.equal(secret in dto, false);
});

test('mídia: sessão, origem, suspensão e revogação são atuais em reserva e transporte', async t => {
  const f = await mediaFixture(t);
  const bytes = Buffer.from('arquivo de fixture ainda não decodificado');
  const input = fileInput(bytes);
  await errorCode(await f.client().post(f.collectionPath(f.evidence), { files: [input] }), 401);
  await errorCode(await f.ana.client.post(f.collectionPath(f.evidence), { files: [input] }, { Origin: 'https://example.invalid' }), 403);
  const [item] = await f.reserve(f.ana, [input], f.evidence);
  await errorCode(await f.part(f.ana, item.id, bytes, 0, { Origin: 'https://example.invalid' }), 403);
  await f.database.query('UPDATE app."Profile" SET "suspendedAt" = now() WHERE id = $1', [f.ana.id]);
  await errorCode(await f.part(f.ana, item.id, bytes), 403);
  await errorCode(await f.ana.client.get(f.assetPath(item.id)), 403);
  await f.database.query('UPDATE app."Profile" SET "suspendedAt" = NULL WHERE id = $1', [f.ana.id]);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt" = now() WHERE id = $1', [f.participation.id]);
  await errorCode(await f.part(f.ana, item.id, bytes), 404);
  await errorCode(await f.owner.client.get(f.collectionPath(f.evidence)), 404);
  assert.equal((await f.database.query('SELECT "uploadedBytes" FROM app."MediaAsset" WHERE id = $1', [item.id])).rows[0].uploadedBytes, 0);
});

test('mídia: pausa fecha evidência; ticket preservado mantém só a permissão explícita da origem', async t => {
  const f = await mediaFixture(t);
  await f.database.query('UPDATE app."Store" SET state = \'PAUSED\', "pausedAt" = now() WHERE id = $1', [f.store.id]);
  await errorCode(await f.ana.client.post(f.collectionPath(f.evidence), { files: [fileInput(Buffer.from('a'))] }), 409);
  const [memory] = await f.reserve(f.owner, [fileInput(Buffer.from('a'))]);
  assert.equal(memory.state, 'UPLOADING');
  await f.database.query('UPDATE app."Store" SET state = \'CLOSED\', "closedAt" = now() WHERE id = $1', [f.store.id]);
  await f.database.query('UPDATE app."Membership" SET "closedAt" = now() WHERE id = $1', [f.participation.id]);
  expectStatus(await f.owner.client.get(f.collectionPath(f.memory)), 200);
  const [preserved] = await f.reserve(f.owner, [fileInput(Buffer.from('b'))]);
  await f.database.query('UPDATE app."MediaCollection" SET "uploadsClosedAt" = now() WHERE id = $1', [f.memory.id]);
  await errorCode(await f.part(f.owner, preserved.id, Buffer.from('b')), 409);
  await errorCode(await f.owner.client.post(f.collectionPath(f.memory), { files: [fileInput(Buffer.from('c'))] }), 409);
});

test('mídia: nova versão de evidência preserva foto histórica sem reabrir origem pela API', async t => {
  const f = await mediaFixture(t);
  const first = await f.upload(f.ana, await fixtureBytes('photo.png'), 'image/png', f.evidence);
  await processBatch(); await f.publish(f.ana, f.evidence, [first.id]);
  const secondInput = fileInput(await fixtureBytes('photo.webp'), 'image/webp');
  await errorCode(await f.ana.client.post(f.collectionPath(f.evidence), { files: [secondInput] }), 409);
  const next = await withStoreTransaction(await f.identity(f.owner), f.store.id, scope => nextEvidenceRevision(scope, f.evidence.id));
  assert.equal(next.revision, 2);
  const second = await f.upload(f.ana, await fixtureBytes('photo.webp'), 'image/webp', f.evidence);
  assert.equal(second.revision, 2);
  assert.equal((await f.asset(f.ana, first.id)).revision, 1);
  const history = await f.ana.client.get(f.collectionPath(f.evidence)); expectStatus(history, 200);
  assert.deepEqual((await history.json()).items.map(asset => asset.revision), [2, 1]);
  expectStatus(await f.owner.client.get(f.assetPath(first.id)), 200);
  await errorCode(await f.owner.client.get(f.assetPath(second.id)), 404);
  await errorCode(await f.ana.client.post(f.collectionPath(f.evidence), { files: [secondInput], revision: 3 }), 400);
});
