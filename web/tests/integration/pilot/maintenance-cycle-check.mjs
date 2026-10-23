import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { runSupervisor, readSupervisor } from '../../../scripts/pilot/processes.mjs';
import { sameProcess } from '../../../scripts/pilot/process-identity.mjs';
import { createLocalGates } from '../../../scripts/pilot/maintenance.mjs';
import { createBackup } from '../../../scripts/pilot/backup.mjs';
import { assertSourceWritersAbsent } from '../../../scripts/pilot/backup-source.mjs';
import { custodyRoot, writePrivateJson } from '../../../scripts/pilot/custody.mjs';
import { privateDiagnostic } from '../../../scripts/pilot/error-diagnostic.mjs';
import { maintainLocal } from '../../../scripts/pilot/retention.mjs';

// Exercita uma janela real após READY, sem alterar relógio, manifesto existente ou CLI de produto.
assert.equal(process.argv.length, 2);
const gates = createLocalGates(); let ready = 0; let requested = false; let captured;
const report = { formatVersion: 1, kind: 't15-maintenance-cycle', startedAt: new Date().toISOString(), events: [] };
const file = path.join(custodyRoot, 'reports', 'development-maintenance-check.json');
try {
  await runSupervisor({ gates: { ...gates,
    async maintenanceDue(context) {
      if (ready === 1 && !requested) { requested = true; return true; }
      return gates.maintenanceDue(context);
    },
    async maintain(context) {
      if (requested && !captured) {
        const snapshot = await readSupervisor(); assert.equal(snapshot.phase, 'MAINTENANCE');
        assert.equal(snapshot.manager.pid, process.pid); assert.equal(await sameProcess(snapshot.manager), true);
        assert.deepEqual(Object.keys(snapshot.children).sort(), ['media', 'next', 'outbox']);
        assert.ok(Object.values(snapshot.children).every(child => child.state === 'stopped'));
        await assert.rejects(assertSourceWritersAbsent({ ...context.receipt, owner: randomUUID() }));
        captured = await createBackup('development', { quiescenceReceipt: context.receipt });
        const remaining = Date.parse(context.receipt.expiresAt) - Date.now();
        if (remaining >= 0) await delay(remaining + 5);
        await assert.rejects(assertSourceWritersAbsent(context.receipt));
        report.backup = captured; report.managerAliveDuringCapture = true;
        report.rejectedReceipts = 2;
        const retention = await maintainLocal();
        return { code: 'LOCAL_MAINTENANCE_COMPLETE', backup: { id: captured.id, consistentAt: captured.consistentAt },
          retention: { status: retention.status, counts: retention.counts } };
      }
      return gates.maintain(context);
    },
  }, onStatus: async event => {
    report.events.push({ code: event.code, at: new Date().toISOString() });
    process.stdout.write(`${event.code}\n`);
    if (event.code === 'LOCAL_READY' && ++ready === 2) process.emit('SIGINT');
  } });
  assert.equal(ready, 2); assert.equal(captured.status, 'COMPLETE');
  report.code = 'MAINTENANCE_CYCLE_VERIFIED'; report.completedAt = new Date().toISOString();
  await writePrivateJson(file, report); process.stdout.write('MAINTENANCE_CYCLE_VERIFIED\n');
} catch (error) {
  await writePrivateJson(file, { ...report, code: 'MAINTENANCE_CYCLE_FAILED', diagnostic: privateDiagnostic(error) });
  process.stderr.write('MAINTENANCE_CYCLE_FAILED\n'); process.exitCode = 1;
}
