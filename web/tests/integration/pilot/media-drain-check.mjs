import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { readState } from '../../../scripts/local-runtime.mjs';
import { mediaEnvironment } from '../../../scripts/media-environment.mjs';
import { pilotRuntimeEnvironment } from '../../../scripts/pilot/runtime-environment.mjs';
import { assertSourceWritersAbsent } from '../../../scripts/pilot/backup-source.mjs';

assert.equal(process.argv.length, 2);
await assertSourceWritersAbsent();
Object.assign(process.env, pilotRuntimeEnvironment(readState('t14'), 'development'), mediaEnvironment('development', 't14'));
const { startMediaServer } = await import('../../../src/server/media-worker/server.ts');
const controller = new AbortController(); const server = await startMediaServer({ signal: controller.signal });
let request; let closing;
try {
  const reply = new Promise((resolve, reject) => {
    request = http.request({ host: '127.0.0.1', port: 4311, path: '/part', method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '2',
        'X-Media-Envelope': 'invalid-fixture', 'X-Media-Signature': 'invalid-fixture' } }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject); request.setTimeout(5000, () => request.destroy(new Error('DRAIN_CHECK_TIMEOUT')));
  });
  request.flushHeaders(); request.write('a');
  await delay(250); controller.abort();
  let closed = false; closing = server.close().then(() => { closed = true; });
  await delay(200); assert.equal(closed, false, 'Parada deve aguardar o corpo HTTP corrente.');
  request.end('b'); assert.equal(await reply, 404); await closing;
  assert.equal(closed, true);
} finally { request?.destroy(); await (closing ?? server.close()); }

const stopped = new AbortController(); stopped.abort();
const blocked = await startMediaServer({ signal: stopped.signal });
try {
  const response = await fetch('http://127.0.0.1:4311/part', { method: 'POST', signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 503); await response.body?.cancel();
} finally { await blocked.close(); }
assert.equal(globalThis.meuMimoDatabase, undefined, 'Requisições inválidas não podem abrir banco.');
process.stdout.write('MEDIA_HTTP_DRAIN_AND_ABORT_VERIFIED\n');
