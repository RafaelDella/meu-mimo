import assert from 'node:assert/strict';
import { runSupervisor, readSupervisor } from '../../../scripts/pilot/processes.mjs';
import { sameProcess } from '../../../scripts/pilot/process-identity.mjs';
import { createLocalGates } from '../../../scripts/pilot/maintenance.mjs';
import { localHealth } from '../../../scripts/pilot/health.mjs';

// Falha intencional somente do filho outbox desta instância, sem fila de trabalho pendente.
assert.equal(process.argv.length, 2); let interrupted = false;
await assert.rejects(runSupervisor({ gates: createLocalGates(), onStatus: async event => {
  if (event.code !== 'LOCAL_READY') return;
  const snapshot = await readSupervisor(); assert.equal(snapshot.manager.pid, process.pid);
  assert.equal(await sameProcess(snapshot.manager), true);
  const health = await localHealth({ snapshot }); assert.equal(health.status, 'ready');
  assert.equal(health.agesMs.outbox, null);
  const current = await readSupervisor(); assert.equal(current.owner, snapshot.owner);
  assert.deepEqual(current.children.outbox.identity, snapshot.children.outbox.identity);
  assert.equal(await sameProcess(current.children.outbox.identity), true);
  process.kill(current.children.outbox.identity.pid, 'SIGTERM'); interrupted = true;
} }), { code: 'WORKER_FAILED' });
assert.equal(interrupted, true);
const stopped = await readSupervisor(); assert.equal(stopped.phase, 'FAILED');
for (const child of Object.values(stopped.children)) {
  assert.equal(child.state, 'stopped'); assert.equal(await sameProcess(child.identity), false);
}
const result = await localHealth({ snapshot: stopped });
assert.notEqual(result.status, 'ready'); assert.ok(result.codes.includes('WORKER_FAILED'));
process.stdout.write('OWNED_WORKER_FAILURE_AND_HEALTH_VERIFIED\n');
