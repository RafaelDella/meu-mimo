import path from 'node:path';
import { mkdir, unlink } from 'node:fs/promises';
import { Readable, PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pilotResources } from './resources.mjs';
import { encryptComponent, decryptComponent } from './archive.mjs';
import { backupEngine, containerRoute } from './backup-streams.mjs';
import { inspectTar } from './backup-tar.mjs';
import { ensurePrivateDirectory, readPrivateJson, writePrivateJson, withMaintenanceLock, backupKey } from './custody.mjs';
import { snapshotJournal } from './journal.mjs';
import { assertSourceWritersAbsent, inspectSource, sourceMetadata, applicationMetadata, stopSource, restartSource } from './backup-source.mjs';
import { backupLocation, writeBackupManifest, withVerifiedBackup, DAY, createBackupStaging, clearBackupStaging } from './backup-manifest.mjs';

const definitions = [
  ['pgdata', 'db', '/var/lib/postgresql/data', '/var/lib/postgresql'],
  ['storage', 'storage', '/mnt', '/'],
  ['postgres-config', 'db', '/etc/postgresql', '/etc'],
  ['pgsodium-key', 'db', '/etc/postgresql-custom/pgsodium_root.key', '/etc/postgresql-custom'],
  ['kong-config', 'kong', '/home/kong/kong.yml', '/home/kong'],
  ['kong-cert', 'kong', '/home/kong/localhost.crt', '/home/kong'],
  ['kong-key', 'kong', '/home/kong/localhost.key', '/home/kong'],
];

async function captureTar(engine, snapshots, definition, input) {
  const [name, service, filename, restorePath] = definition;
  const container = snapshots.find(item => item.service === service).container;
  const current = await engine.request('GET', `${containerRoute(container.Id)}/json`);
  if (current.State.Running) throw new Error('O arquivo só pode ser capturado com a origem parada.');
  const records = new PassThrough();
  const recordPromise = encryptComponent({ ...input, source: records, name: `${name}-inventory` });
  recordPromise.catch(() => {});
  const inspected = inspectTar(path.posix.basename(filename), record => new Promise((resolve, reject) => {
    records.write(`${JSON.stringify(record)}\n`, error => error ? reject(error) : resolve());
  }));
  let transfer;
  try {
    const source = await engine.getArchive(container.Id, filename);
    transfer = pipeline(source, inspected.stream); transfer.catch(() => {});
    const component = await encryptComponent({ ...input, source: inspected.stream, name });
    await transfer; records.end();
    const inventory = await recordPromise;
    return [{ ...component, kind: 'tar', service, sourcePath: filename, restorePath,
      tarRoot: path.posix.basename(filename), counts: inspected.counts() }, { ...inventory, kind: 'inventory', for: name }];
  } catch (error) {
    inspected.stream.destroy(); records.destroy(error);
    await Promise.allSettled([recordPromise, transfer]);
    throw error;
  }
}

async function verifyCaptured(components, input) {
  const staging = await createBackupStaging(input.id); const files = [];
  try {
    for (const component of components) {
      const result = await decryptComponent({ ...input, component, destinationDirectory: staging });
      files.push(result.file);
    }
  } finally { await clearBackupStaging(staging, files); }
}

async function capture(mode) {
  if (!['development', 'integration'].includes(mode)) throw new Error('Backup aceita development ou integration.');
  const resources = pilotResources(mode); const id = randomUUID(); const startedAt = new Date().toISOString();
  await assertSourceWritersAbsent();
  const engine = await backupEngine(); const snapshots = await inspectSource(engine);
  const metadata = await sourceMetadata(mode, snapshots); const application = await applicationMetadata();
  const directory = backupLocation(id); await ensurePrivateDirectory(path.dirname(directory));
  await mkdir(directory, { mode: 0o700 }); await ensurePrivateDirectory(directory);
  const marker = path.join(directory, 'capture.partial');
  await writePrivateJson(marker, { formatVersion: 1, id, startedAt }, { exclusive: true });
  const key = await backupKey(id, { create: true }); const stopped = [];
  try {
    await stopSource(engine, snapshots, stopped);
    const consistentAt = new Date().toISOString(); const journal = await snapshotJournal({ consistentAt });
    const input = { key, id, directory }; const components = [];
    for (const definition of definitions) components.push(...await captureTar(engine, snapshots, definition, input));
    const configuration = { formatVersion: 1, mode, sourceDatabase: resources.database,
      containers: snapshots.map(({ service, container }) => ({ service, image: container.Image, config: container.Config })),
      sourceState: await readPrivateJson(path.join(resources.directory, 'integration.json')) };
    for (const [name, value] of [['configuration', configuration], ['journal', journal]]) {
      const bytes = Buffer.from(JSON.stringify(value));
      if (bytes.length > 1024 * 1024) throw new Error('Metadados da captura excederam o limite.');
      try { components.push({ ...await encryptComponent({ ...input, name, source: Readable.from([bytes]) }), kind: 'json' }); }
      finally { bytes.fill(0); }
    }
    await verifyCaptured(components, input);
    const manifest = { formatVersion: 1, kind: 'backup', id, sourceProject: resources.project,
      sourceMode: mode, sourceDatabase: resources.database, sourcePrefix: resources.mediaPrefix,
      ...application, databaseMigrations: metadata.migrations, fingerprints: metadata.fingerprints, counts: metadata.counts,
      imageDigests: Object.fromEntries(snapshots.map(item => [item.service, item.container.Image])),
      startedAt, consistentAt, completedAt: new Date().toISOString(), expiresAt: new Date(Date.parse(startedAt) + 30 * DAY).toISOString(), components };
    await writeBackupManifest(manifest, key);
    await unlink(marker);
    await withVerifiedBackup(id, async () => {});
    return { id, status: 'COMPLETE', startedAt, consistentAt, completedAt: manifest.completedAt,
      expiresAt: manifest.expiresAt, counts: { components: components.length, bytes: components.reduce((sum, item) => sum + item.bytes, 0) } };
  } finally {
    key.fill(0);
    await restartSource(engine, stopped);
  }
}

export async function createBackup(mode = 'development') {
  return withMaintenanceLock(() => capture(mode));
}

export async function verifyBackup(id) {
  return withVerifiedBackup(id, async ({ manifest }) => manifest);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2] ?? 'development';
    if (process.argv.length > 3 || !['development', 'integration'].includes(mode)) throw new Error('Modo inválido.');
    process.stdout.write(`${JSON.stringify(await createBackup(mode))}\n`);
  } catch { process.stderr.write('Captura local recusada; confira a origem e a custódia.\n'); process.exitCode = 1; }
}
