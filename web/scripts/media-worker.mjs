import { setTimeout as delay } from 'node:timers/promises';
import { getDb } from '../src/server/db/client.ts';
import { processMediaBatch } from '../src/server/media-worker/processing.ts';
import { startMediaServer } from '../src/server/media-worker/server.ts';
import { cleanupMediaBatch } from '../src/server/media-worker/retention.ts';

const [mode] = process.argv.slice(2);
if (process.argv.length > 3 || (mode && !['--once', '--purge-once', '--manual'].includes(mode))) throw new Error('Use --once, --purge-once, --manual ou nenhum argumento.');
const shutdown = new AbortController();
process.once('SIGINT', () => shutdown.abort());
process.once('SIGTERM', () => shutdown.abort());
let server;
try {
  if (mode === '--once' || mode === '--purge-once') {
    const result = mode === '--once' ? await processMediaBatch({ limit: 10 }) : await cleanupMediaBatch();
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.failed) process.exitCode = 1;
  } else {
    server = await startMediaServer();
    process.stdout.write('Processo de mídia local em 127.0.0.1:4311.\n');
    while (!shutdown.signal.aborted) {
      if (mode !== '--manual') { await processMediaBatch(); await cleanupMediaBatch(); }
      await delay(1000, undefined, { signal: shutdown.signal }).catch(() => {});
    }
  }
} catch {
  process.stderr.write('O processo de mídia foi interrompido. Tentativas não confirmadas permanecem recuperáveis.\n');
  process.exitCode = 1;
} finally {
  await server?.close();
  await getDb().$disconnect();
}
