import path from 'node:path';
import { lstat, readdir, unlink, rmdir, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { pilotResources } from './resources.mjs';
import { sealJson, openJson, decryptComponent } from './archive.mjs';
import { ensurePrivateDirectory, readPrivateJson, writePrivateJson, backupKey } from './custody.mjs';
import { inspectTar } from './backup-tar.mjs';
import { BACKUP_INTERVAL_MS } from './process-contract.mjs';

export const runtimeRoot = pilotResources('integration').directory;
export const DAY = 86_400_000;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const canonicalTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;

/** Pure selection only; callers must separately authenticate the selected bundle. */
export function selectDevelopmentBackup(manifests, now = new Date()) {
  if (!Array.isArray(manifests) || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('BACKUP_REQUIRED');
  const candidates = manifests.filter(value => {
    if (value?.formatVersion !== 1 || value.kind !== 'backup' || !UUID.test(value.id ?? '')
      || value.sourceProject !== 'meumimo-t02' || value.sourceMode !== 'development'
      || value.sourceDatabase !== 'meumimo_t14_dev' || value.sourcePrefix !== 't14-development'
      || !['startedAt', 'consistentAt', 'completedAt', 'expiresAt'].every(key => canonicalTime(value[key]))) return false;
    const [start, cut, end, expiry] = ['startedAt', 'consistentAt', 'completedAt', 'expiresAt'].map(key => Date.parse(value[key]));
    return start <= cut && cut <= end && end <= now.getTime() && expiry > now.getTime() && expiry === start + 30 * DAY;
  }).sort((a, b) => Date.parse(b.consistentAt) - Date.parse(a.consistentAt) || a.id.localeCompare(b.id));
  if (!candidates.length) return null;
  const { id, consistentAt, completedAt, expiresAt } = candidates[0];
  return { id, consistentAt, completedAt, expiresAt };
}

export function backupDue(backup, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('BACKUP_REQUIRED');
  if (!backup || !UUID.test(backup.id ?? '') || !['consistentAt', 'completedAt', 'expiresAt'].every(key => canonicalTime(backup[key]))) return true;
  const cut = Date.parse(backup.consistentAt); const end = Date.parse(backup.completedAt); const expiry = Date.parse(backup.expiresAt);
  return cut > end || end > now.getTime() || expiry <= now.getTime() || now.getTime() - cut >= BACKUP_INTERVAL_MS;
}
export function backupLocation(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new Error('Identificador de backup inválido.');
  return path.join(runtimeRoot, 'backups', id);
}

export async function listBackupIds() {
  const directory = path.join(runtimeRoot, 'backups');
  await ensurePrivateDirectory(directory);
  return (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()
    && !entry.isSymbolicLink() && /^[a-f0-9-]{36}$/.test(entry.name)).map(entry => entry.name);
}

export function assertManifest(value, id, { allowExpired = false, now = new Date() } = {}) {
  if (value?.formatVersion !== 1 || value.id !== id || value.kind !== 'backup' || value.sourceProject !== 'meumimo-t02'
    || !['development', 'integration'].includes(value.sourceMode)
    || value.sourceDatabase !== pilotResources(value.sourceMode).database
    || !/^[a-f0-9]{40}$/.test(value.applicationSha ?? '') || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.applicationBuildId ?? '') || !Array.isArray(value.components)
    || value.components.length !== 16 || value.sourcePrefix !== pilotResources(value.sourceMode).mediaPrefix) throw new Error('Manifesto de backup inválido.');
  const times = ['startedAt', 'consistentAt', 'completedAt', 'expiresAt'].map(name => Date.parse(value[name]));
  if (times.some(time => !Number.isFinite(time)) || times[0] > times[1] || times[1] > times[2]
    || times[3] !== times[0] + 30 * DAY || (!allowExpired && times[3] <= now.getTime())) throw new Error('Prazo de backup inválido.');
  const names = new Set(); const files = new Set();
  for (const component of value.components) {
    if (names.has(component.name) || files.has(component.file) || !/^[a-zA-Z0-9_-]+\.gcm$/.test(component.file ?? '')
      || !/^[a-f0-9]{64}$/.test(component.sha256 ?? '') || !Number.isSafeInteger(component.bytes)
      || component.bytes < 0 || component.encryptedBytes !== component.bytes) throw new Error('Componente de backup inválido.');
    names.add(component.name); files.add(component.file);
  }
  const definitions = [
    ['pgdata', 'db', '/var/lib/postgresql/data', '/var/lib/postgresql'], ['storage', 'storage', '/mnt', '/'],
    ['postgres-config', 'db', '/etc/postgresql', '/etc'], ['pgsodium-key', 'db', '/etc/postgresql-custom/pgsodium_root.key', '/etc/postgresql-custom'],
    ['kong-config', 'kong', '/home/kong/kong.yml', '/home/kong'], ['kong-cert', 'kong', '/home/kong/localhost.crt', '/home/kong'],
    ['kong-key', 'kong', '/home/kong/localhost.key', '/home/kong'],
  ];
  for (const [name, service, sourcePath, restorePath] of definitions) {
    const item = value.components.find(component => component.name === name);
    const inventory = value.components.find(component => component.name === `${name}-inventory`);
    if (!item || item.kind !== 'tar' || item.service !== service || item.sourcePath !== sourcePath
      || item.restorePath !== restorePath || item.tarRoot !== path.posix.basename(sourcePath)
      || !Number.isSafeInteger(item.counts?.files) || item.counts.files < 0
      || !Number.isSafeInteger(item.counts?.bytes) || item.counts.bytes < 0
      || inventory?.kind !== 'inventory' || inventory.for !== name) throw new Error('Componente fora do contrato.');
  }
  for (const name of ['configuration', 'journal']) {
    if (!names.has(name)) throw new Error('Conjunto de backup incompleto.');
  }
  return value;
}

export async function readBackupManifest(id, options) {
  const directory = backupLocation(id);
  if (!(await lstat(directory)).isDirectory()) throw new Error('Backup não disponível.');
  await ensurePrivateDirectory(directory);
  const entries = await readdir(directory);
  if (entries.some(name => name.endsWith('.partial')) || !entries.includes('manifest.json')) throw new Error('Backup não concluído.');
  const key = await backupKey(id);
  try {
    return assertManifest(openJson({ envelope: await readPrivateJson(path.join(directory, 'manifest.json')),
      key, id, name: 'manifest' }), id, options);
  } finally { key.fill(0); }
}

/** Authenticated manifest and exact file inventory; payload authentication remains withVerifiedBackup. */
export async function inspectBackupBundle(id, options) {
  const manifest = await readBackupManifest(id, options);
  const directory = backupLocation(id);
  const known = ['manifest.json', ...manifest.components.map(component => component.file)].sort();
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== known.length || entries.some(entry => !known.includes(entry.name)
    || !entry.isFile() || entry.isSymbolicLink())) throw new Error('Backup contém entradas desconhecidas ou ausentes.');
  const fingerprint = [];
  for (const name of known) {
    const entry = await lstat(path.join(directory, name), { bigint: true });
    if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1n) throw new Error('Backup contém arquivo não regular.');
    fingerprint.push(`${name}:${entry.dev}:${entry.ino}:${entry.size}:${entry.mtimeNs}:${entry.ctimeNs}`);
  }
  const confirmed = (await readdir(directory)).sort();
  if (JSON.stringify(confirmed) !== JSON.stringify(known)) throw new Error('Inventário do backup divergiu.');
  return { manifest, fingerprint: fingerprint.join('|') };
}

export async function writeBackupManifest(manifest, key) {
  assertManifest(manifest, manifest.id);
  await writePrivateJson(path.join(backupLocation(manifest.id), 'manifest.json'),
    sealJson({ value: manifest, key, id: manifest.id, name: 'manifest' }), { exclusive: true });
}

export async function createBackupStaging(id) {
  const directory = path.join(runtimeRoot, 'temp', `backup-${id}-${randomUUID()}`);
  await ensurePrivateDirectory(path.dirname(directory));
  await mkdir(directory, { mode: 0o700 });
  await ensurePrivateDirectory(directory);
  return directory;
}

export async function clearBackupStaging(directory, files) {
  await ensurePrivateDirectory(directory);
  for (const file of files) {
    if (path.dirname(file) !== directory) throw new Error('Temporário fora do escopo.');
    const observed = await lstat(file);
    if (!observed.isFile() || observed.isSymbolicLink()) throw new Error('Temporário não regular.');
    await unlink(file);
  }
  await rmdir(directory);
}

export async function withVerifiedBackup(id, action, options) {
  const { manifest } = await inspectBackupBundle(id, options);
  const directory = backupLocation(id);
  const key = await backupKey(id); const staging = await createBackupStaging(id); const plaintext = new Map();
  try {
    for (const component of manifest.components) {
      const opened = await decryptComponent({ component, key, id, directory, destinationDirectory: staging });
      plaintext.set(component.name, opened.file);
      if (component.kind === 'tar') {
        const inspected = inspectTar(component.tarRoot, async () => {});
        await pipeline(createReadStream(opened.file), inspected.stream, new Writable({ write(chunk, encoding, callback) { callback(); } }));
        const counts = inspected.counts();
        if (counts.files !== component.counts.files || counts.bytes !== component.counts.bytes) throw new Error('Contagem do componente divergiu.');
      }
    }
    return await action({ manifest, plaintext, staging });
  } finally {
    key.fill(0);
    await clearBackupStaging(staging, [...plaintext.values()]);
  }
}
