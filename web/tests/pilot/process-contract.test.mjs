import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { HEARTBEAT_MS, STALE_MS, BACKUP_INTERVAL_MS, assertSnapshot, assertReceipt,
  assertParentMessage, assertWorkerMessage } from '../../scripts/pilot/process-contract.mjs';
import { observeProcess } from '../../scripts/pilot/process-identity.mjs';

const owner = randomUUID();
const manager = await observeProcess(process.pid);
const snapshot = () => ({ formatVersion: 1, task: 't14', mode: 'development', owner, manager,
  phase: 'STARTING', status: 'starting', updatedAt: new Date().toISOString(), children: {}, maintenance: null });

test('contrato fixa heartbeat, silêncio e intervalo de captura aprovados', () => {
  assert.equal(HEARTBEAT_MS, 5000); assert.equal(STALE_MS, 30000); assert.equal(BACKUP_INTERVAL_MS, 43_200_000);
});

test('snapshot aceita identidade nativa e recusa ambiente, fase incoerente ou outro modo', () => {
  const value = snapshot(); assert.deepEqual(assertSnapshot(value), value);
  for (const change of [{ environment: { SECRET: 'fixture' } }, { mode: 'integration' },
    { status: 'ready' }, { formatVersion: 2 }, { children: { unknown: {} } }]) {
    assert.throws(() => assertSnapshot({ ...snapshot(), ...change }));
  }
});

test('recibo limita a admissão de backup a sessenta segundos e não aceita bypass', () => {
  const issuedAt = new Date().toISOString();
  const value = { formatVersion: 1, owner, operationId: randomUUID(), kind: 'BACKUP', manager, issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + 60_000).toISOString() };
  assert.deepEqual(assertReceipt(value), value);
  assert.throws(() => assertReceipt({ ...value, expiresAt: new Date(Date.parse(issuedAt) + 60_001).toISOString() }));
  assert.throws(() => assertReceipt({ ...value, bypass: true }));
});

test('IPC não transporta texto livre, credenciais, papéis ou contagens desconhecidos', () => {
  const boot = { formatVersion: 1, type: 'BOOT', owner, role: 'media' };
  assert.deepEqual(assertParentMessage(boot), boot);
  assert.throws(() => assertParentMessage({ ...boot, role: 'migration' }));
  assert.throws(() => assertParentMessage({ ...boot, secret: 'fixture' }));
  const heartbeat = { formatVersion: 1, type: 'HEARTBEAT', owner, role: 'media', pid: process.pid,
    sequence: 1, phase: 'idle', lastRound: null };
  assert.deepEqual(assertWorkerMessage(heartbeat), heartbeat);
  const round = { code: 'OK', completedAt: new Date().toISOString(), durationMs: 10, counts: { processed: 0 } };
  assert.doesNotThrow(() => assertWorkerMessage({ ...heartbeat, lastRound: round }));
  for (const change of [{ message: 'conteúdo privado' }, { sequence: -1 }, { phase: 'unknown' },
    { lastRound: { ...round, counts: { privateId: 1 } } }, { lastRound: { ...round, counts: { processed: -1 } } }]) {
    assert.throws(() => assertWorkerMessage({ ...heartbeat, ...change }));
  }
});
