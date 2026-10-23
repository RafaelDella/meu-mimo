import { readState } from '../local-runtime.mjs';
import { assertSnapshot, STALE_MS, ROLES } from './process-contract.mjs';
import { sameProcess } from './process-identity.mjs';
import { pilotRuntimeEnvironment } from './runtime-environment.mjs';
import { listBackupIds, inspectBackupBundle, selectDevelopmentBackup, backupDue } from './backup-manifest.mjs';
import { probeDependencies } from './health-probes.mjs';

const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;
export function evaluateWorkerHealth(child, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('SETUP_REQUIRED');
  if (child?.state === 'stopped') return { component: 'stopped', code: 'WORKER_STALE' };
  if (!child || child.state !== 'running') return { component: 'unavailable', code: 'WORKER_STALE' };
  const heartbeat = child.heartbeat;
  const age = now.getTime() - timestamp(heartbeat?.receivedAt);
  if (!Number.isFinite(age) || age < 0 || age >= STALE_MS) return { component: 'stale', code: 'WORKER_STALE' };
  const round = heartbeat.lastRound;
  if (heartbeat.phase === 'failed' || round?.code === 'FAILED') return { component: 'unavailable', code: 'WORKER_FAILED' };
  if (round && (!Number.isFinite(timestamp(round.completedAt)) || timestamp(round.completedAt) > now.getTime())) return { component: 'stale', code: 'WORKER_STALE' };
  if (heartbeat.phase === 'busy') return { component: 'busy', code: null };
  if (heartbeat.phase === 'idle' && round?.code === 'OK') return { component: 'ready', code: null };
  return { component: 'unavailable', code: 'WORKER_STALE' };
}

async function latestBackup(now) {
  const values = [];
  for (const id of await listBackupIds()) {
    try { values.push((await inspectBackupBundle(id, { now })).manifest); } catch { /* Unknown/incomplete bundles never satisfy health. */ }
  }
  return selectDevelopmentBackup(values, now);
}

export async function localHealth({ snapshot, now = new Date(), signal } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('SETUP_REQUIRED');
  const report = { formatVersion: 1, checkedAt: now.toISOString(), status: 'unavailable',
    components: Object.fromEntries(['postgres', 'auth', 'storage', 'next', 'media', 'outbox'].map(key => [key, 'not_checked'])),
    codes: [], agesMs: { backup: null, outbox: null, media: null, purge: null } };
  if (snapshot === null || snapshot === undefined) { report.status = 'stopped'; return report; }
  try { assertSnapshot(snapshot); }
  catch { report.codes.push('PROCESS_IDENTITY_MISMATCH'); return report; }
  if (snapshot.phase === 'STOPPED') {
    report.status = 'stopped'; for (const role of ROLES) report.components[role] = 'stopped'; return report;
  }
  signal?.throwIfAborted();
  try {
    if (!await sameProcess(snapshot.manager)) throw new Error('PROCESS_IDENTITY_MISMATCH');
  } catch { report.codes.push('PROCESS_IDENTITY_MISMATCH'); return report; }
  if (snapshot.phase === 'DRAINING') {
    report.status = 'degraded'; report.codes.push('WORKER_STALE'); return report;
  }
  if (snapshot.phase === 'MAINTENANCE') {
    report.status = 'maintenance'; report.codes.push('MAINTENANCE');
    for (const role of ROLES) report.components[role] = 'stopped'; return report;
  }
  if (Date.parse(snapshot.updatedAt) > now.getTime()) { report.codes.push('WORKER_STALE'); return report; }
  for (const role of ROLES) {
    const child = snapshot.children[role]; const evaluated = evaluateWorkerHealth(child, now);
    report.components[role] = evaluated.component;
    if (evaluated.code) report.codes.push(evaluated.code);
    if (child?.state === 'running') {
      try { if (!await sameProcess(child.identity)) throw new Error('PROCESS_IDENTITY_MISMATCH'); }
      catch { report.components[role] = 'unavailable'; report.codes.push('PROCESS_IDENTITY_MISMATCH'); }
    }
  }
  let state; let runtime;
  try { state = readState('t14'); runtime = pilotRuntimeEnvironment(state, 'development'); }
  catch { report.codes.push('SETUP_REQUIRED'); report.codes = [...new Set(report.codes)]; return report; }
  const probes = await probeDependencies({ state, runtime, now, signal });
  for (const role of ['postgres', 'auth', 'storage']) report.components[role] = probes.components[role];
  if (probes.components.next !== 'ready') report.components.next = 'unavailable';
  report.codes.push(...probes.codes); Object.assign(report.agesMs, probes.agesMs);
  try {
    const backup = await latestBackup(now);
    if (backup) report.agesMs.backup = now.getTime() - Date.parse(backup.consistentAt);
    if (backupDue(backup, now)) report.codes.push('BACKUP_REQUIRED');
  } catch { report.codes.push('BACKUP_FAILED'); }
  if (snapshot.phase === 'FAILED') report.codes.push('WORKER_FAILED');
  report.codes = [...new Set(report.codes)].sort();
  const dependenciesReady = Object.values(report.components).every(value => ['ready', 'busy'].includes(value));
  report.status = dependenciesReady && !report.codes.length ? 'ready' :
    ['postgres', 'auth', 'storage'].some(key => report.components[key] !== 'ready') ? 'unavailable' : 'degraded';
  return report;
}
