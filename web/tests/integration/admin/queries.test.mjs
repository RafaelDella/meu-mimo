import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

const forbidden = new Set(['email', 'password', 'balance', 'available', 'points', 'caption', 'note', 'text',
  'comments', 'reactions', 'media', 'assetId', 'url', 'code', 'snapshot', 'agreement', 'requestDigest', 'sessionId']);
function metadataOnly(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) { assert.ok(!forbidden.has(key), `Campo privado proibido: ${key}`); metadataOnly(item); }
}

test('listas de contas e lojas usam busca paginação50 estável e contagens disjuntas', { timeout: 150_000 }, async t => {
  const f = await adminFixture(t); const marker = `T13-${randomUUID()}`;
  const people = []; const stores = [];
  for (let i = 0; i < 53; i++) {
    const person = await f.createUser(); people.push(person);
    await f.database.query('INSERT INTO app."Profile" (id,"displayName") VALUES ($1,$2)', [person.id, `${marker} pessoa ${i}`]);
    const store = await f.createStore(person, `${marker} loja ${i}`); stores.push(store);
    await f.addMembership(store, person, 'MERCHANT');
  }
  const opened = await f.addMembership(stores[0], f.target);
  const closed = await f.addMembership(stores[1], f.target);
  const revoked = await f.addMembership(stores[2], f.target);
  await f.database.query('UPDATE app."Membership" SET "closedAt"=now() WHERE id=ANY($1::uuid[])', [[closed.id, revoked.id]]);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [revoked.id]);
  for (const resource of ['contas', 'lojas']) {
    const first = await f.adminRead(`/api/admin/${resource}/consulta`, { q: marker, pageSize: 50 });
    const second = await f.adminRead(`/api/admin/${resource}/consulta`, { q: marker, pageSize: 50, page: 2 });
    assert.equal(first.total, 53); assert.equal(first.items.length, 50); assert.equal(second.items.length, 3);
    assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 53);
    assert.deepEqual((await f.adminRead(`/api/admin/${resource}/consulta`, { q: marker, pageSize: 50 })).items, first.items);
    metadataOnly(first); metadataOnly(second);
  }
  const exact = await f.adminRead('/api/admin/contas/consulta', { q: people[0].id.toUpperCase() });
  assert.deepEqual(exact.items.map(person => person.id), [people[0].id]);
  const store = await f.adminRead(`/api/admin/lojas/${stores[0].id}`);
  assert.deepEqual(store.participants, { open: 1, closed: 0, revoked: 0 });
  const account = await f.adminRead(`/api/admin/contas/${f.target.id}`);
  assert.deepEqual(account.participations, { open: 2, closed: 1, revoked: 1 });
  const relations = await f.adminRead(`/api/admin/contas/${f.target.id}/vinculos/consulta`, { pageSize: 20 });
  assert.equal(relations.total, 4); assert.ok(relations.items.some(item => item.id === opened.id)); metadataOnly(relations);
});

test('filtros independentes não incluem conteúdo privado e janela usa instantes UTC do banco', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); await f.send(f.privateMarker);
  const thread = await f.thread(); await f.comment(thread, f.privateMarker);
  await f.createReward({ note: f.privateMarker, description: f.privateMarker });
  await f.action({ type: 'ACCOUNT', id: f.target.id }, 'BLOCK_ACCOUNT');
  await f.action({ type: 'STORE', id: f.store.id }, 'PAUSE_STORE');
  const account = await f.adminRead(`/api/admin/contas/${f.target.id}`); assert.ok(account.suspendedAt);
  const blocked = await f.adminRead('/api/admin/contas/consulta', { id: f.target.id, security: 'BLOCKED' });
  assert.equal(blocked.total, 1);
  assert.equal((await f.adminRead('/api/admin/contas/consulta', { id: f.target.id, security: 'ACTIVE' })).total, 0);
  const paused = await f.adminRead('/api/admin/lojas/consulta', { id: f.store.id, state: 'ACTIVE', platformPaused: true });
  assert.equal(paused.total, 1); assert.equal(paused.items[0].state, 'ACTIVE');
  const overview = await f.adminRead('/api/admin/resumo');
  const rows = (await f.database.query(`SELECT
    (SELECT count(*)::int FROM app."Profile" WHERE "createdAt">=$1 AND "createdAt"<$2) accounts,
    (SELECT count(*)::int FROM app."Store" WHERE "createdAt">=$1 AND "createdAt"<$2) stores,
    (SELECT count(*)::int FROM app."AdminAction" WHERE "createdAt">=$1 AND "createdAt"<$2) actions`,
  [overview.window.from, overview.window.to])).rows[0];
  assert.deepEqual(overview.recent, { accountsCreated: rows.accounts, storesCreated: rows.stores, actions: rows.actions });
  for (const value of [account, blocked, paused, overview]) {
    metadataOnly(value);
    assert.ok(!JSON.stringify(value).includes(f.privateMarker));
    assert.ok(!JSON.stringify(value).includes(f.target.email));
  }
});

test('consultas rejeitam campos extras filtros incompatíveis e limites Unicode sem vazar valores', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t);
  for (const resource of ['contas', 'lojas']) {
    expectStatus(await f.admin.client.post(`/api/admin/${resource}/consulta`, { q: '🌷'.repeat(80) }), 200);
    for (const body of [{ q: '🌷'.repeat(81) }, { q: '\ud800' }, { page: 0 }, { page: 1.5 }, { pageSize: 51 },
      { id: 'inválido' }, { actorId: f.admin.id }, { [resource === 'contas' ? 'state' : 'security']: 'ACTIVE' }]) {
      const result = await errorCode(await f.admin.client.post(`/api/admin/${resource}/consulta`, body), 400);
      assert.ok(!JSON.stringify(result).includes(f.admin.id));
    }
  }
  await errorCode(await f.admin.client.get(`/api/admin/contas/${randomUUID()}`), 404);
  await errorCode(await f.admin.client.get(`/api/admin/lojas/${randomUUID()}`), 404);
  for (const path of ['/api/admin/contas/consulta', '/api/admin/lojas/consulta', '/api/admin/historico/consulta']) {
    await errorCode(await f.admin.client.post(path, {}, { Origin: 'https://example.test' }), 403);
    await errorCode(await f.admin.client.request(path, { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } }), 415);
  }
});
