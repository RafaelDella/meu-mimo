import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { albumFixture, closeRuntime, fileInput } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('álbum, publicação e arquivos têm audiência do ticket sem ampliação administrativa', async t => {
  const f = await albumFixture(t); const [asset] = await f.ready();
  const publication = await f.publish([asset.id]);
  const outsider = await f.user();
  await f.database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [outsider.id]);
  for (const person of [f.bia, outsider]) {
    for (const path of [f.albumPath(), `${f.albumPath()}/operacoes/${publication.request.operationId}`,
      f.collectionPath(f.memory), f.assetPath(asset.id)]) await errorCode(await person.client.get(path), 404);
    await errorCode(await person.client.post(`${f.assetPath(asset.id)}/acesso`, { variant: 'thumbnail' }), 404);
  }
  for (const suffix of ['/iniciar', '/publicacoes']) await errorCode(await f.ana.client.post(f.albumPath() + suffix,
    suffix === '/iniciar' ? { operationId: randomUUID() } : f.body(await f.album(f.ana), [asset.id])), 404);
  await errorCode(await f.ana.client.post(`${f.assetPath(asset.id)}/remover`, {}), 404);
  await errorCode(await f.ana.client.get(`${f.albumPath()}/operacoes/${publication.request.operationId}`), 404);
  const dto = JSON.stringify(await f.album(f.ana));
  assert.doesNotMatch(dto, /sha256|outputVersion|leaseToken|serviceRoleKey|storage\/v1|originalName/);
});

test('sessão, CSRF e IDs trocados protegem início/publicação e operação em outra origem', async t => {
  const f = await albumFixture(t); const [asset] = await f.ready();
  const request = f.body(await f.album(), [asset.id]);
  await errorCode(await f.client().get(f.albumPath()), 401);
  await errorCode(await f.owner.client.post(`${f.albumPath()}/publicacoes`, request, { Origin: 'https://example.invalid' }), 403);
  await errorCode(await f.owner.client.post(`${f.albumPath()}/iniciar`, { operationId: randomUUID() }, { Origin: 'https://example.invalid' }), 403);
  const second = await f.collection();
  const wrong = await f.owner.client.post(`${f.albumPath(second)}/publicacoes`, f.body(await f.album(f.owner, second), [asset.id]));
  assert.ok([404, 409].includes(wrong.status));
  const publication = await f.publish([asset.id]);
  await errorCode(await f.owner.client.get(`${f.albumPath(second)}/operacoes/${publication.request.operationId}`), 404);
  await errorCode(await f.owner.client.post(`${f.albumPath(second)}/publicacoes`, publication.request), 409);
  assert.equal((await f.album(f.ana, second)).total, 0);
});

for (const security of ['revoked', 'suspended']) test(`${security} retira álbum, replay e URLs já emitidas inclusive Range`, async t => {
  const f = await albumFixture(t); const [asset] = await f.ready(); const publication = await f.publish([asset.id]);
  const grant = await f.access(f.ana, asset.id);
  if (security === 'revoked') await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  else await f.database.query('UPDATE app."Profile" SET "suspendedAt"=now() WHERE id=$1', [f.ana.id]);
  const expected = security === 'revoked' ? 404 : 403;
  await errorCode(await f.ana.client.get(f.albumPath()), expected);
  await errorCode(await f.ana.client.get(grant.url, { Range: 'bytes=0-15' }), expected);
  if (security === 'revoked') {
    await errorCode(await f.owner.client.get(f.albumPath()), 404);
    await errorCode(await f.owner.client.post(`${f.albumPath()}/publicacoes`, publication.request), 404);
  }
});

test('cancelamento preserva leitura e remoção própria e fecha reserva, partes e publicação', async t => {
  const f = await albumFixture(t); const [ready] = await f.ready(); await f.publish([ready.id]);
  const draft = await f.reserve(f.owner, [fileInput(Buffer.from('parte pendente'))]);
  await f.transition('CANCEL'); const before = await f.financial();
  const album = await f.album(); assert.equal(album.unavailableReason, 'CANCELLED');
  assert.equal(album.permissions.canUpload, false); assert.equal(album.items[0].canRemove, true);
  expectStatus(await f.ana.client.get((await f.access(f.ana, ready.id)).url), 200);
  await errorCode(await f.owner.client.post(f.collectionPath(f.memory), { files: [fileInput(Buffer.from('novo'))] }), 409);
  await errorCode(await f.part(f.owner, draft[0].id, Buffer.from('parte pendente')), 409);
  await errorCode(await f.owner.client.post(`${f.albumPath()}/publicacoes`, f.body(album, [draft[0].id])), 409);
  const grant = await f.access(f.ana, ready.id);
  expectStatus(await f.owner.client.post(`${f.assetPath(ready.id)}/remover`, {}), 200);
  await errorCode(await f.ana.client.get(grant.url), 404);
  assert.equal((await f.album(f.ana)).total, 0); assert.deepEqual(await f.financial(), before);
});
