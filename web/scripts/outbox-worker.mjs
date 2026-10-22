import { setTimeout as delay } from 'node:timers/promises';
import { getDb } from '../src/server/db/client.ts';
import { deliverOutboxBatch } from '../src/server/outbox/worker.ts';

if (process.argv.slice(2).some(value => value !== '--once') || process.argv.length > 3) throw new Error('Use somente --once ou nenhum argumento.');
const once = process.argv.includes('--once');
const shutdown = new AbortController();
process.once('SIGINT', () => shutdown.abort());
process.once('SIGTERM', () => shutdown.abort());
try {
  do {
    const report = await deliverOutboxBatch();
    if (once) {
      process.stdout.write(JSON.stringify(report) + '\n');
      if (report.failed) process.exitCode = 1;
      break;
    }
    if (!report.delivered) await delay(1000, undefined, { signal: shutdown.signal }).catch(() => {});
  } while (!shutdown.signal.aborted);
} catch {
  process.stderr.write('Consumidor interrompido; eventos não processados permanecem no banco.\n');
  process.exitCode = 1;
} finally { await getDb().$disconnect(); }
