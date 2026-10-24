import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { domainFixture } from './helpers.mjs';
import { acceptCode, codeInvitation } from './code-helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { deriveInvitationCode, invitationCodeHash } from '../../../src/server/invitations/code.ts';

test('gestão cria códigos independentes, recupera operação e lista só metadados', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const store = await f.createDomainStore(owner);
  const first = await codeInvitation(owner, store);
  const second = await codeInvitation(owner, store, { expiration: { kind: 'NEVER' }, maxUses: null });
  assert.notEqual(first.code, second.code);
  assert.equal(second.expiresAt, null);
  assert.equal(second.maxUses, null);
  assert.match(first.code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);
  const repeated = await owner.client.post(`/api/lojas/${store.id}/convites`, first.request);
  expectStatus(repeated, 201);
  const again = await repeated.json();
  for (const field of ['id', 'code', 'url', 'expiresAt']) assert.equal(again[field], first[field]);
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/convites`, { ...first.request, maxUses: 2 }), 409, 'operation_conflict');
  const list = await owner.client.get(`/api/lojas/${store.id}/convites`);
  expectStatus(list, 200);
  for (const item of (await list.json()).items) {
    assert.deepEqual(Object.keys(item).sort(), ['id', 'kind', 'expiresAt', 'revokedAt', 'maxUses', 'useCount', 'status'].sort());
  }
  const reveal = await owner.client.get(`/api/lojas/${store.id}/convites/${first.id}/credencial`);
  expectStatus(reveal, 200);
  assert.deepEqual(await reveal.json(), { id: first.id, code: first.code, url: first.url });
  const person = await f.user();
  await acceptCode(person, first.code);
  await errorCode(await person.client.get(`/api/lojas/${store.id}/convites/${first.id}/credencial`), 404);
  const revoked = await owner.client.post(`/api/lojas/${store.id}/convites/${first.id}/revogar`, {});
  expectStatus(revoked, 200);
  assert.equal((await revoked.json()).status, 'REVOKED');
  expectStatus(await person.client.get(`/api/lojas/${store.id}`), 200);
  await f.state(owner, store, 'pause');
  expectStatus(await owner.client.post(`/api/lojas/${store.id}/convites/${second.id}/revogar`, {}), 200);
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/convites`, { ...second.request, operationId: randomUUID() }), 409, 'store_paused');
});

test('gestão rejeita política forjada, reutilização entre lojas e criação em papel alheio', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const outsider = await f.user();
  const store = await f.createDomainStore(owner);
  const other = await f.createDomainStore(owner);
  const invitation = await codeInvitation(owner, store);
  await errorCode(await owner.client.post(`/api/lojas/${other.id}/convites`, invitation.request), 409, 'operation_conflict');
  await errorCode(await outsider.client.post(`/api/lojas/${store.id}/convites`, invitation.request), 404);
  await errorCode(await outsider.client.get(`/api/lojas/${store.id}/convites/${invitation.id}/credencial`), 404);
  await errorCode(await owner.client.get(`/api/lojas/${other.id}/convites/${invitation.id}/credencial`), 404);
  for (const maxUses of [0, -1, 0.5, true, '2', 1_000_001]) {
    await errorCode(await owner.client.post(`/api/lojas/${store.id}/convites`, { ...invitation.request, operationId: randomUUID(), maxUses }), 400, 'field_invalid');
  }
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/convites`, { ...invitation.request, operationId: randomUUID(), code: 'CUSTOM12345' }), 400, 'field_invalid');
});

test('colisão tenta outro nonce sem alterar convite anterior e limita a cinco tentativas', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const store = await f.createDomainStore(owner);
  async function occupy(id, nonce) {
    const codeHash = invitationCodeHash(deriveInvitationCode(id, store.id, owner.id, nonce));
    const collisionId = randomUUID();
    await f.database.query(`INSERT INTO app."Invitation" (id,"storeId","createdByProfileId","tokenHash",kind,"codeHash","codeNonce","creationDigest","maxUses","expiresAt")
      VALUES ($1,$2,$3,$4,'CODE',$5,0,$6,NULL,NULL)`,
    [collisionId, store.id, owner.id, randomBytes(32).toString('hex'), codeHash, randomBytes(32).toString('hex')]);
    return collisionId;
  }
  const operationId = randomUUID();
  const collision = await occupy(operationId, 0);
  const result = await codeInvitation(owner, store, { operationId });
  assert.equal(result.code, deriveInvitationCode(operationId, store.id, owner.id, 1));
  const rows = await f.database.query('SELECT id,"codeNonce" FROM app."Invitation" WHERE id=ANY($1::uuid[])', [[collision, operationId]]);
  assert.equal(rows.rows.find(row => row.id === collision).codeNonce, 0);
  assert.equal(rows.rows.find(row => row.id === operationId).codeNonce, 1);
  const blocked = randomUUID();
  for (let nonce = 0; nonce < 5; nonce += 1) await occupy(blocked, nonce);
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/convites`, { ...result.request, operationId: blocked }), 503, 'invitation_generation_unavailable');
  assert.equal((await f.database.query('SELECT id FROM app."Invitation" WHERE id=$1', [blocked])).rowCount, 0);
});
