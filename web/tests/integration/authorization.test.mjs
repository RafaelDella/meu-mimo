import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './helpers/fixtures.mjs';
import { errorCode, expectStatus } from './helpers/http-client.mjs';

test('participante só lê sua relação; lojista lê as relações de sua própria loja', async t => {
  const fixture = await createFixture(t);
  const merchant = await fixture.login(await fixture.createUser());
  const ana = await fixture.login(await fixture.createUser());
  const bia = await fixture.login(await fixture.createUser());
  const outsider = await fixture.login(await fixture.createUser());
  const store = await fixture.createStore(merchant, 'Loja A');
  await fixture.addMembership(store, merchant, 'MERCHANT');
  const anaMembership = await fixture.addMembership(store, ana);
  const biaMembership = await fixture.addMembership(store, bia);
  const otherStore = await fixture.createStore(outsider, 'Loja B');
  const otherMembership = await fixture.addMembership(otherStore, outsider);

  const storeResponse = await ana.client.get(`/api/lojas/${store.id}`);
  expectStatus(storeResponse, 200);
  assert.deepEqual(await storeResponse.json(), {
    id: store.id, name: store.name, role: 'PARTICIPANT', presentation: '', timezone: 'America/Sao_Paulo',
    state: 'ACTIVE', membershipId: anaMembership.id, membershipClosedAt: null,
  });
  const own = await ana.client.get(`/api/lojas/${store.id}/participacoes/${anaMembership.id}`);
  expectStatus(own, 200);
  const ownData = await own.json();
  assert.equal(ownData.id, anaMembership.id);
  assert.equal(ownData.profileId, ana.id);
  assert.equal('email' in ownData.profile, false);
  await errorCode(await ana.client.get(`/api/lojas/${store.id}/participacoes/${biaMembership.id}`), 404);
  await errorCode(await ana.client.get(`/api/lojas/${store.id}/participacoes`), 404);
  await errorCode(await ana.client.get(`/api/lojas/${otherStore.id}`), 404);
  await errorCode(await merchant.client.get(`/api/lojas/${store.id}/participacoes/${otherMembership.id}`), 404);

  const listing = await merchant.client.get(`/api/lojas/${store.id}/participacoes`);
  expectStatus(listing, 200);
  const { items: memberships } = await listing.json();
  assert.deepEqual(memberships.map(item => item.profileId).sort(), [ana.id, bia.id].sort());
  assert.ok(memberships.every(item => item.storeId === store.id && !('email' in item.profile)));
});

test('autoria e papel enviado pelo navegador não concedem permissão de lojista', async t => {
  const fixture = await createFixture(t);
  const user = await fixture.login(await fixture.createUser());
  const other = await fixture.login(await fixture.createUser());
  const store = await fixture.createStore(user);
  const otherMembership = await fixture.addMembership(store, other);
  await errorCode(await user.client.get(`/api/lojas/${store.id}`), 404);
  const ownMembership = await fixture.addMembership(store, user);
  await errorCode(await user.client.get(
    `/api/lojas/${store.id}/participacoes/${otherMembership.id}?role=MERCHANT&profileId=${other.id}`,
    { 'X-Role': 'MERCHANT', 'X-User-Id': other.id },
  ), 404);
  const own = await user.client.get(`/api/lojas/${store.id}/participacoes/${ownMembership.id}`);
  expectStatus(own, 200);
  assert.equal((await own.json()).profileId, user.id);
});

test('revogação de participação é aplicada sem reutilizar autorização em cache', async t => {
  const fixture = await createFixture(t);
  const merchant = await fixture.login(await fixture.createUser());
  const participant = await fixture.login(await fixture.createUser());
  const store = await fixture.createStore(merchant);
  const membership = await fixture.addMembership(store, participant);
  expectStatus(await participant.client.get(`/api/lojas/${store.id}`), 200);
  await fixture.database.query('UPDATE app."Membership" SET "accessRevokedAt" = now() WHERE id = $1', [membership.id]);
  await errorCode(await participant.client.get(`/api/lojas/${store.id}`), 404);
  await errorCode(await participant.client.get(`/api/lojas/${store.id}/participacoes/${membership.id}`), 404);
});

test('Data API não expõe tabelas de negócio a credenciais anônimas nem autenticadas', async t => {
  const fixture = await createFixture(t);
  const user = await fixture.login(await fixture.createUser());
  const session = user.client.storedSession();
  const settings = await fetch(`${fixture.environment.supabaseURL}/auth/v1/settings`, {
    headers: { apikey: fixture.environment.publishableKey }, signal: AbortSignal.timeout(10_000),
  });
  assert.equal(settings.status, 200, 'A prova anônima exige uma chave pública válida.');
  const authenticated = await fetch(`${fixture.environment.supabaseURL}/auth/v1/user`, {
    headers: { apikey: fixture.environment.publishableKey, Authorization: `Bearer ${session.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(authenticated.status, 200, 'O token autenticado deve ser válido antes de provar o isolamento.');
  for (const token of [null, session.access_token]) {
    for (const profileHeader of [undefined, 'app']) {
      const headers = { apikey: fixture.environment.publishableKey };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (profileHeader) headers['Accept-Profile'] = profileHeader;
      const response = await fetch(`${fixture.environment.supabaseURL}/rest/v1/Profile?select=*`, {
        headers, signal: AbortSignal.timeout(10_000),
      });
      assert.ok([401, 403, 404, 406].includes(response.status),
        `A Data API não pode expor Profile; recebeu ${response.status}.`);
    }
  }
});
