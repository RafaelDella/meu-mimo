import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readState, webRoot } from '../local-runtime.mjs';
import { mediaEnvironment } from '../media-environment.mjs';
import { runtimeEnvironment, pilotRuntimeEnvironment } from './runtime-environment.mjs';
import { ensurePrivateDirectory, custodyRoot } from './custody.mjs';
import { pilotResources } from './resources.mjs';

async function available(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer(); probe.once('error', () => reject(new Error(`A porta ${port} está ocupada.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
export function assertTestFiles(args) {
  const files = ['cycle.spec.ts', 'privacy.spec.ts', 'recovery.spec.ts', 'performance.spec.ts'];
  if (!Array.isArray(args) || args.length > files.length || new Set(args).size !== args.length ||
      args.some(value => !files.includes(value))) throw new Error('Filtro de QA inválido.');
}

export async function stopTestChild(child) {
  if (!child.pid || child.startFailed || child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill(); await stopped;
}
export async function withTestRuntime(operation, { mode = 'integration', manual = false } = {}) {
  if (!['integration', 'restore'].includes(mode) || typeof operation !== 'function') throw new Error('Runtime de ensaio inválido.');
  const state = readState('t14', mode); const resources = pilotResources(mode);
  await ensurePrivateDirectory(path.join(custodyRoot, 'reports', 'browser'));
  await available(resources.nextPort); await available(resources.mediaPort);
  const runtime = { ...runtimeEnvironment(pilotRuntimeEnvironment(state, mode)), NODE_ENV: 'production' };
  const children = [];
  const start = (argv, env) => {
    const child = spawn(process.execPath, argv, { cwd: webRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    // Operational diagnostics are codes only. Browser evidence stays in private reports/.
    child.stdout.resume(); child.stderr.resume();
    child.once('error', () => { child.startFailed = true; }); children.push(child); return child;
  };
  try {
    start(['--conditions=react-server', 'scripts/media-worker.mjs', ...(manual ? ['--manual'] : [])], { ...runtime, ...mediaEnvironment(mode, 't14') });
    if (!manual) start(['--conditions=react-server', 'scripts/outbox-worker.mjs'], runtime);
    start(['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(resources.nextPort)], runtime);
    const deadline = Date.now() + 30_000; let ready = false;
    while (Date.now() < deadline) {
      if (children.some(child => child.startFailed || child.exitCode !== null)) throw new Error('Um processo de QA não iniciou.');
      try {
        const response = await fetch(`${state.runtime.APP_ORIGIN}/conta`, { signal: AbortSignal.timeout(1000) });
        ready = response.ok; await response.body?.cancel(); if (ready) break;
      } catch { /* Wait only for the child created above. */ }
      await delay(250);
    }
    if (!ready) throw new Error('A aplicação de QA não ficou pronta.');
    return await operation({ state, resources, runtime });
  } finally {
    for (const child of children.reverse()) await stopTestChild(child);
  }
}

export async function testWeb(args = []) {
  assertTestFiles(args);
  return withTestRuntime(async ({ state }) => {
    const tests = spawn(process.execPath, ['--conditions=react-server', 'node_modules/@playwright/test/cli.js', 'test', '--config=playwright.pilot.config.ts', ...args], {
      cwd: webRoot, windowsHide: true, stdio: 'inherit', env: { ...process.env, ...state.runtime, ...state.integration,
        ...mediaEnvironment('integration', 't14'), T06_MEDIA_FIXTURES: path.join(custodyRoot, 'fixtures'),
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --conditions=react-server`.trim() },
    });
    return await new Promise((resolve, reject) => { tests.once('error', reject); tests.once('exit', code => resolve(code ?? 1)); });
  });
}
