import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { encryptComponent, decryptComponent, sealJson, openJson } from './archive.mjs';
import { backupKey, custodyRoot, ensurePrivateDirectory, readPrivateJson, withMaintenanceLock } from './custody.mjs';
import { csvExport, exportFingerprint, jsonExport } from './rights-export-data.mjs';
import { exportMedia } from './rights-export-media.mjs';
import { recordRightsEvent, rightsError, rightsId, rightsProtocol, verifyRightsFixtures, withRightsDatabase } from './rights-db.mjs';

const DAY = 86_400_000;
const exportDirectory = id => path.join(custodyRoot, 'exports', id);
const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino;

async function removeOwnedJson(owned) {
  if (!owned) return;
  let observed;
  try { observed = await lstat(owned.filename, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  // Uma colisão ou troca posterior de inode pertence à conferência manual.
  if (observed.isFile() && !observed.isSymbolicLink() && sameFile(owned.identity, observed)) await unlink(owned.filename);
}

/** A identidade vem do handle exclusivo que criou o arquivo, antes da gravação. */
async function writeOwnedJson(filename, value) {
  await ensurePrivateDirectory(path.dirname(filename));
  const bytes = Buffer.from(JSON.stringify(value, null, 2));
  if (bytes.length > 2 * 1024 * 1024) throw rightsError();
  let handle; let owned;
  try {
    handle = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    owned = { filename, identity: await handle.stat({ bigint: true }) };
    if (!owned.identity.isFile()) throw rightsError();
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close(); handle = undefined;
    const observed = await lstat(filename, { bigint: true });
    if (!observed.isFile() || observed.isSymbolicLink() || !sameFile(owned.identity, observed)) throw rightsError();
    return owned;
  } catch (error) {
    await handle?.close().catch(() => {}); handle = undefined;
    await removeOwnedJson(owned);
    throw error;
  } finally { bytes.fill(0); }
}

function publicReport(manifest) {
  return { protocolId: manifest.protocolId, status: 'EXPORT_READY', applied: ['ENCRYPTED_EXPORT_PREPARED'],
    pending: [], counts: manifest.counts, expiresAt: manifest.expiresAt };
}

async function verifyComponents(manifest, key, directory) {
  const staging = await ensurePrivateDirectory(path.join(custodyRoot, 'temp', `rights-${manifest.id}-${randomUUID()}`));
  try {
    for (const component of manifest.components) {
      const opened = await decryptComponent({ component, key, id: manifest.id, directory, destinationDirectory: staging });
      if (path.dirname(opened.file) !== staging || !(await lstat(opened.file)).isFile()) throw rightsError();
      await unlink(opened.file);
    }
  } finally { await rmdir(staging); }
}

export async function existingExport(protocolId) {
  protocolId = rightsId(protocolId);
  const directory = exportDirectory(protocolId);
  let envelope;
  try { envelope = await readPrivateJson(path.join(directory, 'manifest.json')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw rightsError(); }
  const key = await backupKey(protocolId);
  try {
    const manifest = openJson({ envelope, key, id: protocolId, name: 'export-manifest' });
    if (manifest.formatVersion !== 1 || manifest.kind !== 'export' || manifest.id !== protocolId || manifest.protocolId !== protocolId ||
        !Array.isArray(manifest.components) || manifest.components.length < 2 || !Number.isFinite(Date.parse(manifest.preparedAt)) ||
        Date.parse(manifest.expiresAt) !== Date.parse(manifest.preparedAt) + 7 * DAY || Date.parse(manifest.expiresAt) <= Date.now()) throw rightsError();
    const state = openJson({ envelope: await readPrivateJson(path.join(directory, 'preparation.json')), key, id: protocolId, name: 'export-state' });
    if (state.protocolId !== protocolId || !['meumimo_t14', 'meumimo_t14_dev'].includes(state.database) ||
        typeof state.fingerprint !== 'string' || state.expiresAt !== manifest.expiresAt) throw rightsError();
    return { manifest, state, key, directory };
  } catch (error) { key.fill(0); throw error; }
}

async function cachedExport(context, protocol, cached, record = true) {
  try {
    if (cached.state.database !== context.resources.database) throw rightsError();
    await verifyComponents(cached.manifest, cached.key, cached.directory);
    await verifyRightsFixtures(context, protocol.subjectProfileId, protocol.operatorProfileId);
    if (await exportFingerprint(context.database, protocol.subjectProfileId) !== cached.state.fingerprint) throw rightsError();
    if (record) await recordRightsEvent(context, protocol.id, 'EXPORT_READY', cached.manifest.counts);
    return publicReport(cached.manifest);
  } finally { cached.key.fill(0); }
}

export async function exportStatus(context, protocol) {
  try {
    const cached = await existingExport(protocol.id);
    if (cached) return await cachedExport(context, protocol, cached, false);
  } catch { /* Estado desconhecido ou revogado nunca aparece como pronto. */ }
  return { protocolId: protocol.id, status: 'PARTIAL', applied: [], pending: ['EXPORT_UNAVAILABLE'], counts: {} };
}

async function prepareExport(context, protocol) {
  const fixtures = await verifyRightsFixtures(context, protocol.subjectProfileId, protocol.operatorProfileId);
  context.exportIdentity = fixtures.identity;
  const cached = await existingExport(protocol.id);
  if (cached) return cachedExport(context, protocol, cached);
  const directory = await ensurePrivateDirectory(exportDirectory(protocol.id));
  if ((await readdir(directory)).length) throw new Error('Uma preparação anterior de exportação exige conferência local.');
  const key = await backupKey(protocol.id, { create: true });
  const components = []; const counts = { records: 0, files: 0, bytes: 0 };
  let inTransaction = false; let published = false; let stateOwned; let manifestOwned;
  try {
    await context.database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); inTransaction = true;
    const preparedAt = (await context.database.query('SELECT clock_timestamp() AS now')).rows[0].now.toISOString();
    const fingerprint = await exportFingerprint(context.database, protocol.subjectProfileId);
    const input = { key, id: protocol.id, directory };
    components.push({ ...await encryptComponent({ ...input, name: 'records-json',
      source: Readable.from(jsonExport(context, protocol.subjectProfileId, counts)) }), kind: 'json' });
    components.push({ ...await encryptComponent({ ...input, name: 'records-csv',
      source: Readable.from(csvExport(context, protocol.subjectProfileId)) }), kind: 'csv' });
    for await (const component of exportMedia(context, protocol.subjectProfileId, input)) {
      components.push(component);
      if (components.length > 1000) throw new Error('A exportação excedeu o limite do manifesto local.');
    }
    counts.files = components.length;
    counts.bytes = components.reduce((sum, component) => sum + component.bytes, 0);
    if (!Object.values(counts).every(Number.isSafeInteger)) throw rightsError();
    await context.database.query('COMMIT'); inTransaction = false;
    const expiresAt = new Date(Date.parse(preparedAt) + 7 * DAY).toISOString();
    const manifest = { formatVersion: 1, kind: 'export', id: protocol.id, protocolId: protocol.id, preparedAt, expiresAt, components, counts };
    await verifyComponents(manifest, key, directory);
    await verifyRightsFixtures(context, protocol.subjectProfileId, protocol.operatorProfileId);
    if (await exportFingerprint(context.database, protocol.subjectProfileId) !== fingerprint) throw rightsError();
    stateOwned = await writeOwnedJson(path.join(directory, 'preparation.json'), sealJson({ key, id: protocol.id, name: 'export-state',
      value: { formatVersion: 1, protocolId: protocol.id, database: context.resources.database, fingerprint, expiresAt } }));
    manifestOwned = await writeOwnedJson(path.join(directory, 'manifest.json'), sealJson({ key, id: protocol.id, name: 'export-manifest', value: manifest }));
    published = true;
    await recordRightsEvent(context, protocol.id, 'EXPORT_READY', counts);
    return publicReport(manifest);
  } finally {
    if (inTransaction) await context.database.query('ROLLBACK');
    key.fill(0);
    if (!published) {
      await removeOwnedJson(manifestOwned);
      await removeOwnedJson(stateOwned);
      for (const component of components) {
        const file = path.join(directory, component.file);
        if (path.dirname(file) !== directory) throw rightsError();
        const observed = await lstat(file);
        if (!observed.isFile() || observed.isSymbolicLink()) throw rightsError();
        await unlink(file);
      }
    }
  }
}

export async function exportRights(protocolId, options = {}) {
  return withMaintenanceLock(() => withRightsDatabase(options, async context =>
    prepareExport(context, await rightsProtocol(context, protocolId, 'EXPORT'))));
}
