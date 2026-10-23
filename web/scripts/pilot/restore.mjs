import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pilotResources } from './resources.mjs';
import { withMaintenanceLock, readPrivateJson, writePrivateJson, ensurePrivateDirectory, custodyRoot } from './custody.mjs';
import { readJournal, validateJournalEntry } from './journal.mjs';
import { withVerifiedBackup } from './backup-manifest.mjs';
import { backupEngine } from './backup-streams.mjs';
import { assertSourceWritersAbsent } from './backup-source.mjs';
import { privateDiagnostic } from './error-diagnostic.mjs';
import { newRestoreSecrets } from './restore-secrets.mjs';
import { prepareRestoredDatabase, writeRestoreState } from './restore-state.mjs';
import { preflightRestore, createRestoreResources, createRestoreContainer, restoreComponent,
  startRestoreService, closeRestore, installKongConfiguration } from './restore-stack.mjs';
import { remapRestoredStorage, verifyRestoredObjects } from './restore-storage.mjs';

function mergedJournal(captured, current) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if (captured?.formatVersion !== 1 || current?.formatVersion !== 1 || !Array.isArray(captured.entries)
    || !Array.isArray(current.entries) || typeof captured.generation !== 'string' || !uuid.test(captured.generation)
    || typeof current.generation !== 'string' || !uuid.test(current.generation)
    || captured.generation !== current.generation) throw new Error('Journal de recuperação ausente ou de outra geração.');
  const found = new Map();
  for (const raw of [...captured.entries, ...current.entries]) {
    const entry = validateJournalEntry(raw); const previous = found.get(entry.protocolId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) throw new Error('Journal de recuperação divergente.');
    found.set(entry.protocolId, entry);
  }
  // External custody must retain every intent that was present at the capture.
  if (captured.entries.some(entry => !current.entries.some(item => item.protocolId === entry.protocolId))) throw new Error('Journal externo incompleto.');
  return { formatVersion: 1, generation: captured.generation,
    entries: [...found.values()].sort((a, b) => a.protocolId.localeCompare(b.protocolId)) };
}

async function restore(id) {
  const startedAt = new Date().toISOString();
  await assertSourceWritersAbsent();
  return withVerifiedBackup(id, async ({ manifest, plaintext }) => {
    const configuration = await readPrivateJson(plaintext.get('configuration'));
    const capturedJournal = await readPrivateJson(plaintext.get('journal'));
    const journal = mergedJournal(capturedJournal, await readJournal());
    if (configuration.formatVersion !== 1 || configuration.mode !== manifest.sourceMode
      || configuration.sourceDatabase !== manifest.sourceDatabase || !Array.isArray(configuration.containers)
      || configuration.containers.length !== 7) throw new Error('Configuração cifrada incompatível.');
    const engine = await backupEngine();
    await preflightRestore(engine);
    const context = { manifest, plaintext, configuration, owner: randomUUID(), secrets: newRestoreSecrets(), containers: {} };
    const directory = pilotResources('restore').directory;
    await ensurePrivateDirectory(directory);
    await writePrivateJson(path.join(directory, 'operation.json'), { formatVersion: 1, owner: context.owner,
      backupId: id, status: 'CLOSED', startedAt }, { exclusive: true });
    try {
      await createRestoreResources(engine, context.owner);
      await createRestoreContainer(engine, context, 'db', true);
      await createRestoreContainer(engine, context, 'storage', false, true);
      for (const name of ['pgdata', 'postgres-config', 'pgsodium-key', 'storage']) {
        await restoreComponent(engine, context, manifest.components.find(item => item.name === name));
      }
      await startRestoreService(engine, context, 'db');
      const rights = await prepareRestoredDatabase(context, journal);
      const storage = await remapRestoredStorage(engine, context);
      for (const service of ['inbucket', 'auth', 'rest', 'realtime']) await createRestoreContainer(engine, context, service, service === 'inbucket');
      for (const service of ['inbucket', 'auth', 'rest', 'realtime', 'storage']) await startRestoreService(engine, context, service);
      const objects = await verifyRestoredObjects(engine, context);
      if (objects !== storage.objects) throw new Error('Objeto ausente impede abertura da recuperação.');
      if (JSON.stringify(journal.entries) !== JSON.stringify(mergedJournal(capturedJournal, await readJournal()).entries)) throw new Error('Journal mudou durante a recuperação.');
      await createRestoreContainer(engine, context, 'kong', true);
      await installKongConfiguration(engine, context);
      await startRestoreService(engine, context, 'kong');
      await writeRestoreState(context);
      const completedAt = new Date().toISOString();
      await writePrivateJson(path.join(directory, 'operation.json'), { formatVersion: 1, owner: context.owner,
        backupId: id, status: 'VERIFIED', startedAt, completedAt, containers: context.containers });
      return { id, status: 'STACK_VERIFIED', startedAt, completedAt, counts: { objects, suppressions: rights.applied, partialRights: rights.pending },
        restoreSeconds: (Date.parse(completedAt) - Date.parse(startedAt)) / 1000,
        recoveryAgeHours: (Date.parse(startedAt) - Date.parse(manifest.consistentAt)) / 3_600_000 };
    } catch (error) {
      await closeRestore(engine, context);
      await writePrivateJson(path.join(custodyRoot, 'reports', `restore-failure-${context.owner}.json`), {
        formatVersion: 1, owner: context.owner, diagnostic: privateDiagnostic(error),
      });
      await writePrivateJson(path.join(directory, 'operation.json'), { formatVersion: 1, owner: context.owner,
        backupId: id, status: 'CLOSED', startedAt, containers: context.containers });
      throw new Error(error.code === 'SOURCE_RESTART_PENDING' ? 'Origem com reinício pendente.' : 'Recuperação recusada; destino permanece fechado.');
    }
  });
}

export async function restoreBackup(id) {
  return withMaintenanceLock(() => restore(id));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Use restore.mjs UUID.');
    process.stdout.write(`${JSON.stringify(await restoreBackup(process.argv[2]))}\n`);
  } catch { process.stderr.write('Recuperação local recusada; confira a custódia e os recursos próprios.\n'); process.exitCode = 1; }
}
