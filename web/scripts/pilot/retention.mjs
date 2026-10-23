import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, lstat, unlink, rmdir, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { knownLocalLog } from './local-diagnostics.mjs';
import { openJson, decryptComponent } from './archive.mjs';
import { ensurePrivateDirectory, readPrivateJson, backupKey, deleteBackupKey, withMaintenanceLock } from './custody.mjs';
import { runtimeRoot, DAY, listBackupIds, backupLocation, readBackupManifest, withVerifiedBackup,
  createBackupStaging, clearBackupStaging } from './backup-manifest.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function retentionExpired(manifest, now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !['backup', 'export', 'log'].includes(manifest?.kind)) throw new Error('Prazo desconhecido.');
  const start = Date.parse(manifest[manifest.kind === 'backup' ? 'startedAt' : manifest.kind === 'export' ? 'preparedAt' : 'createdAt']);
  const end = Date.parse(manifest.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end !== start + (manifest.kind === 'backup' ? 30 : 7) * DAY) throw new Error('Prazo fora do contrato.');
  return end <= now.getTime();
}
async function exactFiles(directory, known) {
  await ensurePrivateDirectory(directory);
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.length === known.size && entries.every(entry => entry.isFile()
    && !entry.isSymbolicLink() && known.has(entry.name));
}

async function removeBundle(directory, manifest, id, extras = [], removeKey = deleteBackupKey) {
  const names = ['manifest.json', ...extras, ...manifest.components.map(item => item.file)];
  if (!(await exactFiles(directory, new Set(names)))) throw new Error('Entradas desconhecidas preservadas.');
  for (const name of names) {
    if (path.basename(name) !== name || name.endsWith('.partial')) throw new Error('Entrada fora do escopo.');
    const file = path.join(directory, name); const observed = await lstat(file);
    if (!observed.isFile() || observed.isSymbolicLink()) throw new Error('Arquivo desconhecido preservado.');
    await unlink(file);
  }
  await rmdir(directory);
  await removeKey(id);
}

async function expireBackups(now, counts) {
  for (const id of await listBackupIds()) {
    try {
      const manifest = await readBackupManifest(id, { allowExpired: true, now });
      if (!retentionExpired(manifest, now)) continue;
      await withVerifiedBackup(id, async () => removeBundle(backupLocation(id), manifest, id), { allowExpired: true, now });
      counts.backups += 1;
    } catch { counts.preserved += 1; }
  }
}

async function expireExports(now, counts) {
  const parent = path.join(runtimeRoot, 'exports'); await ensurePrivateDirectory(parent);
  for (const entry of await readdir(parent, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !UUID.test(entry.name)) { counts.preserved += 1; continue; }
    const id = entry.name; const directory = path.join(parent, id); let key; let staging; const files = [];
    try {
      key = await backupKey(id);
      const manifest = openJson({ envelope: await readPrivateJson(path.join(directory, 'manifest.json')), key, id, name: 'export-manifest' });
      if (manifest.formatVersion !== 1 || manifest.kind !== 'export' || manifest.id !== id || manifest.protocolId !== id
        || !Array.isArray(manifest.components) || !manifest.components.length || manifest.components.length > 10_000
        || !Number.isFinite(Date.parse(manifest.preparedAt))
        || Date.parse(manifest.expiresAt) !== Date.parse(manifest.preparedAt) + 7 * DAY) throw new Error('Exportação desconhecida.');
      if (!retentionExpired(manifest, now)) continue;
      openJson({ envelope: await readPrivateJson(path.join(directory, 'preparation.json')), key, id, name: 'export-state' });
      if (new Set(manifest.components.map(item => item.file)).size !== manifest.components.length
        || manifest.components.some(item => !/^[a-zA-Z0-9_-]+\.gcm$/.test(item.file ?? ''))) throw new Error('Componentes desconhecidos.');
      if (!(await exactFiles(directory, new Set(['manifest.json', 'preparation.json', ...manifest.components.map(item => item.file)])))) throw new Error('Entradas desconhecidas.');
      staging = await createBackupStaging(id);
      for (const component of manifest.components) {
        const opened = await decryptComponent({ component, key, id, directory, destinationDirectory: staging }); files.push(opened.file);
      }
      await removeBundle(directory, manifest, id, ['preparation.json']); counts.exports += 1;
    } catch { counts.preserved += 1; }
    finally { key?.fill(0); if (staging) await clearBackupStaging(staging, files); }
  }
}

function knownLog(value, id) {
  const names = ['formatVersion', 'kind', 'id', 'createdAt', 'expiresAt', 'code', 'counts'];
  return value?.formatVersion === 1 && value.kind === 'log' && value.id === id
    && Object.keys(value).sort().join() === names.sort().join()
    && /^[A-Z][A-Z0-9_]{0,63}$/.test(value.code) && Number.isFinite(Date.parse(value.createdAt))
    && Date.parse(value.expiresAt) === Date.parse(value.createdAt) + 7 * DAY && value.counts
    && typeof value.counts === 'object' && Object.entries(value.counts).every(([name, count]) =>
      /^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(name) && Number.isSafeInteger(count) && count >= 0);
}

async function expireLogs(now, counts) {
  const directory = path.join(runtimeRoot, 'logs'); await ensurePrivateDirectory(directory);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const id = entry.name.replace(/\.json$/, '');
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json') || !UUID.test(id)) { counts.preserved += 1; continue; }
    try {
      const file = path.join(directory, entry.name); const value = await readPrivateJson(file);
      if (!knownLocalLog(value, id)) throw new Error('Log desconhecido.');
      if (retentionExpired(value, now)) { await unlink(file); counts.logs += 1; }
    } catch { counts.preserved += 1; }
  }
}

export async function maintainLocal(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Instante de manutenção inválido.');
  return withMaintenanceLock(async () => {
    const counts = { backups: 0, exports: 0, logs: 0, preserved: 0 };
    await expireBackups(now, counts); await expireExports(now, counts); await expireLogs(now, counts);
    // Media mode directories belong to lease-aware workers. Unproven abandoned staging stays private.
    const temporary = path.join(runtimeRoot, 'temp'); await ensurePrivateDirectory(temporary);
    for (const entry of await readdir(temporary, { withFileTypes: true })) {
      if (!['development', 'integration'].includes(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) counts.preserved += 1;
    }
    return { status: counts.preserved ? 'PARTIAL' : 'COMPLETE', checkedAt: now.toISOString(), counts,
      pending: counts.preserved ? ['UNKNOWN_OR_INCOMPLETE_ARTIFACTS_PRESERVED'] : [] };
  });
}

/** Test harness: a named, isolated fixture only; never an alternate CLI target. */
export async function maintainDirectory({ directory, now = new Date(), keyForId, deleteKey = async () => {} } = {}) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.split(/[\\/]/).includes('..')
    || path.dirname(directory) !== path.join(runtimeRoot, 'temp')
    || !/^retention-test_[a-f0-9-]{36}$/.test(path.basename(directory))
    || !UUID.test(path.basename(directory).slice('retention-test_'.length))
    || !(now instanceof Date) || !Number.isFinite(now.getTime()) || typeof keyForId !== 'function'
    || typeof deleteKey !== 'function') throw new Error('Fixture de retenção fora do escopo.');
  const observed = await lstat(directory);
  if (!observed.isDirectory() || observed.isSymbolicLink()) throw new Error('Fixture não regular.');
  await ensurePrivateDirectory(directory);
  const counts = { backups: 0, exports: 0, logs: 0, preserved: 0 };
  for (const kind of ['backup', 'export', 'log']) {
    const group = `${kind}s`; const parent = path.join(directory, group);
    try {
      const stat = await lstat(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink()) { counts.preserved += 1; continue; }
    } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      const id = kind === 'log' ? entry.name.replace(/\.json$/, '') : entry.name;
      if (!UUID.test(id) || entry.isSymbolicLink() || (kind === 'log' ? !entry.isFile() || !entry.name.endsWith('.json') : !entry.isDirectory())) {
        counts.preserved += 1; continue;
      }
      let key; let staging; const files = [];
      try {
        const location = path.join(parent, entry.name);
        if (kind === 'log') {
          const value = await readPrivateJson(location);
          if (!knownLog(value, id)) throw new Error('Log desconhecido.');
          if (retentionExpired(value, now)) { await unlink(location); counts.logs += 1; }
          continue;
        }
        key = Buffer.from(await keyForId(id));
        const manifest = openJson({ envelope: await readPrivateJson(path.join(location, 'manifest.json')),
          key, id, name: kind === 'backup' ? 'manifest' : 'export-manifest' });
        if (manifest.formatVersion !== 1 || manifest.id !== id || manifest.kind !== kind || !Array.isArray(manifest.components)
          || !manifest.components.length || new Set(manifest.components.map(item => item.file)).size !== manifest.components.length
          || manifest.components.some(item => !/^[a-zA-Z0-9_-]+\.gcm$/.test(item.file ?? ''))) throw new Error('Conjunto desconhecido.');
        if (!retentionExpired(manifest, now)) continue;
        const extras = kind === 'export' ? ['preparation.json'] : [];
        if (kind === 'export') openJson({ envelope: await readPrivateJson(path.join(location, 'preparation.json')), key, id, name: 'export-state' });
        if (!(await exactFiles(location, new Set(['manifest.json', ...extras, ...manifest.components.map(item => item.file)])))) throw new Error('Entrada desconhecida.');
        staging = path.join(directory, `.verification_${randomUUID()}`);
        await mkdir(staging, { mode: 0o700 }); await ensurePrivateDirectory(staging);
        for (const component of manifest.components) {
          const opened = await decryptComponent({ component, key, id, directory: location, destinationDirectory: staging }); files.push(opened.file);
        }
        await removeBundle(location, manifest, id, extras, deleteKey); counts[group] += 1;
      } catch { counts.preserved += 1; }
      finally { key?.fill(0); if (staging) await clearBackupStaging(staging, files); }
    }
  }
  return { status: counts.preserved ? 'PARTIAL' : 'COMPLETE', checkedAt: now.toISOString(), counts,
    pending: counts.preserved ? ['UNKNOWN_OR_INCOMPLETE_ARTIFACTS_PRESERVED'] : [] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Use retention.mjs sem argumentos.');
    process.stdout.write(`${JSON.stringify(await maintainLocal())}\n`);
  } catch { process.stderr.write('Manutenção local recusada; arquivos não identificados foram preservados.\n'); process.exitCode = 1; }
}
