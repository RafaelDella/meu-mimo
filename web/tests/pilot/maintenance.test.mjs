import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { selectDevelopmentBackup, backupDue } from '../../scripts/pilot/maintenance.mjs';

const now = new Date('2026-10-23T16:00:00.000Z');
function manifest(age = 0) {
  const cut = now.getTime() - age; const start = cut - 1000;
  return { formatVersion: 1, kind: 'backup', id: randomUUID(), sourceProject: 'meumimo-t02', sourceMode: 'development',
    sourceDatabase: 'meumimo_t14_dev', sourcePrefix: 't14-development', startedAt: new Date(start).toISOString(),
    consistentAt: new Date(cut).toISOString(), completedAt: new Date(cut + 1).toISOString(),
    expiresAt: new Date(start + 30 * 86400_000).toISOString() };
}

test('seleção usa corte válido de desenvolvimento, sem confiar em mtime ou outro modo', () => {
  const recent = manifest(1000); const old = manifest(12 * 3600_000);
  const invalid = [manifest(-1000), { ...recent, sourceMode: 'integration' }, { ...recent, completedAt: null },
    { ...recent, sourceDatabase: 'meumimo_t14' }, { ...recent, expiresAt: recent.startedAt }];
  assert.equal(selectDevelopmentBackup(invalid, now), null);
  const chosen = selectDevelopmentBackup([old, ...invalid, recent], now);
  assert.deepEqual(chosen, { id: recent.id, consistentAt: recent.consistentAt, completedAt: recent.completedAt, expiresAt: recent.expiresAt });
  assert.equal(backupDue(chosen, now), false);
});

test('ausência, corte futuro ou doze horas completas exigem captura antes de escritores', () => {
  assert.equal(backupDue(null, now), true);
  assert.equal(backupDue(selectDevelopmentBackup([manifest(12 * 3600_000)], now), now), true);
  assert.equal(backupDue(selectDevelopmentBackup([manifest(12 * 3600_000 - 1)], now), now), false);
  assert.equal(backupDue({ id: randomUUID(), consistentAt: new Date(now.getTime() + 1).toISOString() }, now), true);
});
