import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { domainFixture } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

test('convite recupera o mesmo link e preview público contém somente a apresentação autorizada', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  expectStatus(await owner.client.patch('/api/perfil', { displayName: 'Pessoa que convida' }), 200);
  const store = await fixture.createDomainStore(owner, 'Um lugar privado');
  const invitation = await fixture.invite(owner, store);
  const repeat = await fixture.invite(owner, store, invitation.operationId);
  assert.equal(repeat.id, invitation.id);
  assert.equal(repeat.url, invitation.url);
  const response = await fixture.client().get(`/api/convites/${invitation.token}`);
  expectStatus(response, 200);
  const preview = await response.json();
  assert.deepEqual(preview, {
    status: 'PENDING',
    store: { id: store.id, name: store.name, presentation: store.presentation },
    inviter: { displayName: 'Pessoa que convida' },
  });
  assert.equal(JSON.stringify(preview).includes(owner.email), false);
  assert.equal(JSON.stringify(preview).includes(owner.id), false);
  const row = await fixture.database.query(
    'SELECT "tokenHash", "expiresAt", "createdAt" FROM app."Invitation" WHERE id = $1', [invitation.id]);
  assert.notEqual(row.rows[0].tokenHash, invitation.token);
  assert.equal(JSON.stringify(row.rows[0]).includes(invitation.token), false);
  const audits = await fixture.database.query('SELECT * FROM app."StoreAudit" WHERE "storeId" = $1', [store.id]);
  assert.equal(JSON.stringify(audits.rows).includes(invitation.token), false);
  const duration = row.rows[0].expiresAt.getTime() - row.rows[0].createdAt.getTime();
  assert.ok(Math.abs(duration - 7 * 24 * 60 * 60 * 1000) < 2000);
  const listing = await owner.client.get(`/api/lojas/${store.id}/convites`);
  expectStatus(listing, 200);
  const listed = await listing.json();
  assert.equal(listed.total, 1);
  assert.deepEqual(Object.keys(listed.items[0]).sort(), ['acceptedAt', 'expiresAt', 'id', 'revokedAt']);
  assert.equal(JSON.stringify(listed).includes(invitation.token), false);
  const otherStore = await fixture.createDomainStore(owner);
  await errorCode(await owner.client.post(`/api/lojas/${otherStore.id}/convites`, {
    operationId: invitation.operationId,
  }), 409, 'operation_conflict');
});

test('inválido, expirado e revogado têm estados explícitos e não criam vínculo', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const person = await fixture.user();
  const store = await fixture.createDomainStore(owner);
  await errorCode(await fixture.client().get(`/api/convites/${randomUUID()}`), 404, 'invitation_invalid');
  await errorCode(await person.client.post(`/api/convites/${randomUUID()}/aceitar`, {}), 404, 'invitation_invalid');
  const expired = await fixture.invite(owner, store);
  await fixture.database.query('UPDATE app."Invitation" SET "createdAt" = now() - interval \'8 days\', "expiresAt" = now() - interval \'1 second\' WHERE id = $1',
    [expired.id]);
  const expiration = await fixture.client().get(`/api/convites/${expired.token}`);
  expectStatus(expiration, 200);
  assert.equal((await expiration.json()).status, 'EXPIRED');
  await errorCode(await person.client.post(`/api/convites/${expired.token}/aceitar`, {}), 409, 'invitation_expired');
  const revoked = await fixture.invite(owner, store);
  const revocation = `/api/lojas/${store.id}/convites/${revoked.id}/revogar`;
  await errorCode(await person.client.post(revocation, {}), 404);
  expectStatus(await owner.client.post(revocation, {}), 200);
  expectStatus(await owner.client.post(revocation, {}), 200);
  const preview = await fixture.client().get(`/api/convites/${revoked.token}`);
  assert.equal((await preview.json()).status, 'REVOKED');
  await errorCode(await person.client.post(`/api/convites/${revoked.token}/aceitar`, {}), 409, 'invitation_revoked');
  const membership = await fixture.database.query(
    'SELECT id FROM app."Membership" WHERE "storeId" = $1 AND "profileId" = $2', [store.id, person.id]);
  assert.equal(membership.rowCount, 0);
});

test('pausa impede aceite e permite retomada; encerramento impede novas relações', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const person = await fixture.user();
  const store = await fixture.createDomainStore(owner);
  const invitation = await fixture.invite(owner, store);
  await fixture.state(owner, store, 'pause');
  const preview = await fixture.client().get(`/api/convites/${invitation.token}`);
  assert.equal((await preview.json()).status, 'PAUSED');
  await errorCode(await person.client.post(`/api/convites/${invitation.token}/aceitar`, {}), 409, 'store_paused');
  await fixture.state(owner, store, 'resume');
  await fixture.accept(person, invitation);
  const next = await fixture.invite(owner, store);
  await fixture.state(owner, store, 'close');
  const closed = await fixture.client().get(`/api/convites/${next.token}`);
  assert.equal((await closed.json()).status, 'CLOSED');
  const newcomer = await fixture.user();
  await errorCode(await newcomer.client.post(`/api/convites/${next.token}/aceitar`, {}), 409, 'store_closed');
});

test('aceite é explícito e único; repetição recupera a participação apenas da mesma conta', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const ana = await fixture.user();
  const bia = await fixture.user();
  const store = await fixture.createDomainStore(owner);
  const invitation = await fixture.invite(owner, store);
  await errorCode(await fixture.client().post(`/api/convites/${invitation.token}/aceitar`, {}), 401);
  await errorCode(await ana.client.get(`/api/lojas/${store.id}`), 404);
  const accepted = await fixture.accept(ana, invitation);
  assert.deepEqual(accepted, { storeId: store.id, membershipId: accepted.membershipId, role: 'PARTICIPANT' });
  assert.deepEqual(await fixture.accept(ana, invitation), accepted);
  const preview = await fixture.client().get(`/api/convites/${invitation.token}`);
  assert.equal((await preview.json()).status, 'ACCEPTED');
  await errorCode(await bia.client.post(`/api/convites/${invitation.token}/aceitar`, {}), 409, 'invitation_accepted');
  await errorCode(await bia.client.get(`/api/lojas/${store.id}`), 404);
  const counts = await fixture.database.query(
    'SELECT count(*)::int AS total FROM app."Membership" WHERE "storeId" = $1 AND role = \'PARTICIPANT\'', [store.id]);
  assert.equal(counts.rows[0].total, 1);
});

test('lojista e participante existente abrem a loja sem consumir convite ou duplicar papel', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const person = await fixture.user();
  const newcomer = await fixture.user();
  const store = await fixture.createDomainStore(owner);
  const ownerInvitation = await fixture.invite(owner, store);
  const merchant = await fixture.accept(owner, ownerInvitation);
  assert.equal(merchant.role, 'MERCHANT');
  assert.equal(merchant.membershipId, store.membershipId);
  const participant = await fixture.accept(person, ownerInvitation);
  const existingInvitation = await fixture.invite(owner, store);
  assert.deepEqual(await fixture.accept(person, existingInvitation), participant);
  const pending = await fixture.database.query('SELECT "acceptedAt" FROM app."Invitation" WHERE id = $1',
    [existingInvitation.id]);
  assert.equal(pending.rows[0].acceptedAt, null);
  await fixture.accept(newcomer, existingInvitation);
  const roles = await fixture.database.query(
    'SELECT role FROM app."Membership" WHERE "storeId" = $1 AND "profileId" = $2', [store.id, owner.id]);
  assert.deepEqual(roles.rows, [{ role: 'MERCHANT' }]);
});
