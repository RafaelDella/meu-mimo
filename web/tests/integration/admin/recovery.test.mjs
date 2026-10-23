import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('resposta descartada e replay recuperam ação antiga com estado atual sem reaplicar', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const target = { type: 'STORE', id: f.store.id };
  const request = { operationId: randomUUID(), target, action: 'PAUSE_STORE', expectedVersion: 0, reason: 'Uma intenção confirmada.' };
  const ignored = await f.admin.client.post('/api/admin/acoes', request); expectStatus(ignored, 200); await ignored.body?.cancel();
  const lookup = await f.adminRead(`/api/admin/operacoes/${request.operationId}`);
  assert.equal(lookup.operation.operation.id, request.operationId); assert.equal(lookup.operation.appliedVersion, 1);
  await f.action(target, 'RESUME_STORE');
  const replay = await f.admin.client.post('/api/admin/acoes', request); expectStatus(replay, 200);
  const result = await replay.json(); assert.equal(result.appliedVersion, 1); assert.equal(result.current.version, 2); assert.equal(result.current.platformPausedAt, null);
  assert.equal((await f.database.query('SELECT count(*)::int AS n FROM app."AdminAction" WHERE id=$1', [request.operationId])).rows[0].n, 1);
  const otherStore = await f.createStore(f.owner);
  for (const extra of [{ reason: 'Outra intenção.' }, { target: { type: 'STORE', id: otherStore.id } }, { action: 'RESUME_STORE' }, { expectedVersion: 2 }]) {
    await errorCode(await f.admin.client.post('/api/admin/acoes', { ...request, ...extra }), 409);
  }
  assert.deepEqual(await f.adminRead(`/api/admin/operacoes/${randomUUID()}`), { operation: null });
});

test('lookup não revela outra autoria e grant perdido impede recuperar ação própria', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const applied = await f.action({ type: 'STORE', id: f.store.id }, 'PAUSE_STORE');
  const second = await f.user(); await f.grant(second); await f.mfa(second);
  assert.deepEqual(await f.adminRead(`/api/admin/operacoes/${applied.operation.id}`, undefined, second), { operation: null });
  await errorCode(await second.client.post('/api/admin/acoes', applied.request), 409);
  await f.database.query('UPDATE app."AdminGrant" SET "revokedAt"=clock_timestamp() WHERE "profileId"=$1', [f.admin.id]);
  await errorCode(await f.admin.client.get(`/api/admin/operacoes/${applied.operation.id}`), 403, 'admin_forbidden');
  await errorCode(await f.admin.client.post('/api/admin/acoes', applied.request), 403, 'admin_forbidden');
});

test('replay de bloqueio passado não reativa bloqueio quando alvo ganhou grant depois', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const target = { type: 'ACCOUNT', id: f.target.id };
  const blocked = await f.action(target, 'BLOCK_ACCOUNT'); await f.action(target, 'UNBLOCK_ACCOUNT'); await f.grant(f.target);
  const response = await f.admin.client.post('/api/admin/acoes', blocked.request); expectStatus(response, 200);
  const replay = await response.json(); assert.equal(replay.appliedVersion, 1); assert.equal(replay.current.suspendedAt, null); assert.equal(replay.current.canBlock, false);
});
