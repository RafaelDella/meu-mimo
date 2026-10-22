import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { domainFixture } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

test('criação é atômica e repetível; operationId não aceita outro pedido ou autor', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const other = await fixture.user();
  const store = await fixture.createDomainStore(owner, 'Minha loja');
  assert.equal(store.role, 'MERCHANT');
  assert.equal(store.state, 'ACTIVE');
  const repeat = await owner.client.post('/api/lojas', store.request);
  expectStatus(repeat, 201);
  assert.equal((await repeat.json()).id, store.id);
  await errorCode(await owner.client.post('/api/lojas', { ...store.request, name: 'Outro pedido' }),
    409, 'operation_conflict');
  await errorCode(await other.client.post('/api/lojas', store.request), 409, 'operation_conflict');
  const rows = await fixture.database.query(
    'SELECT "profileId", role FROM app."Membership" WHERE "storeId" = $1', [store.id]);
  assert.deepEqual(rows.rows, [{ profileId: owner.id, role: 'MERCHANT' }]);
  await assert.rejects(fixture.addMembership(store, other, 'MERCHANT'), { code: '23505' });
  await assert.rejects(fixture.addMembership(store, owner, 'PARTICIPANT'), { code: '23505' });
  const count = await fixture.database.query(
    'SELECT count(*)::int AS total FROM app."Store" WHERE "operationId" = $1', [store.request.operationId]);
  assert.equal(count.rows[0].total, 1);
});

test('uma conta gerencia várias lojas e participa de duas sem misturar papéis', async t => {
  const fixture = await domainFixture(t);
  const person = await fixture.user();
  const owner = await fixture.user();
  const owned = await fixture.createDomainStore(person, 'Meu cantinho');
  const secondOwned = await fixture.createDomainStore(person, 'Meu outro cantinho');
  const first = await fixture.createDomainStore(owner, 'Convite A');
  const second = await fixture.createDomainStore(owner, 'Convite B');
  await fixture.accept(person, await fixture.invite(owner, first));
  await fixture.accept(person, await fixture.invite(owner, second));
  for (const [role, expected] of [
    ['MERCHANT', [owned.id, secondOwned.id]], ['PARTICIPANT', [first.id, second.id]],
  ]) {
    const response = await person.client.get(`/api/lojas?role=${role}&state=ALL`);
    expectStatus(response, 200);
    const page = await response.json();
    assert.deepEqual(page.items.map(item => item.id).sort(), expected.sort());
    assert.ok(page.items.every(item => item.role === role));
    assert.equal(page.total, 2);
    assert.equal(page.page, 1);
    assert.equal(page.pageSize, 20);
  }
});

test('busca e paginação estáveis retornam somente lojas e pessoas autorizadas', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const outsider = await fixture.user();
  const stores = [];
  for (const name of ['Busca A', 'Busca B', 'Busca C']) stores.push(await fixture.createDomainStore(owner, name));
  await fixture.createDomainStore(outsider, 'Busca privada');
  const ids = [];
  for (const pageNumber of [1, 2, 3]) {
    const response = await owner.client.get(`/api/lojas?role=MERCHANT&q=Busca&page=${pageNumber}&pageSize=1`);
    expectStatus(response, 200);
    const page = await response.json();
    assert.equal(page.total, 3);
    assert.equal(page.items.length, 1);
    assert.equal(page.page, pageNumber);
    assert.equal(page.pageSize, 1);
    ids.push(page.items[0].id);
  }
  assert.deepEqual([...ids].sort(), stores.map(store => store.id).sort());
  assert.equal(new Set(ids).size, 3);
  const repeat = await owner.client.get('/api/lojas?role=MERCHANT&q=Busca&page=1&pageSize=1');
  assert.equal((await repeat.json()).items[0].id, ids[0]);
  const ana = await fixture.user();
  const bia = await fixture.user();
  expectStatus(await ana.client.patch('/api/perfil', { displayName: 'Ana de teste' }), 200);
  expectStatus(await bia.client.patch('/api/perfil', { displayName: 'Bia de teste' }), 200);
  await fixture.accept(ana, await fixture.invite(owner, stores[0]));
  await fixture.accept(bia, await fixture.invite(owner, stores[0]));
  const people = await owner.client.get(`/api/lojas/${stores[0].id}/participacoes?q=Ana&pageSize=1`);
  expectStatus(people, 200);
  const result = await people.json();
  assert.equal(result.total, 1);
  assert.equal(result.items[0].profileId, ana.id);
  await errorCode(await ana.client.get(`/api/lojas/${stores[0].id}/participacoes`), 404);
  for (const query of ['page=0', 'page=-1', 'pageSize=51', 'pageSize=0', 'role=ADMIN', 'state=OTHER']) {
    await errorCode(await owner.client.get(`/api/lojas?${query}`), 400);
  }
});

test('participante e lojista encerram a relação preservando leitura privada', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const ana = await fixture.user();
  const bia = await fixture.user();
  const store = await fixture.createDomainStore(owner);
  const membership = await fixture.accept(ana, await fixture.invite(owner, store));
  const biaMembership = await fixture.accept(bia, await fixture.invite(owner, store));
  const closure = `/api/lojas/${store.id}/participacoes/${membership.membershipId}/encerrar`;
  await errorCode(await bia.client.post(closure, {}), 404);
  const closed = await ana.client.post(closure, {});
  expectStatus(closed, 200);
  assert.ok((await closed.json()).closedAt);
  expectStatus(await ana.client.post(closure, {}), 200);
  const historic = await ana.client.get(`/api/lojas/${store.id}`);
  expectStatus(historic, 200);
  assert.ok((await historic.json()).membershipClosedAt);
  await errorCode(await ana.client.get(`/api/lojas/${store.id}/participacoes/${biaMembership.membershipId}`), 404);
  const newInvite = await fixture.invite(owner, store);
  await errorCode(await ana.client.post(`/api/convites/${newInvite.token}/aceitar`, {}), 409, 'membership_closed');
  const ownerClosure = await owner.client.post(
    `/api/lojas/${store.id}/participacoes/${biaMembership.membershipId}/encerrar`, {});
  expectStatus(ownerClosure, 200);
  const rows = await fixture.database.query(
    'SELECT "closedAt", "accessRevokedAt" FROM app."Membership" WHERE id = $1', [membership.membershipId]);
  assert.ok(rows.rows[0].closedAt);
  assert.equal(rows.rows[0].accessRevokedAt, null);
  const active = await ana.client.get('/api/lojas?role=PARTICIPANT&state=ACTIVE');
  assert.equal((await active.json()).items.length, 0);
  const history = await ana.client.get('/api/lojas?role=PARTICIPANT&state=CLOSED');
  assert.equal((await history.json()).items[0].id, store.id);
});

test('pausa e encerramento de loja valem na API; o histórico continua autorizado', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const person = await fixture.user();
  const store = await fixture.createDomainStore(owner);
  await fixture.accept(person, await fixture.invite(owner, store));
  await errorCode(await person.client.post(`/api/lojas/${store.id}/estado`, { action: 'close' }), 404);
  assert.equal((await fixture.state(owner, store, 'pause')).state, 'PAUSED');
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/convites`, { operationId: randomUUID() }),
    409, 'store_paused');
  expectStatus(await person.client.get(`/api/lojas/${store.id}`), 200);
  assert.equal((await fixture.state(owner, store, 'resume')).state, 'ACTIVE');
  assert.equal((await fixture.state(owner, store, 'close')).state, 'CLOSED');
  expectStatus(await person.client.get(`/api/lojas/${store.id}`), 200);
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/estado`, { action: 'resume' }), 409, 'store_closed');
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/convites`, { operationId: randomUUID() }),
    409, 'store_closed');
  const listing = await owner.client.get('/api/lojas?role=MERCHANT&state=CLOSED');
  assert.equal((await listing.json()).items[0].id, store.id);
});

test('limites de texto e fuso são reais; marcador protege o fuso sem inventar pendências', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const store = await fixture.createDomainStore(owner, 'N'.repeat(80), { presentation: 'P'.repeat(280) });
  for (const body of [{ name: 'N'.repeat(81) }, { presentation: 'P'.repeat(281) }, { timezone: 'Fuso/Inexistente' }]) {
    await errorCode(await owner.client.patch(`/api/lojas/${store.id}`, body), 400, 'field_invalid');
  }
  const changed = await owner.client.patch(`/api/lojas/${store.id}`, { timezone: 'Europe/Lisbon' });
  expectStatus(changed, 200);
  assert.equal((await changed.json()).timezone, 'Europe/Lisbon');
  // O marcador é preparação de T04; não simula a existência de registros ou tickets.
  await fixture.database.query('UPDATE app."Store" SET "domainStartedAt" = now() WHERE id = $1', [store.id]);
  await errorCode(await owner.client.patch(`/api/lojas/${store.id}`, { timezone: 'America/Sao_Paulo' }),
    409, 'timezone_locked');
  // T07 consulta registros reais; marcador sem pendência não impede encerramento.
  expectStatus(await owner.client.post(`/api/lojas/${store.id}/estado`, { action: 'close' }), 200);
});
