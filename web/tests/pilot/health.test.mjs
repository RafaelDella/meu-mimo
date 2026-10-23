import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWorkerHealth, localHealth } from '../../scripts/pilot/health.mjs';
import { observeProcess } from '../../scripts/pilot/process-identity.mjs';
import { randomUUID } from 'node:crypto';

const now = new Date('2026-10-23T16:00:00.000Z');
const child = (age, phase = 'idle', code = 'OK') => ({ identity: { pid: 1, creationTime: 'native', executable: process.execPath },
  state: 'running', heartbeat: { receivedAt: new Date(now.getTime() - age).toISOString(), sequence: 1, phase,
    lastRound: { code, completedAt: now.toISOString(), durationMs: 1, counts: { delivered: 0 } } } });

test('worker só fica pronto com heartbeat recente e rodada saudável', () => {
  assert.deepEqual(evaluateWorkerHealth(child(29_999), now), { component: 'ready', code: null });
  assert.deepEqual(evaluateWorkerHealth(child(30_000), now), { component: 'stale', code: 'WORKER_STALE' });
  assert.deepEqual(evaluateWorkerHealth(child(-1), now), { component: 'stale', code: 'WORKER_STALE' });
  assert.deepEqual(evaluateWorkerHealth(child(100, 'idle', 'FAILED'), now), { component: 'unavailable', code: 'WORKER_FAILED' });
  const handledItem = child(100); handledItem.heartbeat.lastRound.counts.failed = 1;
  assert.deepEqual(evaluateWorkerHealth(handledItem, now), { component: 'ready', code: null });
});

test('rodada ocupada não vira falha e ausência de rodada idle não vira ready', () => {
  const busy = child(100, 'busy'); busy.heartbeat.lastRound = null;
  assert.deepEqual(evaluateWorkerHealth(busy, now), { component: 'busy', code: null });
  const idle = child(100); idle.heartbeat.lastRound = null;
  assert.notEqual(evaluateWorkerHealth(idle, now).component, 'ready');
  const stopped = child(100); stopped.state = 'stopped';
  assert.equal(evaluateWorkerHealth(stopped, now).component, 'stopped');
});

test('drenagem nunca declara ready nem abre novos probes de dependências', async () => {
  const snapshot = { formatVersion: 1, task: 't14', mode: 'development', owner: randomUUID(),
    manager: await observeProcess(process.pid), phase: 'DRAINING', status: 'stopping',
    updatedAt: new Date().toISOString(), children: {}, maintenance: null };
  const result = await localHealth({ snapshot });
  assert.equal(result.status, 'degraded'); assert.deepEqual(result.codes, ['WORKER_STALE']);
  assert.ok(Object.values(result.components).every(value => value === 'not_checked'));
  assert.ok(Object.values(result.agesMs).every(value => value === null));
});
