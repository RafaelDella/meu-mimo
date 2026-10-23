import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { readState, webRoot } from '../local-runtime.mjs';
import { mediaEnvironment } from '../media-environment.mjs';
import { withTestRuntime } from './test-web.mjs';
import { createBackup } from './backup.mjs';
import { restoreBackup } from './restore.mjs';
import { cleanRestore } from './restore-cleanup.mjs';
import { preparePilotInventory } from './inventory.mjs';
import { custodyRoot, readPrivateJson, writePrivateJson } from './custody.mjs';
import { pilotResources } from './resources.mjs';
import { assertPilotDatabase } from './runtime-environment.mjs';
import { probeBackupFailure } from './backup-probes.mjs';

const reportFile = path.join(custodyRoot, 'reports', 'recovery-check.json');
const markerFile = path.join(custodyRoot, 'reports', 'development-marker.json');

export async function fixturePhase(phase, mode = 'integration') {
  return withTestRuntime(async ({ state }) => {
    const child = spawn(process.execPath, ['--conditions=react-server', 'scripts/pilot/recovery-fixtures.mjs', phase], {
      cwd: webRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
        ...process.env, ...state.runtime, ...state.integration, ...mediaEnvironment(mode, 't14'),
        T06_MEDIA_FIXTURES: path.join(custodyRoot, 'fixtures'),
      },
    });
    child.stdout.resume(); child.stderr.resume();
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    if (code !== 0) throw Object.assign(new Error('Fase de recuperação falhou.'), { code: `FIXTURE_${phase.toUpperCase().replaceAll('-', '_')}` });
    const report = await readPrivateJson(path.join(custodyRoot, 'reports', 'recovery-fixture-report.json'));
    assert.equal(report.phase, phase); assert.notEqual(report.code, 'RECOVERY_FIXTURE_PHASE_FAILED');
    return report;
  }, { mode, manual: true });
}

export async function developmentMarker(action) {
  const source = readState('t14'); const url = source.migration.development;
  assertPilotDatabase(url, 'development');
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  await client.connect();
  try {
    if (action === 'create') {
      let previous;
      try { previous = await readPrivateJson(markerFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (previous) {
        assert.equal(previous.status, 'CLEANED');
        assert.equal((await client.query('SELECT 1 FROM app."Profile" WHERE id=$1', [previous.id])).rowCount, 0);
      }
      const marker = { id: randomUUID(), displayName: `T14 persistência ${randomUUID()}` };
      await writePrivateJson(markerFile, marker, { exclusive: !previous });
      await client.query('INSERT INTO app."Profile" (id,"displayName") VALUES ($1,$2)', [marker.id, marker.displayName]);
    } else {
      const marker = await readPrivateJson(markerFile);
      const result = await client.query('SELECT "displayName" FROM app."Profile" WHERE id=$1', [marker.id]);
      assert.equal(result.rowCount, 1); assert.equal(result.rows[0].displayName, marker.displayName);
      if (action === 'remove') {
        await client.query('DELETE FROM app."Profile" WHERE id=$1 AND "displayName"=$2', [marker.id, marker.displayName]);
        await writePrivateJson(markerFile, { ...marker, status: 'CLEANED' });
      }
      else assert.equal(action, 'verify');
    }
  } finally { await client.end(); }
}

export async function checkLocalRecovery() {
  if (arguments.length) throw new Error('O ensaio não recebe destinos alternativos.');
  const startedAt = new Date().toISOString(); const phases = [];
  const report = { formatVersion: 1, status: 'RUNNING', startedAt, phases };
  await writePrivateJson(reportFile, report);
  try {
    await preparePilotInventory();
    await developmentMarker('create');
    phases.push(await fixturePhase('prepare'));
    await developmentMarker('verify');
    const backup = await createBackup('integration');
    report.backupId = backup.id; report.consistentAt = backup.consistentAt;
    await writePrivateJson(reportFile, report);
    report.backupFailureProbes = await probeBackupFailure(backup.id);
    phases.push(await fixturePhase('source-after'));
    await developmentMarker('verify');
    phases.push(await fixturePhase('erase'));
    const declaredAt = new Date().toISOString();
    const restored = await restoreBackup(backup.id);
    assert.equal(restored.status, 'STACK_VERIFIED');
    phases.push(await fixturePhase('verify-restore', 'restore'));
    const web = await fixturePhase('verify-web', 'restore'); phases.push(web);
    assert.equal(web.webVerified, true);
    report.recoveredAt = new Date().toISOString();
    report.restoreSeconds = (Date.parse(report.recoveredAt) - Date.parse(declaredAt)) / 1000;
    report.recoveryAgeHours = (Date.parse(declaredAt) - Date.parse(backup.consistentAt)) / 3_600_000;
    assert.ok(report.restoreSeconds <= 8 * 3600 && report.recoveryAgeHours <= 24);
    phases.push(await fixturePhase('cleanup'));
    await developmentMarker('verify'); await developmentMarker('remove');
    const operation = await readPrivateJson(path.join(pilotResources('restore').directory, 'operation.json'));
    const cleanup = await cleanRestore(operation.owner);
    assert.equal(cleanup.status, 'CLEANED');
    report.status = 'WEB_RECOVERY_VERIFIED'; report.counts = { ...restored.counts, phases: phases.length, developmentMarker: 1 };
    report.completedAt = new Date().toISOString();
    await writePrivateJson(reportFile, report);
    return { code: report.status, backupId: backup.id, counts: report.counts,
      restoreSeconds: report.restoreSeconds, recoveryAgeHours: report.recoveryAgeHours };
  } catch (error) {
    report.status = 'FAILED_PRESERVED'; report.code = /^[A-Z0-9_]{1,80}$/.test(error.code ?? '') ? error.code : 'RECOVERY_CHECK_FAILED';
    report.completedAt = new Date().toISOString(); await writePrivateJson(reportFile, report);
    throw Object.assign(new Error('Ensaio interrompido; fixtures e cópia preservadas para diagnóstico privado.'), { code: report.code });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Use recovery-check.mjs sem argumentos.');
    process.stdout.write(`${JSON.stringify(await checkLocalRecovery())}\n`);
  } catch (error) { process.stderr.write(`${error.code ?? 'RECOVERY_CHECK_FAILED'}\n`); process.exitCode = 1; }
}
