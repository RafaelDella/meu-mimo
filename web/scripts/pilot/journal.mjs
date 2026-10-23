import { readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { sealJson, openJson } from './archive.mjs';
import { custodyRoot, ensurePrivateDirectory, backupKey, readPrivateJson, writePrivateJson } from './custody.mjs';
import { withRightsOperator } from '../check-rights-migration-helpers.mjs';

const journalId = '31768f63-53ea-4ff3-b112-746766c40f22';
const directory = path.join(custodyRoot, 'rights', 'journal');
const checkpointPath = path.join(custodyRoot, 'keys', 'journal-checkpoint.json');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fields = ['database', 'protocolId', 'subjectProfileId', 'operatorProfileId', 'requestDigest', 'verifiedAt', 'createdAt'];
const invalid = () => new Error('Journal de supressões inválido; o acesso deve permanecer fechado.');
const digest = entry => createHash('sha256').update(JSON.stringify(entry)).digest('hex');

export function validateJournalEntry(value) {
  if (!value || Object.keys(value).sort().join() !== [...fields].sort().join() ||
      !['meumimo_t14', 'meumimo_t14_dev'].includes(value.database) ||
      ['protocolId', 'subjectProfileId', 'operatorProfileId'].some(field => !UUID.test(value[field])) ||
      !/^[a-f0-9]{64}$/.test(value.requestDigest) ||
      ['verifiedAt', 'createdAt'].some(field => !Number.isFinite(Date.parse(value[field])) || new Date(value[field]).toISOString() !== value[field]) ||
      Date.parse(value.verifiedAt) > Date.parse(value.createdAt)) throw invalid();
  return Object.fromEntries(fields.map(field => [field, value[field]]));
}

async function entriesOnDisk() {
  await ensurePrivateDirectory(directory);
  const files = await readdir(directory, { withFileTypes: true });
  if (files.some(file => !file.isFile() || !UUID.test(file.name.replace(/\.json$/, '')) || !file.name.endsWith('.json'))) throw invalid();
  return files.map(file => file.name).sort();
}

export function verifyJournalInventory(checkpoint, values) {
  if (checkpoint?.formatVersion !== 1 || !UUID.test(checkpoint.generation) || !Array.isArray(checkpoint.entries) || !Array.isArray(values) ||
      checkpoint.entries.length !== values.length || new Set(checkpoint.entries.map(entry => entry.protocolId)).size !== values.length ||
      checkpoint.entries.some(entry => !UUID.test(entry.protocolId) || !/^[a-f0-9]{64}$/.test(entry.sha256))) throw invalid();
  const entries = values.map(validateJournalEntry);
  if (new Set(entries.map(entry => entry.protocolId)).size !== values.length || entries.some(entry =>
    !checkpoint.entries.some(item => item.protocolId === entry.protocolId && item.sha256 === digest(entry)))) throw invalid();
  return entries;
}

export async function readJournal() {
  const files = await entriesOnDisk();
  let checkpoint; let key;
  try {
    const envelope = await readPrivateJson(checkpointPath);
    key = await backupKey(journalId);
    checkpoint = openJson({ envelope, key, id: journalId, name: 'journal-checkpoint' });
  } catch (error) {
    if (error.code !== 'ENOENT' || files.length) throw invalid();
    try { await backupKey(journalId); throw invalid(); }
    catch (missing) { if (missing.code !== 'ENOENT') throw invalid(); }
    key = await backupKey(journalId, { create: true });
    checkpoint = { formatVersion: 1, generation: randomUUID(), entries: [] };
    await writePrivateJson(checkpointPath, sealJson({ value: checkpoint, key, id: journalId, name: 'journal-checkpoint' }), { exclusive: true });
  }
  if (checkpoint?.formatVersion !== 1 || !UUID.test(checkpoint.generation) || !Array.isArray(checkpoint.entries) ||
      checkpoint.entries.length !== files.length || new Set(checkpoint.entries.map(entry => entry.protocolId)).size !== files.length ||
      checkpoint.entries.some(entry => !UUID.test(entry.protocolId) || !/^[a-f0-9]{64}$/.test(entry.sha256))) throw invalid();
  const entries = [];
  for (const file of files) {
    const entry = validateJournalEntry(openJson({ envelope: await readPrivateJson(path.join(directory, file)), key, id: journalId, name: 'suppression' }));
    if (file !== `${entry.protocolId}.json` || !checkpoint.entries.some(item => item.protocolId === entry.protocolId && item.sha256 === digest(entry))) throw invalid();
    entries.push(entry);
  }
  verifyJournalInventory(checkpoint, entries);
  key.fill(0);
  return { formatVersion: 1, generation: checkpoint.generation, entries };
}

/** Persist the minimum erasure intent BEFORE any destructive effect in the live DB. */
export async function appendSuppression(value) {
  const entry = validateJournalEntry(value);
  const current = await readJournal();
  const existing = current.entries.find(item => item.protocolId === entry.protocolId);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(entry)) throw invalid();
    return existing;
  }
  const key = await backupKey(journalId);
  await writePrivateJson(path.join(directory, `${entry.protocolId}.json`),
    sealJson({ value: entry, key, id: journalId, name: 'suppression' }), { exclusive: true });
  const checkpoint = { formatVersion: 1, generation: current.generation,
    entries: [...current.entries, entry].map(item => ({ protocolId: item.protocolId, sha256: digest(item) })) };
  await writePrivateJson(checkpointPath, sealJson({ value: checkpoint, key, id: journalId, name: 'journal-checkpoint' }));
  return entry;
}

export async function snapshotJournal({ consistentAt }) {
  if (!Number.isFinite(Date.parse(consistentAt))) throw invalid();
  return { ...(await readJournal()), consistentAt: new Date(consistentAt).toISOString() };
}

/** Apply an external journal while the copied stack has no published Auth/Storage ports. */
export async function applyJournal({ client, database, entries, mode, sourceDatabase = database }) {
  if (mode !== 'restore' || !Array.isArray(entries) || !/^[a-z0-9_]+$/.test(database)) throw invalid();
  if (client.connectionParameters?.host !== '127.0.0.1' || Number(client.connectionParameters?.port) !== 55322) throw invalid();
  const target = (await client.query('SELECT current_database() AS name, inet_server_port() AS port')).rows[0];
  if (target.name !== database || ![5432, 55322].includes(target.port)) throw invalid();
  let applied = 0;
  let pending = 0;
  for (const value of entries) {
    const entry = validateJournalEntry(value);
    if (entry.database !== sourceDatabase) continue;
    const exists = (await client.query('SELECT id FROM app."Profile" WHERE id=$1', [entry.subjectProfileId])).rowCount;
    if (!exists) continue; // A capture before account creation contains no private domain rows for this UUID.
    await client.query('INSERT INTO app."Profile"(id,"displayName") VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [entry.operatorProfileId, 'Operação de direitos']);
    await withRightsOperator(client, async () => {
      await client.query(`INSERT INTO app."DataRightsProtocol"(id,"subjectProfileId","operatorProfileId",kind,"requestDigest","verifiedAt")
        VALUES($1,$2,$3,'ERASURE',$4,$5) ON CONFLICT(id) DO NOTHING`,
      [entry.protocolId, entry.subjectProfileId, entry.operatorProfileId, entry.requestDigest, entry.verifiedAt]);
      const row = (await client.query('SELECT * FROM app."DataRightsProtocol" WHERE id=$1', [entry.protocolId])).rows[0];
      if (row.kind !== 'ERASURE' || row.subjectProfileId !== entry.subjectProfileId || row.operatorProfileId !== entry.operatorProfileId || row.requestDigest !== entry.requestDigest) throw invalid();
      const event = (await client.query('SELECT 1 FROM app."DataRightsEvent" WHERE "protocolId"=$1', [entry.protocolId])).rowCount;
      if (!event) await client.query(`INSERT INTO app."DataRightsEvent"(id,"protocolId",sequence,code) VALUES(gen_random_uuid(),$1,1,'REGISTERED')`, [entry.protocolId]);
      for (const scope of ['IDENTITY', 'AUTHORED_CONTENT']) {
        await client.query(`INSERT INTO app."DataSuppression"("subjectProfileId",scope,"protocolId") VALUES($1,$2,$3)
          ON CONFLICT("subjectProfileId",scope) DO NOTHING`, [entry.subjectProfileId, scope, entry.protocolId]);
      }
      // An older erasure may own the immutable tombstones. Reapply its narrow procedure.
      const owner = (await client.query('SELECT "protocolId" FROM app."DataSuppression" WHERE "subjectProfileId"=$1 ORDER BY scope LIMIT 1', [entry.subjectProfileId])).rows[0];
      await client.query('SELECT app.apply_data_erasure($1::uuid)', [owner.protocolId]);
    });
    applied += 1;
    pending += 1; // Physical immutable content and obligations remain explicitly partial.
  }
  return { applied, pending };
}
