import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createFixture } from '../helpers/fixtures.mjs';
import { readState } from '../../../scripts/local-runtime.mjs';
import { mediaEnvironment } from '../../../scripts/media-environment.mjs';
import { pilotRuntimeEnvironment } from '../../../scripts/pilot/runtime-environment.mjs';
import { custodyRoot, readPrivateJson, writePrivateJson } from '../../../scripts/pilot/custody.mjs';
import { readSupervisor } from '../../../scripts/pilot/processes.mjs';
import { postStopRequest } from '../../../scripts/pilot/process-custody.mjs';
import { sameProcess } from '../../../scripts/pilot/process-identity.mjs';
import { localHealth } from '../../../scripts/pilot/health.mjs';
import { privateDiagnostic } from '../../../scripts/pilot/error-diagnostic.mjs';

assert.equal(process.argv.length, 2);
const reportFile = path.join(custodyRoot, 'reports', 'request-drain-check.json');
Object.assign(process.env, pilotRuntimeEnvironment(readState('t14'), 'development'), mediaEnvironment('development', 't14'));
const f = await createFixture({ after: () => {} }, { target: 'development' });
const controllers = []; const requests = []; let blocker; let committed = false;
async function until(operation, milliseconds) {
  const deadline = Date.now() + milliseconds;
  for (;;) { const value = await operation(); if (value) return value; assert.ok(Date.now() < deadline, 'REQUEST_DRAIN_DEADLINE'); await delay(50); }
}
try {
  const state = await readPrivateJson(path.join(custodyRoot, 'reports', 'development-web-fixture.json'));
  assert.equal(state.kind, 't15-development-web'); assert.equal(state.phase, 'PREPARED');
  const owner = state.people.owner;
  const user = await f.auth.auth.admin.getUserById(owner.id); assert.equal(user.error, null);
  assert.equal(user.data.user.email, owner.email); assert.equal(user.data.user.app_metadata.local_fixture, 'meumimo-t15');
  assert.equal(user.data.user.app_metadata.fixture_run, state.run);
  const store = (await f.database.query('SELECT "createdByProfileId" FROM app."Store" WHERE id=$1', [state.storeId])).rows[0];
  assert.equal(store.createdByProfileId, owner.id);
  const ticket = (await f.database.query('SELECT version,status FROM app."Redemption" WHERE id=$1 AND "storeId"=$2',
    [state.ticketId, state.storeId])).rows[0]; assert.equal(ticket.status, 'WAITING_AGREEMENT');
  const conversation = (await f.database.query('SELECT id FROM app."Conversation" WHERE "storeId"=$1 AND "subjectId"=$2 AND "subjectType"=\'TICKET\'',
    [state.storeId, state.ticketId])).rows[0]; assert.ok(conversation);
  const client = f.client(); await f.login({ ...owner, client });
  const snapshot = await readSupervisor(); assert.equal(snapshot.phase, 'READY');
  assert.equal((await localHealth({ snapshot })).status, 'ready');
  blocker = await f.database.connect(); await blocker.query('BEGIN');
  await blocker.query('SELECT id FROM app."Store" WHERE id=$1 FOR UPDATE', [state.storeId]);
  const lockStarted = performance.now();
  const blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const lockBudget = () => { const left = 7500 - (performance.now() - lockStarted); assert.ok(left > 0); return Math.min(left, 2500); };
  const paths = [
    [`/api/lojas/${state.storeId}/tickets/${state.ticketId}/album`, 'GET'],
    [`/api/lojas/${state.storeId}/conversas/${conversation.id}/reacao`, 'GET'],
    [`/api/lojas/${state.storeId}/tickets/${state.ticketId}/transicoes`, 'POST'],
  ];
  const operationId = randomUUID();
  const cookie = [...client.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  for (const [pathname, method] of paths) {
    const controller = new AbortController(); controllers.push(controller);
    const headers = { Cookie: cookie, Origin: f.environment.origin, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) };
    requests.push(fetch(new URL(pathname, f.environment.origin), { method, headers, signal: controller.signal,
      ...(method === 'POST' ? { body: JSON.stringify({ operationId, expectedVersion: ticket.version, action: 'CANCEL',
        text: 'Cancelamento admitido antes da parada local.', expectedBalance: '5', restock: false }) } : {}),
    }).then(async response => { await response.body?.cancel(); return { status: response.status }; }, () => ({ aborted: true })));
  }
  await until(async () => {
    const blocked = await f.database.query(`WITH RECURSIVE blocked AS (
      SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND usename='meumimo_runtime'
        AND $1=ANY(pg_blocking_pids(pid))
      UNION SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid=ANY(pg_blocking_pids(a.pid))
        WHERE a.datname=current_database() AND a.usename='meumimo_runtime') SELECT pid FROM blocked`, [blockerPid]);
    assert.ok(blocked.rowCount <= 3, 'Lock próprio não pode ter outra operação concorrente.');
    return blocked.rowCount === 3;
  }, lockBudget());
  for (const controller of controllers) controller.abort(); await Promise.all(requests);
  await postStopRequest(snapshot);
  await until(async () => (await readSupervisor()).phase === 'DRAINING', lockBudget());
  assert.equal(await sameProcess(snapshot.children.next.identity), true);
  await delay(150);
  assert.equal((await f.database.query('SELECT status FROM app."Redemption" WHERE id=$1', [state.ticketId])).rows[0].status, 'WAITING_AGREEMENT');
  const lockHeldMs = Math.round(performance.now() - lockStarted); assert.ok(lockHeldMs < 8000);
  await blocker.query('COMMIT'); committed = true; blocker.release(); blocker = null;
  const stopped = await until(async () => {
    const current = await readSupervisor(); assert.equal(current.owner, snapshot.owner);
    return current.phase === 'STOPPED' ? current : false;
  }, 30000);
  for (const child of Object.values(stopped.children)) assert.equal(await sameProcess(child.identity), false);
  const result = (await f.database.query(`SELECT r.status,
    (SELECT count(*)::int FROM app."RedemptionEvent" e WHERE e.id=$2 AND e."redemptionId"=r.id AND e.kind='CANCEL') AS events,
    (SELECT count(*)::int FROM app."PointsEntry" p WHERE p."redemptionEventId"=$2 AND p.amount=10 AND p.kind='REDEMPTION_REFUND') AS refunds
    FROM app."Redemption" r WHERE r.id=$1`, [state.ticketId, operationId])).rows[0];
  assert.deepEqual(result, { status: 'CANCELLED', events: 1, refunds: 1 });
  await writePrivateJson(reportFile, { code: 'HTTP_ABORT_DOMAIN_DRAIN_VERIFIED', checkedAt: new Date().toISOString(),
    counts: { abortedReads: 2, admittedMutation: 1, refunds: 1, stoppedChildren: 3 }, lockHeldMs });
  process.stdout.write('HTTP_ABORT_DOMAIN_DRAIN_VERIFIED\n');
} catch (error) {
  await writePrivateJson(reportFile, { code: 'HTTP_ABORT_DOMAIN_DRAIN_FAILED', diagnostic: privateDiagnostic(error) });
  process.stderr.write('HTTP_ABORT_DOMAIN_DRAIN_FAILED; fixture própria preservada.\n'); process.exitCode = 1;
} finally {
  try {
    for (const controller of controllers) controller.abort();
    if (blocker) { try { if (!committed) await blocker.query('ROLLBACK'); } finally { blocker.release(); } }
  } finally { try { await Promise.allSettled(requests); } finally { await f.close(); } }
}
