import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readState, taskResources, webRoot } from './local-runtime.mjs';
import { bindLocalStack } from './bind-local-stack.mjs';
import { mediaEnvironment } from './media-environment.mjs';

const resources = taskResources(process.argv[2] ?? 't02');
const state = readState(resources.task);
const withMedia = ['t06', 't07', 't08', 't09', 't10', 't11', 't12'].includes(resources.task);
const mediaEnv = withMedia ? mediaEnvironment('integration', resources.task) : {};
await bindLocalStack();
// Depois de religar o DB, o pool do Auth pode descartar uma conexão antiga.
// Exigir duas leituras administrativas saudáveis antes de iniciar os casos.
const authDeadline = Date.now() + 15_000;
let healthyReads = 0;
while (Date.now() < authDeadline && healthyReads < 2) {
  try {
    const response = await fetch(`${state.integration.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: state.integration.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${state.integration.SUPABASE_SERVICE_ROLE_KEY}` },
      signal: AbortSignal.timeout(2000),
    });
    healthyReads = response.ok ? healthyReads + 1 : 0;
    await response.body?.cancel();
  } catch { healthyReads = 0; }
  if (healthyReads < 2) await delay(250);
}
if (healthyReads < 2) throw new Error('Auth não conseguiu consultar o banco local; integração não iniciada.');
const port = resources.port;
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', () => reject(new Error(`A porta ${port} está ocupada; não reutilizaremos outro servidor.`)));
  probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});

// As credenciais administrativas pertencem aos fixtures, nunca ao processo Next.
const serverEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(T(?:0[2456789]|1[012])_|SUPABASE_|MEDIA_|FFMPEG_|FFPROBE_|MIGRATION_|SHADOW_)/i.test(key)));
Object.assign(serverEnv, state.runtime, { NODE_ENV: 'production' });
const log = createWriteStream(path.join(resources.directory, 'next-integration.log'), { mode: 0o600 });
const server = spawn(process.execPath, [path.join(webRoot, 'node_modules/next/dist/bin/next'),
  'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: webRoot, env: serverEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.pipe(log, { end: false });
server.stderr.pipe(log, { end: false });
let serverFailure;
server.once('error', error => { serverFailure = error; });
server.once('exit', code => { serverFailure = new Error(`O servidor de integração encerrou (${code}).`); });
let media;
let mediaLog;

try {
  if (withMedia) {
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', () => reject(new Error('A porta 4311 está ocupada; não reutilizaremos outro processo de mídia.')));
      probe.listen(4311, '127.0.0.1', () => probe.close(resolve));
    });
    mediaLog = createWriteStream(path.join(resources.directory, 'media-integration.log'), { mode: 0o600 });
    media = spawn(process.execPath, ['--conditions=react-server', 'scripts/media-worker.mjs', '--manual'], {
      cwd: webRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...serverEnv, ...mediaEnv },
    });
    media.stdout.pipe(mediaLog, { end: false }); media.stderr.pipe(mediaLog, { end: false });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Processo de mídia não ficou pronto.')), 15_000);
      const done = () => { clearTimeout(timer); media.stdout.off('data', ready); };
      const ready = bytes => { if (String(bytes).includes('Processo de mídia local')) { done(); resolve(); } };
      media.stdout.on('data', ready);
      media.once('error', () => { done(); reject(new Error('Não foi possível iniciar mídia.')); });
      media.once('exit', () => { done(); reject(new Error('O processo de mídia encerrou durante inicialização.')); });
    });
  }
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (serverFailure) throw serverFailure;
    try {
      const response = await fetch(state.runtime.APP_ORIGIN, { signal: AbortSignal.timeout(1500) });
      if (response.ok) { ready = true; break; }
    } catch { /* Aguardar somente o servidor iniciado por este processo. */ }
    await delay(250);
  }
  if (!ready) throw new Error('O servidor não ficou pronto; confira next-integration.log.');
  const result = await new Promise((resolve, reject) => {
    const tests = spawn(process.execPath, ['scripts/run-tests.mjs', 'integration'], {
      cwd: webRoot, windowsHide: true, stdio: 'inherit', env: {
        ...process.env, ...state.runtime, ...state.integration, ...mediaEnv,
        ...(withMedia ? { T06_MEDIA_FIXTURES: path.join(resources.directory, 'fixtures') } : {}),
        AUTH_RATE_LIMIT_SECRET: state.runtime.AUTH_RATE_LIMIT_SECRET,
      },
    });
    tests.once('error', reject);
    tests.once('exit', code => resolve(code ?? 1));
  });
  process.exitCode = result;
} finally {
  if (server.exitCode === null) {
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await stopped;
  }
  if (media && media.exitCode === null) {
    const stopped = new Promise(resolve => media.once('exit', resolve));
    media.kill(); await stopped;
  }
  mediaLog?.end();
  log.end();
}
