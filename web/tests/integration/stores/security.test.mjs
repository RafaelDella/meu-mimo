import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { domainFixture } from './helpers.mjs';
import { confirmationLink } from '../helpers/mail.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

test('convite anônimo retorna após cadastro/confirmação e login sem aceitar automaticamente',
  { timeout: 60_000 }, async t => {
    const fixture = await domainFixture(t);
    const owner = await fixture.user();
    const store = await fixture.createDomainStore(owner);
    const invitation = await fixture.invite(owner, store);
    const returnTo = `/convites/${invitation.token}`;
    const browser = fixture.client();
    const preview = await browser.get(`/api${returnTo}`);
    expectStatus(preview, 200);
    assert.equal((await preview.json()).status, 'PENDING');
    const email = fixture.newEmail();
    fixture.trackEmail(email);
    const password = `Convite!${randomUUID()}`;
    expectStatus(await browser.post('/api/auth/signup', { email, password, returnTo }), 202);
    const destination = await browser.followConfirmation(await confirmationLink(fixture.environment, email));
    assert.equal(new URL(destination.url).pathname, returnTo);
    const session = await browser.get('/api/auth/session');
    expectStatus(session, 200);
    const identity = await session.json();
    fixture.trackUser(identity.userId);
    const before = await fixture.database.query(
      'SELECT id FROM app."Membership" WHERE "storeId" = $1 AND "profileId" = $2', [store.id, identity.userId]);
    assert.equal(before.rowCount, 0, 'Autenticar não equivale a aceitar o convite.');
    expectStatus(await browser.post('/api/auth/logout', {}), 200);
    const login = await browser.post('/api/auth/login', { email, password, returnTo });
    expectStatus(login, 200);
    assert.equal((await login.json()).returnTo, returnTo);
    await errorCode(await browser.get(`/api/lojas/${store.id}`), 404);
    const accepted = await browser.post(`/api${returnTo}/aceitar`, {});
    expectStatus(accepted, 200);
    assert.equal((await accepted.json()).storeId, store.id);
    expectStatus(await browser.get(`/api/lojas/${store.id}`), 200);
  });

test('perfil é da conta atual; campos forjados não alteram identidade, suspensão ou administração', async t => {
  const fixture = await domainFixture(t);
  const ana = await fixture.user();
  const bia = await fixture.user();
  expectStatus(await ana.client.patch('/api/perfil', { displayName: 'Ana privada' }), 200);
  expectStatus(await bia.client.patch('/api/perfil', { displayName: 'Bia privada' }), 200);
  const forged = await ana.client.patch('/api/perfil', {
    displayName: 'Ana atualizada', id: bia.id, profileId: bia.id, role: 'ADMIN', suspendedAt: new Date().toISOString(),
  });
  assert.ok([200, 400].includes(forged.status), 'Campos extras podem ser rejeitados ou ignorados.');
  const own = await ana.client.get('/api/perfil');
  expectStatus(own, 200);
  assert.equal((await own.json()).id, ana.id);
  const other = await bia.client.get('/api/perfil');
  expectStatus(other, 200);
  assert.deepEqual(await other.json(), { id: bia.id, displayName: 'Bia privada', email: bia.email });
  const grants = await fixture.database.query(
    'SELECT "profileId" FROM app."AdminGrant" WHERE "profileId" = ANY($1::uuid[])', [[ana.id, bia.id]]);
  assert.equal(grants.rowCount, 0);
  const profiles = await fixture.database.query(
    'SELECT "suspendedAt" FROM app."Profile" WHERE id = ANY($1::uuid[])', [[ana.id, bia.id]]);
  assert.ok(profiles.rows.every(profile => profile.suspendedAt === null));
  await errorCode(await ana.client.patch('/api/perfil', { displayName: 'A'.repeat(81) }), 400);
});

test('origem, sessão e escopo prevalecem sobre papel e identificadores enviados pelo cliente', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const outsider = await fixture.user();
  const store = await fixture.createDomainStore(owner);
  const invitation = await fixture.invite(owner, store);
  await errorCode(await fixture.client().get('/api/lojas'), 401);
  await errorCode(await fixture.client().get('/api/perfil'), 401);
  const forbiddenOrigin = { Origin: 'https://example.invalid' };
  await errorCode(await owner.client.patch('/api/perfil', { displayName: 'Origem inválida' }, forbiddenOrigin), 403);
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/estado`, { action: 'close' }, forbiddenOrigin), 403);
  await errorCode(await outsider.client.post(`/api/convites/${invitation.token}/aceitar`, {}, forbiddenOrigin), 403);
  const forgedHeaders = { 'X-Role': 'MERCHANT', 'X-User-Id': owner.id };
  await errorCode(await outsider.client.patch(`/api/lojas/${store.id}`, {
    name: 'Tomada',
  }, forgedHeaders), 404);
  await errorCode(await outsider.client.get(`/api/lojas/${store.id}/convites`, forgedHeaders), 404);
  await errorCode(await outsider.client.post(`/api/lojas/${store.id}/convites/${invitation.id}/revogar`, {}, forgedHeaders), 404);
  await errorCode(await outsider.client.get('/api/admin/session', forgedHeaders), 403);
  const current = await owner.client.get(`/api/lojas/${store.id}`);
  assert.equal((await current.json()).name, store.name);
});

test('dois participantes não acessam nome ou relação alheia; revogação continua negando leitura', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const ana = await fixture.user();
  const bia = await fixture.user();
  const store = await fixture.createDomainStore(owner);
  const first = await fixture.accept(ana, await fixture.invite(owner, store));
  const second = await fixture.accept(bia, await fixture.invite(owner, store));
  const own = await ana.client.get(`/api/lojas/${store.id}/participacoes/${first.membershipId}`);
  expectStatus(own, 200);
  const data = await own.json();
  assert.equal(data.profileId, ana.id);
  assert.equal('email' in data.profile, false);
  await errorCode(await ana.client.get(`/api/lojas/${store.id}/participacoes/${second.membershipId}`), 404);
  await errorCode(await ana.client.get(`/api/lojas/${store.id}/participacoes`), 404);
  await errorCode(await ana.client.get(`/api/lojas/${store.id}/convites`), 404);
  await fixture.database.query('UPDATE app."Membership" SET "accessRevokedAt" = now() WHERE id = $1', [first.membershipId]);
  await errorCode(await ana.client.get(`/api/lojas/${store.id}`), 404);
  await errorCode(await ana.client.get(`/api/lojas/${store.id}/participacoes/${first.membershipId}`), 404);
  expectStatus(await bia.client.get(`/api/lojas/${store.id}`), 200);
});
