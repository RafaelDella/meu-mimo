import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { readState } from '../local-runtime.mjs';
import { mediaEnvironment } from '../media-environment.mjs';
import { assertSnapshot, assertReceipt } from './process-contract.mjs';
import { sameProcess } from './process-identity.mjs';
import { custodyRoot, readPrivateJson, withMaintenanceLock } from './custody.mjs';
import { pilotRuntimeEnvironment, runtimeEnvironment } from './runtime-environment.mjs';
import { assertSourcePortsFree, assertSourceWritersAbsent, assertLegacyWritersAbsent } from './backup-source.mjs';
import { preparePilotStack } from './inventory.mjs';
import { createBackup } from './backup.mjs';
import { listBackupIds, readBackupManifest, inspectBackupBundle, withVerifiedBackup,
  selectDevelopmentBackup, backupDue } from './backup-manifest.mjs';
import { maintainLocal } from './retention.mjs';
import { localHealth } from './health.mjs';
import { probeDependencies, verifyDevelopment } from './health-probes.mjs';
import { writeLocalLog } from './local-diagnostics.mjs';

export { selectDevelopmentBackup, backupDue } from './backup-manifest.mjs';
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const failure = code => Object.assign(new Error(code), { code });

async function fingerprint(id) {
  const bundle = await inspectBackupBundle(id);
  const entry = await lstat(path.join(custodyRoot, 'keys', `${id}.key`), { bigint: true });
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1n) throw failure('BACKUP_REQUIRED');
  return `${bundle.fingerprint}|key:${entry.dev}:${entry.ino}:${entry.size}:${entry.mtimeNs}:${entry.ctimeNs}`;
}

async function authenticateLatest(now, signal) {
  return withMaintenanceLock(async () => {
    const manifests = [];
    for (const id of await listBackupIds()) {
      signal?.throwIfAborted();
      try { manifests.push(await readBackupManifest(id, { now })); } catch { /* Preserve incomplete/unknown bundles. */ }
    }
    while (manifests.length) {
      const selected = selectDevelopmentBackup(manifests, now); if (!selected) return null;
      try {
        await withVerifiedBackup(selected.id, async () => {}, { now }); signal?.throwIfAborted();
        return { selected, fingerprint: await fingerprint(selected.id) };
      } catch {
        signal?.throwIfAborted();
        manifests.splice(manifests.findIndex(value => value.id === selected.id), 1);
      }
    }
    return null;
  });
}

async function gateOwner(owner, signal, phase) {
  signal?.throwIfAborted();
  if (!uuid(owner)) throw failure('PROCESS_IDENTITY_MISMATCH');
  const snapshot = assertSnapshot(await readPrivateJson(path.join(custodyRoot, 'supervisor.json')));
  if (snapshot.owner !== owner || snapshot.manager.pid !== process.pid || !await sameProcess(snapshot.manager)
    || (phase && snapshot.phase !== phase)) throw failure('PROCESS_IDENTITY_MISMATCH');
  return snapshot;
}

function childEnvironments(state) {
  // Carry only OS launch essentials from the operator's process, then the complete validated runtime.
  const keys = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT',
    'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'HOME', 'LANG', 'TZ'];
  const base = Object.fromEntries(keys.filter(key => typeof process.env[key] === 'string').map(key => [key, process.env[key]]));
  const runtime = runtimeEnvironment(pilotRuntimeEnvironment(state, 'development'), base);
  return { next: { ...runtime }, outbox: { ...runtime },
    media: { ...runtime, ...mediaEnvironment('development', 't14') } };
}

/** Construction is pure; the supervisor serializes these operational callbacks. */
export function createLocalGates() {
  let cached = null; let prepared = false;
  return {
    async preflight({ owner, signal }) {
      try {
        const snapshot = await gateOwner(owner, signal, 'STARTING');
        if (Object.keys(snapshot.children).length) throw failure('PROCESS_IDENTITY_MISMATCH');
        await assertSourcePortsFree(); await assertLegacyWritersAbsent();
        const state = readState('t14'); const runtime = pilotRuntimeEnvironment(state, 'development');
        try { await preparePilotStack({ signal }); } catch { throw failure('STACK_UNAVAILABLE'); }
        const buildId = await verifyDevelopment(state, runtime, signal);
        const probes = await probeDependencies({ state, runtime, signal, includeNext: false });
        if (probes.codes.length) throw failure(probes.codes[0]);
        cached = await authenticateLatest(new Date(), signal);
        prepared = true;
        return { buildId, environments: childEnvironments(state) };
      } catch (error) {
        if (signal?.aborted) throw error;
        throw failure(['STACK_UNAVAILABLE', 'DATABASE_UNAVAILABLE', 'AUTH_UNAVAILABLE', 'STORAGE_UNAVAILABLE',
          'PROCESS_IDENTITY_MISMATCH'].includes(error.code) ? error.code : 'SETUP_REQUIRED');
      }
    },
    async maintenanceDue({ owner, now, signal }) {
      await gateOwner(owner, signal);
      if (!prepared) throw failure('SETUP_REQUIRED');
      if (cached && backupDue(cached.selected, now)) return true;
      if (cached) {
        try { if (await fingerprint(cached.selected.id) === cached.fingerprint) return false; } catch { /* Reauthenticate a changed set. */ }
      }
      cached = await authenticateLatest(now, signal);
      return !cached || backupDue(cached.selected, now);
    },
    async maintain({ owner, signal, receipt }) {
      if (!prepared) throw failure('SETUP_REQUIRED');
      assertReceipt(receipt);
      if (receipt.owner !== owner) throw failure('PROCESS_IDENTITY_MISMATCH');
      await gateOwner(owner, signal, 'MAINTENANCE');
      await assertSourceWritersAbsent(receipt);
      let due = !cached || backupDue(cached.selected);
      if (!due) {
        try { due = await fingerprint(cached.selected.id) !== cached.fingerprint; } catch { due = true; }
      }
      if (due) {
        let report;
        try { report = await createBackup('development', { quiescenceReceipt: receipt }); }
        catch (error) { throw failure(error.code === 'SOURCE_RESTART_PENDING' ? error.code : 'BACKUP_FAILED'); }
        // A receipt expiring after capture admission does not interrupt the cold-copy finally.
        cached = { selected: { id: report.id, consistentAt: report.consistentAt,
          completedAt: report.completedAt, expiresAt: report.expiresAt }, fingerprint: await fingerprint(report.id) };
      }
      if (!cached || backupDue(cached.selected)) throw failure('BACKUP_FAILED');
      const retention = await maintainLocal();
      await writeLocalLog({ code: 'LOCAL_MAINTENANCE_COMPLETE', counts: retention.counts });
      return { code: 'LOCAL_MAINTENANCE_COMPLETE',
        backup: { id: cached.selected.id, consistentAt: cached.selected.consistentAt },
        retention: { status: retention.status, counts: retention.counts } };
    },
    health: localHealth,
  };
}
