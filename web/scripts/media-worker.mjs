import { setTimeout as delay } from 'node:timers/promises';
import { getDb } from '../src/server/db/client.ts';
import { processMediaBatch } from '../src/server/media-worker/processing.ts';
import { startMediaServer } from '../src/server/media-worker/server.ts';
import { cleanupMediaBatch } from '../src/server/media-worker/retention.ts';
import { openWorkerChannel } from './pilot/worker-heartbeat.mjs';

const [mode] = process.argv.slice(2);
if (process.argv.length > 3 || (mode && !['--once', '--purge-once', '--manual'].includes(mode))) throw new Error('Use --once, --purge-once, --manual ou nenhum argumento.');
const channel = openWorkerChannel('media');
let server; let serverClosed;
const closeServer = () => {
  if (server) serverClosed ??= server.close();
  return serverClosed;
};
const stopAdmission = () => { void closeServer()?.catch(() => { channel.setPhase('failed'); process.exitCode = 1; }); };
channel.signal.addEventListener('abort', stopAdmission, { once: true });

async function runRound(purgeOnly = false) {
  channel.setPhase('busy'); const started = performance.now();
  try {
    const processed = purgeOnly ? null : await processMediaBatch({ ...(mode === '--once' ? { limit: 10 } : {}), signal: channel.signal });
    const cleaned = mode === '--once' ? null : await cleanupMediaBatch({ signal: channel.signal });
    const counts = { ...processed, ...cleaned, failed: (processed?.failed ?? 0) + (cleaned?.failed ?? 0) };
    // Falhas de itens já registradas preservam uma rodada concluída.
    channel.round({ code: 'OK', durationMs: performance.now() - started, counts });
    return counts;
  } catch (error) {
    channel.round({ code: 'FAILED', durationMs: performance.now() - started, counts: { failed: 1 } }); throw error;
  }
}
try {
  await channel.initialized;
  if (!channel.signal.aborted && (mode === '--once' || mode === '--purge-once')) {
    const result = await runRound(mode === '--purge-once');
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.failed) process.exitCode = 1;
  } else if (!channel.signal.aborted) {
    server = await startMediaServer({ signal: channel.signal });
    if (channel.signal.aborted) await closeServer();
    else {
      process.stdout.write(`Processo de mídia local em 127.0.0.1:${server.port}.\n`);
      channel.setPhase('idle');
      while (!channel.signal.aborted) {
        if (mode !== '--manual') await runRound();
        await delay(1000, undefined, { signal: channel.signal }).catch(error => { if (!channel.signal.aborted) throw error; });
      }
    }
  }
} catch {
  channel.setPhase('failed');
  process.stderr.write('O processo de mídia foi interrompido. Tentativas não confirmadas permanecem recuperáveis.\n');
  process.exitCode = 1;
} finally {
  channel.requestStop(); channel.signal.removeEventListener('abort', stopAdmission);
  let closed = true;
  try { await closeServer(); } catch { closed = false; }
  try { if (globalThis.meuMimoDatabase) await getDb().$disconnect(); } catch { closed = false; }
  if (closed) await channel.finish();
  else { channel.setPhase('failed'); process.exitCode = 1; }
}
