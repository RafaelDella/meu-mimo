import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPilotRuntime } from './runtime-environment.mjs';
import { openWorkerChannel } from './worker-heartbeat.mjs';

const webRoot = fileURLToPath(new URL('../../', import.meta.url));
const normalized = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const failure = () => Object.assign(new Error('NEXT_HOST_FAILED'), { code: 'NEXT_HOST_FAILED' });

/** Own the HTTP server and the Next app in one process, including their graceful close. */
export async function runNextHost() {
  const channel = openWorkerChannel('next');
  const startedAt = performance.now();
  let app; let server; let handler; let lifecycle;
  const requests = new Set();
  const closeAdmission = () => lifecycle?.closeAdmission();
  try {
    if (!channel.managed || process.argv.length !== 2 || normalized(process.cwd()) !== normalized(webRoot)) throw failure();
    await channel.initialized;
    assertPilotRuntime(process.env, 'development');
    if (process.env.NODE_ENV !== 'production') throw failure();
    if (channel.signal.aborted) return;
    const { openRequestLifecycle } = await import('../../src/server/request-lifecycle.ts');
    lifecycle = openRequestLifecycle();
    channel.signal.addEventListener('abort', closeAdmission, { once: true });
    if (channel.signal.aborted) { closeAdmission(); return; }
    const { default: next } = await import('next');
    if (channel.signal.aborted) return;
    server = createServer((request, response) => {
      let resolveEnded;
      const ended = new Promise(resolve => { resolveEnded = resolve; });
      const finish = () => {
        for (const event of ['finish', 'close', 'error']) response.off(event, finish);
        requests.delete(ended); resolveEnded();
        if (!channel.signal.aborted && requests.size === 0) channel.setPhase('idle');
      };
      requests.add(ended);
      for (const event of ['finish', 'close', 'error']) response.once(event, finish);
      if (response.destroyed || response.writableFinished) { finish(); return; }
      if (channel.signal.aborted) {
        response.writeHead(503, { Connection: 'close' }); response.end(); return;
      }
      channel.setPhase('busy');
      // Next can retain its transport promise after an aborted response. Domain work is tracked separately.
      void Promise.resolve().then(() => handler(request, response)).catch(() => {
        if (response.destroyed || response.writableEnded) return;
        if (!response.headersSent) response.writeHead(500);
        response.end();
      }).catch(() => {});
    });
    app = next({ dev: false, dir: webRoot, hostname: '127.0.0.1', port: 4301, httpServer: server, quiet: true });
    await app.prepare(); handler = app.getRequestHandler();
    if (channel.signal.aborted) return;
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(4301, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    server.on('error', () => { channel.setPhase('failed'); channel.requestStop(); });
    channel.setPhase('idle');
    channel.round({ code: 'OK', durationMs: performance.now() - startedAt, counts: {} });
    if (!channel.signal.aborted) {
      await new Promise(resolve => channel.signal.addEventListener('abort', resolve, { once: true }));
    }
  } finally {
    closeAdmission();
    channel.requestStop();
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeIdleConnections();
      });
    }
    await Promise.all(requests);
    await lifecycle?.drain();
    await app?.close();
    // The bundled application uses this same process-wide lazy client; do not create one during shutdown.
    await globalThis.meuMimoDatabase?.$disconnect();
    channel.signal.removeEventListener('abort', closeAdmission);
    await channel.finish();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runNextHost(); }
  catch { process.stderr.write('NEXT_HOST_FAILED\n'); process.exitCode = 1; }
}
