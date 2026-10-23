import { setTimeout as delay } from 'node:timers/promises';
import { getDb } from '../src/server/db/client.ts';
import { deliverOutboxBatch } from '../src/server/outbox/worker.ts';
import { openWorkerChannel } from './pilot/worker-heartbeat.mjs';

if (process.argv.slice(2).some(value => value !== '--once') || process.argv.length > 3) throw new Error('Use somente --once ou nenhum argumento.');
const once = process.argv.includes('--once');
const channel = openWorkerChannel('outbox');
try {
  await channel.initialized;
  while (!channel.signal.aborted) {
    channel.setPhase('busy'); const started = performance.now();
    let report;
    try {
      report = await deliverOutboxBatch({ signal: channel.signal });
      // Novas tentativas já registradas não são falhas operacionais da rodada.
      channel.round({ code: 'OK', durationMs: performance.now() - started, counts: report });
    } catch (error) {
      channel.round({ code: 'FAILED', durationMs: performance.now() - started, counts: { failed: 1 } }); throw error;
    }
    if (once) {
      process.stdout.write(JSON.stringify(report) + '\n');
      if (report.failed) process.exitCode = 1;
      break;
    }
    if (!report.delivered) await delay(1000, undefined, { signal: channel.signal }).catch(error => { if (!channel.signal.aborted) throw error; });
  }
} catch {
  channel.setPhase('failed');
  process.stderr.write('Consumidor interrompido; eventos não processados permanecem no banco.\n');
  process.exitCode = 1;
} finally {
  channel.requestStop();
  let closed = true;
  try { if (globalThis.meuMimoDatabase) await getDb().$disconnect(); } catch { closed = false; }
  if (closed) await channel.finish();
  else { channel.setPhase('failed'); process.exitCode = 1; }
}
