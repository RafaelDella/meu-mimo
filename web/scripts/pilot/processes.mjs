import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { HEARTBEAT_MS, STALE_MS, BACKUP_INTERVAL_MS, DRAIN_TIMEOUT_MS, ROLES, HEALTH_CODES,
  assertParentMessage, assertWorkerMessage, assertSnapshot } from './process-contract.mjs';
import { observeProcess, sameProcess } from './process-identity.mjs';
import { claimSupervisor, publishSupervisor, releaseSupervisor, readSupervisor, postStopRequest,
  hasStopRequest, assertPortFree, assertRuntimePortsFree } from './process-custody.mjs';
import { assertPilotRuntime, runtimeEnvironment } from './runtime-environment.mjs';

export { readSupervisor } from './process-custody.mjs';
const webRoot = fileURLToPath(new URL('../../', import.meta.url));
const entrypoints = { next: 'scripts/pilot/next-host.mjs', media: 'scripts/media-worker.mjs', outbox: 'scripts/outbox-worker.mjs' };
const statuses = { STARTING: 'starting', READY: 'ready', MAINTENANCE: 'maintenance',
  DRAINING: 'stopping', STOPPED: 'stopped', FAILED: 'failed' };
const failure = code => Object.assign(new Error(code), { code });
const safeError = caught => failure([...HEALTH_CODES, 'LOCAL_ALREADY_RUNNING', 'LOCAL_OWNERSHIP_CONFLICT',
  'LOCAL_CHILD_STILL_RUNNING', 'LOCAL_PORT_IN_USE', 'PROCESS_IDENTITY_UNAVAILABLE', 'PROCESS_IDENTITY_UNSTABLE',
  'PROCESS_CONTRACT_INVALID', 'PROCESS_IPC_INVALID', 'WORKER_BOOT_TIMEOUT', 'SOURCE_RESTART_PENDING',
  'LOCAL_DIAGNOSTICS_FAILED'].includes(caught?.code) ? caught.code : 'LOCAL_FAILED');
const clone = value => structuredClone(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

function validLaunch(value) {
  if (!value || typeof value.buildId !== 'string' || !value.buildId.length || value.buildId.length > 256
    || !value.environments || Object.keys(value.environments).length !== ROLES.length) throw failure('SETUP_REQUIRED');
  for (const role of ROLES) {
    const environment = value.environments[role];
    if (!environment || typeof environment !== 'object' || Array.isArray(environment)
      || Object.values(environment).some(item => typeof item !== 'string')) throw failure('SETUP_REQUIRED');
    assertPilotRuntime(environment, 'development');
  }
  return value;
}
function validMaintenance(value) {
  const age = Date.now() - Date.parse(value?.backup?.consistentAt);
  const counts = value?.retention?.counts;
  if (value?.code !== 'LOCAL_MAINTENANCE_COMPLETE' || !uuid(value?.backup?.id)
    || !Number.isFinite(age) || age < 0 || age >= BACKUP_INTERVAL_MS
    || !['COMPLETE', 'PARTIAL'].includes(value?.retention?.status) || !counts
    || Object.keys(counts).length !== 4 || !['backups', 'exports', 'logs', 'preserved']
      .every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0)) throw failure('BACKUP_REQUIRED');
}
function readyReport(value) {
  return value?.formatVersion === 1 && value.status === 'ready' && Array.isArray(value.codes) && !value.codes.length
    && ['postgres', 'auth', 'storage', 'next', 'media', 'outbox']
      .every(key => ['ready', 'busy'].includes(value.components?.[key]));
}
const backupCodes = ['BACKUP_REQUIRED', 'BACKUP_FAILED'];
const backupBlocked = value => value?.codes?.some(code => backupCodes.includes(code))
  && value.codes.every(code => backupCodes.includes(code))
  && ['postgres', 'auth', 'storage', 'next', 'media', 'outbox']
    .every(key => ['ready', 'busy'].includes(value.components?.[key]));
const healthFailure = value => value?.codes?.find(code => HEALTH_CODES.includes(code) && !backupCodes.includes(code))
  ?? value?.codes?.find(code => HEALTH_CODES.includes(code)) ?? 'WORKER_FAILED';

/** Testable observation only; the CLI always supplies the real custody and native process observers. */
export async function observeStopCompletion(expected, { readSnapshot, sameProcess: matches }) {
  const read = async () => {
    const value = await readSnapshot();
    if (!value || value.owner !== expected.owner || !['pid', 'creationTime', 'executable']
      .every(key => value.manager?.[key] === expected.manager[key])) throw failure('LOCAL_OWNERSHIP_CONFLICT');
    return clone(assertSnapshot(value));
  };
  let current = await read();
  if (current.phase === 'FAILED') return 'pending';
  if (current.phase !== 'STOPPED') {
    if (await matches(expected.manager)) return 'waiting';
    // Windows observation can overlap the manager's final publication and exit.
    current = await read();
  }
  if (current.phase !== 'STOPPED') return 'pending';
  for (const entry of Object.values(current.children)) if (await matches(entry.identity)) return 'pending';
  const confirmed = await read();
  const identities = value => Object.entries(value.children).sort(([left], [right]) => left.localeCompare(right))
    .map(([role, entry]) => [role, entry.identity.pid, entry.identity.creationTime, entry.identity.executable]);
  return confirmed.phase === 'STOPPED' && JSON.stringify(identities(confirmed)) === JSON.stringify(identities(current))
    ? 'stopped' : 'pending';
}

export async function requestStop() {
  const snapshot = await readSupervisor();
  if (snapshot === null) return { code: 'LOCAL_ALREADY_STOPPED' };
  const io = { readSnapshot: readSupervisor, sameProcess };
  if (snapshot.phase === 'STOPPED') {
    const state = await observeStopCompletion(snapshot, io);
    return { code: state === 'stopped' ? 'LOCAL_ALREADY_STOPPED' : 'LOCAL_STOP_PENDING' };
  }
  try { await postStopRequest(snapshot); }
  catch (caught) {
    if (await observeStopCompletion(snapshot, io) === 'stopped') return { code: 'LOCAL_STOPPED' };
    throw caught;
  }
  const deadline = performance.now() + 2 * DRAIN_TIMEOUT_MS + 10_000;
  while (performance.now() < deadline) {
    const state = await observeStopCompletion(snapshot, io);
    if (state !== 'waiting') return { code: state === 'stopped' ? 'LOCAL_STOPPED' : 'LOCAL_STOP_PENDING' };
    await delay(1_000);
  }
  return { code: 'LOCAL_STOP_PENDING' };
}

/** Foreground lifecycle. Operational gates remain the sole owner of DB/Docker/backup work. */
export async function runSupervisor({ gates, onStatus = () => {}, onDiagnostic } = {}) {
  if (!gates || ['preflight', 'maintenanceDue', 'maintain', 'health'].some(name => typeof gates[name] !== 'function')
    || typeof onStatus !== 'function' || (onDiagnostic !== undefined && typeof onDiagnostic !== 'function')) {
    throw failure('SETUP_REQUIRED');
  }
  const manager = await observeProcess(process.pid);
  if (!manager) throw failure('PROCESS_IDENTITY_MISMATCH');
  const snapshot = await claimSupervisor(manager);
  const controller = new AbortController(); const runtimes = new Map(); const diagnostics = new Set();
  let stopWanted = false; let fatal; let controlBusy = false; let controlTask = Promise.resolve();
  const context = () => ({ owner: snapshot.owner, signal: controller.signal });
  const markFatal = error => { fatal ??= safeError(error); controller.abort(); };
  const stop = () => { stopWanted = true; controller.abort(); };
  const phase = value => { snapshot.phase = value; snapshot.status = statuses[value]; snapshot.maintenance = null; };
  const persist = async () => { snapshot.updatedAt = new Date().toISOString(); await publishSupervisor(clone(snapshot)); };
  const emit = async (code, origin) => {
    try { await onStatus({ code, ...(origin ? { origin } : {}) }); }
    catch { markFatal(failure('LOCAL_DIAGNOSTICS_FAILED')); }
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const controlTimer = setInterval(() => {
    if (controlBusy) return;
    controlBusy = true;
    controlTask = hasStopRequest(snapshot.owner).then(requested => { if (requested) stop(); })
      .catch(markFatal).finally(() => { controlBusy = false; });
  }, 1_000);

  function consumeOutput(stream, collect) {
    let pending = ''; let discarded = false;
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      if (!collect || !onDiagnostic) return;
      const parts = chunk.split('\n');
      for (let index = 0; index < parts.length; index += 1) {
        if (Buffer.byteLength(pending) + Buffer.byteLength(parts[index]) > 4096) discarded = true;
        if (!discarded) pending += parts[index];
        if (index === parts.length - 1) continue;
        if (!discarded && diagnostics.size < 16) {
          try {
            const value = JSON.parse(pending);
            if (value && Object.keys(value).length === 5 && ['route', 'result', 'status', 'durationMs', 'correlationId']
              .every(key => Object.hasOwn(value, key))) {
              const operation = Promise.resolve().then(() => onDiagnostic(value)).catch(() => {
                markFatal(failure('LOCAL_DIAGNOSTICS_FAILED'));
              }).finally(() => diagnostics.delete(operation));
              diagnostics.add(operation);
            }
          } catch { /* Only an exact bounded diagnostic envelope can leave the pipe. */ }
        }
        pending = ''; discarded = false;
      }
    });
  }
  async function startRole(role, environment) {
    if (stopWanted || fatal) return;
    if (role === 'next') await assertPortFree(4301);
    if (role === 'media') await assertPortFree(4311);
    const env = { ...(role === 'media' ? environment : runtimeEnvironment(environment, environment)), NODE_ENV: 'production' };
    assertPilotRuntime(env, 'development');
    const child = spawn(process.execPath, ['--conditions=react-server', entrypoints[role]],
      { cwd: webRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const runtime = { child, exited: false, identity: null, startedAt: performance.now(), lastSeen: null, stopping: false };
    runtimes.set(role, runtime);
    consumeOutput(child.stdout, true); consumeOutput(child.stderr, false);
    child.on('error', () => {
      runtime.exited ||= !child.pid;
      if (!runtime.stopping && runtimes.get(role) === runtime) markFatal(failure('WORKER_FAILED'));
    });
    child.on('exit', () => {
      runtime.exited = true;
      if (snapshot.children[role]) snapshot.children[role].state = 'stopped';
      if (!runtime.stopping && !stopWanted) markFatal(failure('WORKER_FAILED'));
    });
    child.on('message', raw => {
      if (runtime.exited || runtimes.get(role) !== runtime) return;
      try {
        const message = assertWorkerMessage(raw); const entry = snapshot.children[role];
        if (!entry || message.owner !== snapshot.owner || message.role !== role || message.pid !== child.pid
          || message.sequence <= (entry.heartbeat?.sequence ?? 0)) throw failure('PROCESS_IPC_INVALID');
        runtime.lastSeen = performance.now();
        entry.heartbeat = { receivedAt: new Date().toISOString(), sequence: message.sequence,
          phase: message.phase, lastRound: message.lastRound };
        if (message.type === 'HEARTBEAT' && !runtime.stopping && !runtime.exited) entry.state = 'running';
      } catch { markFatal(failure('PROCESS_IPC_INVALID')); }
    });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', () => reject(failure('WORKER_FAILED'))); });
    runtime.identity = await observeProcess(child.pid);
    if (!runtime.identity || runtime.exited) {
      if (stopWanted && runtime.exited) return;
      throw failure('PROCESS_IDENTITY_MISMATCH');
    }
    snapshot.children[role] = { identity: runtime.identity, state: 'starting', heartbeat: null };
    await persist();
    if (stopWanted || fatal) return;
    await new Promise((resolve, reject) => child.send(assertParentMessage({ formatVersion: 1, type: 'BOOT',
      owner: snapshot.owner, role }), error => error ? reject(failure('PROCESS_IPC_INVALID')) : resolve()));
  }
  function checkChildren() {
    if (fatal) throw fatal;
    for (const runtime of runtimes.values()) {
      if (runtime.exited) throw failure('WORKER_FAILED');
      if (performance.now() - (runtime.lastSeen ?? runtime.startedAt) >= STALE_MS) throw failure('WORKER_STALE');
    }
  }
  async function stopRoles(roles) {
    for (const role of roles) {
      const runtime = runtimes.get(role); if (!runtime || runtime.exited) continue;
      runtime.stopping = true;
      if (snapshot.children[role]) snapshot.children[role].state = 'stopping';
      try {
        if (runtime.identity && await sameProcess(runtime.identity) && runtime.child.connected) {
          await new Promise(resolve => runtime.child.send(assertParentMessage({ formatVersion: 1, type: 'STOP',
            owner: snapshot.owner }), () => resolve()));
        }
      } catch { fatal ??= failure('PROCESS_IDENTITY_MISMATCH'); }
    }
    const deadline = performance.now() + DRAIN_TIMEOUT_MS; let timedOut = false;
    while (roles.some(role => runtimes.has(role) && !runtimes.get(role).exited)) {
      if (!timedOut && performance.now() >= deadline) {
        timedOut = true; fatal ??= failure('DRAIN_TIMEOUT'); phase('FAILED');
        try { await persist(); } catch (caught) { markFatal(caught); }
        await emit('LOCAL_FAILED');
      }
      await delay(1_000);
    }
  }
  async function drain() {
    phase('DRAINING');
    try { await persist(); } catch (caught) { markFatal(caught); }
    await stopRoles(['next']); await stopRoles(['media', 'outbox']);
    await Promise.all(diagnostics);
    try { await persist(); } catch (caught) { markFatal(caught); }
  }
  async function maintenance() {
    await emit('LOCAL_MAINTENANCE');
    if (runtimes.size) await drain();
    if (stopWanted || fatal) return;
    await assertRuntimePortsFree(); phase('MAINTENANCE');
    const issuedAt = new Date().toISOString();
    snapshot.maintenance = { formatVersion: 1, owner: snapshot.owner, operationId: randomUUID(), kind: 'BACKUP',
      manager, issuedAt, expiresAt: new Date(Date.parse(issuedAt) + 60_000).toISOString() };
    await persist(); validMaintenance(await gates.maintain({ ...context(), receipt: clone(snapshot.maintenance) }));
    phase('STARTING'); await persist();
  }
  async function launch(value) {
    runtimes.clear(); await persist();
    for (const role of ['media', 'outbox', 'next']) await startRole(role, value.environments[role]);
    if (stopWanted) return;
    const deadline = performance.now() + 90_000; let report;
    while (!stopWanted && performance.now() < deadline) {
      checkChildren(); await persist();
      report = await gates.health({ snapshot: clone(snapshot), now: new Date(), signal: controller.signal });
      if (readyReport(report)) { phase('READY'); await persist(); await emit('LOCAL_READY', 'http://127.0.0.1:4301'); return report; }
      if (backupBlocked(report)) return report;
      await delay(500, undefined, { signal: controller.signal }).catch(() => {});
    }
    if (!stopWanted) throw failure(report ? healthFailure(report) : 'NEXT_UNAVAILABLE');
  }
  async function boot(value, retryBackup = true) {
    let report = await launch(value);
    if (!stopWanted && !fatal && backupBlocked(report) && retryBackup) {
      await gates.maintenanceDue({ ...context(), now: new Date() });
      await maintenance(); if (!stopWanted && !fatal) report = await launch(value);
    }
    if (!stopWanted && !fatal && backupBlocked(report)) throw failure('BACKUP_FAILED');
  }
  let terminal;
  try {
    await emit('LOCAL_STARTING');
    const launchConfiguration = validLaunch(await gates.preflight(context()));
    if (!stopWanted) await maintenance();
    if (!stopWanted && !fatal) await boot(launchConfiguration);
    let nextCheck = performance.now() + HEARTBEAT_MS;
    while (!stopWanted) {
      checkChildren(); await persist();
      if (performance.now() >= nextCheck) {
        const report = await gates.health({ snapshot: clone(snapshot), now: new Date(), signal: controller.signal });
        if (!readyReport(report) && !backupBlocked(report)) throw failure(healthFailure(report));
        const due = await gates.maintenanceDue({ ...context(), now: new Date() });
        if (due || backupBlocked(report)) {
          await maintenance(); if (!stopWanted && !fatal) await boot(launchConfiguration, !backupBlocked(report));
        }
        nextCheck = performance.now() + HEARTBEAT_MS;
      }
      await delay(1_000, undefined, { signal: controller.signal }).catch(() => {});
    }
  } catch (caught) {
    if (fatal || !stopWanted || caught?.name !== 'AbortError') terminal = fatal ?? safeError(caught);
  }
  try {
    await emit('LOCAL_STOPPING'); await drain(); terminal ??= fatal;
    phase(terminal ? 'FAILED' : 'STOPPED'); await releaseSupervisor(clone(snapshot));
    await emit(terminal ? 'LOCAL_FAILED' : 'LOCAL_STOPPED');
    terminal ??= fatal;
  } finally {
    clearInterval(controlTimer); await controlTask;
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
  }
  if (terminal) throw terminal;
  return { code: 'LOCAL_STOPPED' };
}
