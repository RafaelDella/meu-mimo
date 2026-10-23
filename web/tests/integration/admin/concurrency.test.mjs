import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { adminFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

async function blockedBy(f, pid) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await f.database.query('SELECT pid FROM pg_stat_activity WHERE $1::integer=ANY(pg_blocking_pids(pid))', [pid]);
    if (result.rowCount) return;
    await delay(25);
  }
  assert.fail('O teste exige observar o comando aguardando o lock controlado.');
}
const request = (f, extra = {}) => ({ operationId: randomUUID(), target: { type: 'STORE', id: f.store.id },
  action: 'PAUSE_STORE', expectedVersion: 0, reason: 'Intenção concorrente fictícia.', ...extra });

test('mesma UUID concorrente confirma uma vez; mesma revisão de outra intenção conflita', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const body = request(f);
  const replies = await Promise.all([f.admin.client.post('/api/admin/acoes', body), f.admin.client.post('/api/admin/acoes', body)]);
  replies.forEach(response => expectStatus(response, 200));
  const results = await Promise.all(replies.map(response => response.json())); assert.ok(results.every(result => result.appliedVersion === 1));
  assert.equal((await f.database.query('SELECT count(*)::int AS n FROM app."AdminAction" WHERE id=$1', [body.operationId])).rows[0].n, 1);
  await f.action(body.target, 'RESUME_STORE');
  const next = request(f, { expectedVersion: 2 });
  const different = await Promise.all([f.admin.client.post('/api/admin/acoes', next),
    f.admin.client.post('/api/admin/acoes', { ...next, operationId: randomUUID(), reason: 'Outra intenção.' })]);
  assert.deepEqual(different.map(response => response.status).sort(), [200, 409]);
  assert.equal((await f.adminRead(`/api/admin/lojas/${f.store.id}`)).version, 3);
});

for (const restriction of ['grant', 'account']) test(`${restriction} revogado durante autorização impede commit administrativo`, { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const body = request(f); const locker = await f.database.connect(); let pending;
  try {
    await locker.query('BEGIN');
    const { pid } = (await locker.query('SELECT pg_backend_pid() AS pid')).rows[0];
    await locker.query(restriction === 'grant'
      ? 'UPDATE app."AdminGrant" SET "revokedAt"=clock_timestamp() WHERE "profileId"=$1'
      : 'UPDATE app."Profile" SET "suspendedAt"=clock_timestamp() WHERE id=$1', [f.admin.id]);
    pending = f.admin.client.post('/api/admin/acoes', body); pending.catch(() => undefined);
    await blockedBy(f, pid); await locker.query('COMMIT');
    await errorCode(await pending, 403);
    assert.equal((await f.database.query('SELECT count(*)::int AS n FROM app."AdminAction" WHERE id=$1', [body.operationId])).rows[0].n, 0);
    const store = (await f.database.query('SELECT "platformPausedAt","platformVersion" FROM app."Store" WHERE id=$1', [f.store.id])).rows[0];
    assert.equal(store.platformPausedAt, null); assert.equal(store.platformVersion, 0);
  } finally { await locker.query('ROLLBACK'); locker.release(); if (pending) await Promise.allSettled([pending]); }
});

test('grant provisionado primeiro é visível após a espera do comando e impede bloquear novo admin', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const locker = await f.database.connect(); let pending;
  const body = request(f, { target: { type: 'ACCOUNT', id: f.target.id }, action: 'BLOCK_ACCOUNT' });
  try {
    await locker.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    const { pid } = (await locker.query('SELECT pg_backend_pid() AS pid')).rows[0];
    await locker.query('SELECT id FROM app."Profile" WHERE id=$1 FOR UPDATE', [f.target.id]);
    pending = f.admin.client.post('/api/admin/acoes', body); pending.catch(() => undefined);
    await blockedBy(f, pid);
    await locker.query('INSERT INTO app."AdminGrant" ("profileId") SELECT id FROM app."Profile" WHERE id=$1 AND "suspendedAt" IS NULL', [f.target.id]);
    await locker.query('COMMIT'); await errorCode(await pending, 403);
    const account = await f.adminRead(`/api/admin/contas/${f.target.id}`);
    assert.equal(account.suspendedAt, null); assert.equal(account.version, 0); assert.equal(account.canBlock, false);
  } finally { await locker.query('ROLLBACK'); locker.release(); if (pending) await Promise.allSettled([pending]); }
});

test('bloqueio primeiro faz provisionamento separado reler perfil suspenso e não criar grant', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const body = request(f, { target: { type: 'ACCOUNT', id: f.target.id }, action: 'BLOCK_ACCOUNT' });
  const key = randomInt(1, 2_000_000_000); const name = `t13_commit_${randomUUID().replaceAll('-', '')}`;
  await f.database.query(`CREATE FUNCTION app."${name}"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id='${body.operationId}'::uuid THEN PERFORM pg_advisory_xact_lock(${key}); END IF; RETURN NULL; END $$`);
  await f.database.query(`CREATE CONSTRAINT TRIGGER "${name}" AFTER INSERT ON app."AdminAction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app."${name}"()`);
  const locker = await f.database.connect(); let pending; let provision;
  try {
    const { pid } = (await locker.query('SELECT pg_backend_pid() AS pid')).rows[0];
    await locker.query('SELECT pg_advisory_lock($1)', [key]);
    pending = f.admin.client.post('/api/admin/acoes', body); pending.catch(() => undefined);
    await blockedBy(f, pid);
    provision = f.grant(f.target).then(() => null, error => error);
    await locker.query('SELECT pg_advisory_unlock($1)', [key]);
    expectStatus(await pending, 200); assert.ok(await provision, 'O provisionamento exige perfil livre após o lock.');
    assert.equal((await f.database.query('SELECT count(*)::int AS n FROM app."AdminGrant" WHERE "profileId"=$1', [f.target.id])).rows[0].n, 0);
  } finally {
    await locker.query('SELECT pg_advisory_unlock($1)', [key]); locker.release();
    await Promise.allSettled([pending, provision].filter(Boolean));
    await f.database.query(`DROP TRIGGER "${name}" ON app."AdminAction"`); await f.database.query(`DROP FUNCTION app."${name}"()`);
  }
});
