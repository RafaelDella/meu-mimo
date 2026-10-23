import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('121ª leitura administrativa limita por conta e conserva cota independente de escrita', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); await f.resetAdminLimits();
  for (let i = 0; i < 120; i++) expectStatus(await f.admin.client.get('/api/admin/resumo'), 200);
  const denied = await f.admin.client.get('/api/admin/resumo'); await errorCode(denied, 429, 'rate_limited');
  assert.ok(Number(denied.headers.get('retry-after')) >= 1);
  expectStatus(await f.admin.client.post('/api/admin/acoes', { operationId: randomUUID(), target: { type: 'STORE', id: f.store.id },
    action: 'PAUSE_STORE', expectedVersion: 0, reason: 'A cota de escrita é independente.' }), 200);
  const second = await f.user(); await f.grant(second); await f.mfa(second);
  expectStatus(await second.client.get('/api/admin/resumo'), 200);
});

test('11ª mutação incluindo replay limita sem nova auditoria e leitura continua disponível', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const applied = await f.action({ type: 'STORE', id: f.store.id }, 'PAUSE_STORE');
  await f.resetAdminLimits();
  for (let i = 0; i < 10; i++) expectStatus(await f.admin.client.post('/api/admin/acoes', applied.request), 200);
  const denied = await f.admin.client.post('/api/admin/acoes', applied.request); await errorCode(denied, 429, 'rate_limited');
  assert.ok(Number(denied.headers.get('retry-after')) >= 1);
  const current = await f.adminRead(`/api/admin/operacoes/${applied.operation.id}`); assert.equal(current.operation.appliedVersion, 1);
  assert.equal((await f.database.query('SELECT count(*)::int AS n FROM app."AdminAction" WHERE id=$1', [applied.operation.id])).rows[0].n, 1);
});
