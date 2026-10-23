import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminFixture, closeRuntime } from './helpers.mjs';
import { errorCode } from '../helpers/http-client.mjs';
after(closeRuntime);

test('pausa e bloqueio têm revisões e auditorias imutáveis sem mudar a economia', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); await f.credit(); const reward = await f.createReward({ stock: 2 }); await f.redeem(reward);
  const before = await f.financial(); const target = { type: 'STORE', id: f.store.id };
  const paused = await f.action(target, 'PAUSE_STORE');
  assert.equal(paused.appliedVersion, 1); assert.equal(paused.current.state, 'ACTIVE'); assert.ok(paused.current.platformPausedAt);
  assert.equal(paused.operation.previousRestrictedAt, null); assert.equal(paused.operation.restrictedAt, paused.current.platformPausedAt);
  const resumed = await f.action(target, 'RESUME_STORE'); assert.equal(resumed.current.platformPausedAt, null); assert.equal(resumed.current.version, 2);
  const account = { type: 'ACCOUNT', id: f.target.id };
  const blocked = await f.action(account, 'BLOCK_ACCOUNT'); assert.ok(blocked.current.suspendedAt); assert.equal(blocked.appliedVersion, 1);
  const opened = await f.action(account, 'UNBLOCK_ACCOUNT'); assert.equal(opened.current.suspendedAt, null); assert.equal(opened.appliedVersion, 2);
  assert.deepEqual(await f.financial(), before);
  const history = await f.adminRead('/api/admin/historico/consulta', { target });
  assert.deepEqual(history.items.map(item => item.action), ['RESUME_STORE', 'PAUSE_STORE']);
  assert.ok(history.items.every(item => item.actor.id === f.admin.id && item.target.id === f.store.id));
  const denied = await f.admin.client.post('/api/admin/acoes', { ...paused.request, operationId: randomUUID(), expectedVersion: 1 });
  await errorCode(denied, 409);
  assert.equal((await f.database.query('SELECT count(*)::int AS n FROM app."AdminAction" WHERE "targetStoreId"=$1', [f.store.id])).rows[0].n, 2);
});

test('motivo normaliza NFC aceita500 Unicode e rejeita entradas ou campos não autorizados', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const target = { type: 'STORE', id: f.store.id };
  const body = { operationId: randomUUID(), target, action: 'PAUSE_STORE', expectedVersion: 0, reason: 'Motivo válido' };
  for (const extra of [{ reason: '' }, { reason: ' ' }, { reason: '🌷'.repeat(501) }, { reason: '\ud800' }, { reason: 'a\u0001b' },
    { expectedVersion: -1 }, { expectedVersion: 0.5 }, { expectedVersion: 2_147_483_647 }, { operationId: 'inválido' },
    { actorId: f.admin.id }, { sessionId: randomUUID() }, { aal2: true }, { grant: true },
    { target: { type: 'STORE', id: f.store.id, actorId: f.admin.id } }, { target: { type: 'ACCOUNT', id: f.target.id } }]) {
    await f.resetAdminLimits(); await errorCode(await f.admin.client.post('/api/admin/acoes', { ...body, ...extra }), 400);
  }
  await f.resetAdminLimits();
  const normalized = await f.action(target, 'PAUSE_STORE', { reason: '  Cafe\u0301  ' });
  assert.equal(normalized.operation.reason, 'Café');
  const resumed = await f.action(target, 'RESUME_STORE', { reason: '🌷'.repeat(500) });
  assert.equal(Array.from(resumed.operation.reason).length, 500);
  await errorCode(await f.admin.client.post('/api/admin/acoes', { ...body, operationId: randomUUID() }, { Origin: 'https://example.test' }), 403);
  await errorCode(await f.admin.client.request('/api/admin/acoes', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } }), 415);
});

test('autoproteção e grants ativos impedem bloqueio pela API', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); await f.grant(f.bia);
  for (const person of [f.admin, f.bia]) {
    const current = await f.adminRead(`/api/admin/contas/${person.id}`); assert.equal(current.canBlock, false);
    await errorCode(await f.admin.client.post('/api/admin/acoes', { operationId: randomUUID(), target: { type: 'ACCOUNT', id: person.id },
      action: 'BLOCK_ACCOUNT', expectedVersion: current.version, reason: 'Proteção deve impedir.' }), 403);
    const row = (await f.database.query('SELECT "suspendedAt","securityVersion" FROM app."Profile" WHERE id=$1', [person.id])).rows[0];
    assert.equal(row.suspendedAt, null); assert.equal(row.securityVersion, 0);
  }
});

test('falha diferida da auditoria reverte projeção e não inventa ação confirmada', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const operationId = randomUUID(); const name = `t13_rollback_${randomUUID().replaceAll('-', '')}`;
  await f.database.query(`CREATE FUNCTION app."${name}"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id='${operationId}'::uuid THEN RAISE EXCEPTION 'Proof failure' USING ERRCODE='23514'; END IF; RETURN NULL; END $$`);
  await f.database.query(`CREATE CONSTRAINT TRIGGER "${name}" AFTER INSERT ON app."AdminAction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app."${name}"()`);
  try {
    await errorCode(await f.admin.client.post('/api/admin/acoes', { operationId, target: { type: 'STORE', id: f.store.id }, action: 'PAUSE_STORE',
      expectedVersion: 0, reason: f.privateMarker }), 503, 'service_unavailable');
    const store = await f.adminRead(`/api/admin/lojas/${f.store.id}`); assert.equal(store.platformPausedAt, null); assert.equal(store.version, 0);
    assert.equal((await f.database.query('SELECT count(*)::int AS n FROM app."AdminAction" WHERE id=$1', [operationId])).rows[0].n, 0);
    assert.deepEqual(await f.adminRead(`/api/admin/operacoes/${operationId}`), { operation: null });
  } finally {
    await f.database.query(`DROP TRIGGER "${name}" ON app."AdminAction"`); await f.database.query(`DROP FUNCTION app."${name}"()`);
  }
});
