import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

function requests(f, person) {
  const operationId = randomUUID();
  const target = { type: 'STORE', id: f.store.id };
  return [
    () => person.client.get('/api/admin/session'), () => person.client.get('/api/admin/resumo'),
    () => person.client.post('/api/admin/contas/consulta', {}),
    () => person.client.get(`/api/admin/contas/${f.target.id}`),
    () => person.client.post(`/api/admin/contas/${f.target.id}/vinculos/consulta`, {}),
    () => person.client.post('/api/admin/lojas/consulta', {}),
    () => person.client.get(`/api/admin/lojas/${f.store.id}`),
    () => person.client.post('/api/admin/historico/consulta', { target }),
    () => person.client.post('/api/admin/acoes', { operationId, target, action: 'PAUSE_STORE', expectedVersion: 0, reason: 'Motivo fictício.' }),
    () => person.client.get(`/api/admin/operacoes/${operationId}`),
  ];
}

test('admin AAL2 consulta resumo de metadados com intervalo UTC real', { timeout: 45_000 }, async t => {
  const f = await adminFixture(t);
  const result = await f.adminRead('/api/admin/resumo');
  assert.equal(result.window.timezone, 'UTC');
  assert.equal(Date.parse(result.window.to) - Date.parse(result.window.from), 7 * 24 * 60 * 60 * 1000);
  assert.ok(result.accounts.active >= 4); assert.ok(result.stores.active >= 1);
  assert.deepEqual(Object.keys(result).sort(), ['accounts', 'recent', 'stores', 'window']);
});

test('cada fonte administrativa exige sessão grant e AAL2, sem promoção por perfil', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t);
  for (const request of requests(f, { client: f.client() })) await errorCode(await request(), 401);
  for (const request of requests(f, f.target)) await errorCode(await request(), 403, 'admin_forbidden');
  await f.grant(f.bia);
  for (const request of requests(f, f.bia)) await errorCode(await request(), 403, 'mfa_required');
  await f.mfa(f.owner);
  for (const request of requests(f, f.owner)) await errorCode(await request(), 403, 'admin_forbidden');
  expectStatus(await f.target.client.patch('/api/perfil', { displayName: 'Pessoa comum', isAdmin: true }), 400);
  assert.equal((await f.database.query('SELECT count(*)::int AS n FROM app."AdminGrant" WHERE "profileId"=$1', [f.target.id])).rows[0].n, 0);
});

test('revogação recuperação e suspensão retiram também consultas e lookup existentes', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t);
  await f.database.query('UPDATE app."AdminGrant" SET "revokedAt"=now() WHERE "profileId"=$1', [f.admin.id]);
  for (const request of requests(f, f.admin)) await errorCode(await request(), 403, 'admin_forbidden');
  await f.grant(f.admin);
  const sessionId = f.admin.client.storedSession().access_token;
  const claims = JSON.parse(Buffer.from(sessionId.split('.')[1], 'base64url').toString());
  await f.database.query('UPDATE app."AuthSession" SET recovery=true WHERE id=$1', [claims.session_id]);
  for (const request of requests(f, f.admin)) await errorCode(await request(), 403, 'recovery_required');
  await f.database.query('UPDATE app."AuthSession" SET recovery=false WHERE id=$1', [claims.session_id]);
  await f.database.query('UPDATE app."Profile" SET "suspendedAt"=now() WHERE id=$1', [f.admin.id]);
  for (const request of requests(f, f.admin)) await errorCode(await request(), 403, 'account_suspended');
});

test('admin sem vínculo conserva negação nas origens privadas normais', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t);
  await f.credit(); const reward = await f.createReward(); const ticket = await f.redeem(reward);
  const thread = await f.thread(); await f.send(f.privateMarker);
  for (const path of [f.base(), `${f.base()}/pontos`, f.ticketPath(ticket), f.submissionPath(thread.record),
    `${f.base()}/conversas/${thread.id}/comentarios`, `${f.base()}/bilhete`, `${f.base()}/mural`,
    `${f.ticketPath(ticket)}/album`, `${f.base()}/participacoes/${f.participation.id}/bilhete`]) {
    await errorCode(await f.admin.client.get(path), 404);
  }
});
