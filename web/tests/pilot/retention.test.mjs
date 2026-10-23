import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { custodyRoot, ensurePrivateDirectory, writePrivateJson } from '../../scripts/pilot/custody.mjs';
import { encryptComponent, sealJson } from '../../scripts/pilot/archive.mjs';
import { retentionExpired, maintainDirectory } from '../../scripts/pilot/retention.mjs';

const day = 86_400_000; const now = new Date('2026-10-23T12:00:00.000Z');
test('retenção usa captura/preparo/criação e os limites confirmados de 30/7 dias', () => {
  for (const [kind, days, field] of [['backup', 30, 'startedAt'], ['export', 7, 'preparedAt'], ['log', 7, 'createdAt']]) {
    const start = new Date(now.getTime() - days * day).toISOString();
    const manifest = { kind, [field]: start, expiresAt: now.toISOString(), mtime: new Date().toISOString() };
    assert.equal(retentionExpired(manifest, now), true);
    assert.equal(retentionExpired(manifest, new Date(now.getTime() - 1)), false);
    assert.throws(() => retentionExpired({ ...manifest, expiresAt: new Date(now.getTime() + day).toISOString() }, now));
  }
});

test('limpeza autentica conjuntos próprios e preserva links, parciais e desconhecidos', async t => {
  const directory = path.join(custodyRoot, 'temp', `retention-test_${randomUUID()}`);
  await ensurePrivateDirectory(directory);
  t.after(async () => { assert.equal(path.dirname(directory), path.join(custodyRoot, 'temp')); await rm(directory, { recursive: true }); });
  const keys = new Map(); const deleted = [];
  async function bundle(kind, old = true) {
    const id = randomUUID(); const key = randomBytes(32); keys.set(id, key);
    const folder = path.join(directory, `${kind}s`, id); await ensurePrivateDirectory(folder);
    const component = await encryptComponent({ source: Readable.from(['Somente dados sintéticos.']), key, id, name: 'payload', directory: folder });
    const days = kind === 'backup' ? 30 : 7;
    const start = new Date(now.getTime() - (old ? days : 0) * day).toISOString();
    const manifest = { formatVersion: 1, id, protocolId: id, kind, components: [component],
      [kind === 'backup' ? 'startedAt' : 'preparedAt']: start, expiresAt: new Date(Date.parse(start) + days * day).toISOString() };
    await writePrivateJson(path.join(folder, 'manifest.json'), sealJson({ value: manifest, key, id, name: kind === 'backup' ? 'manifest' : 'export-manifest' }));
    if (kind === 'export') await writePrivateJson(path.join(folder, 'preparation.json'), sealJson({ value: { fingerprint: 'synthetic' }, key, id, name: 'export-state' }));
    return { id, folder, component };
  }
  const expired = await bundle('backup'); const fresh = await bundle('backup', false); const exported = await bundle('export');
  const unknown = await bundle('backup'); await writeFile(path.join(unknown.folder, 'foreign.txt'), 'preservar');
  const partial = await bundle('backup'); await writeFile(path.join(partial.folder, 'capture.partial'), 'não concluído');
  const altered = await bundle('backup'); await writeFile(path.join(altered.folder, altered.component.file), 'corrompido');
  const linked = path.join(directory, 'backups', randomUUID()); await symlink(fresh.folder, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await utimes(path.join(fresh.folder, 'manifest.json'), new Date('2000-01-01'), new Date('2000-01-01'));
  const logs = path.join(directory, 'logs'); await ensurePrivateDirectory(logs); const logId = randomUUID();
  await writePrivateJson(path.join(logs, `${logId}.json`), { formatVersion: 1, kind: 'log', id: logId,
    createdAt: new Date(now.getTime() - 7 * day).toISOString(), expiresAt: now.toISOString(), code: 'SYNTHETIC', counts: { attempts: 1 } });
  const result = await maintainDirectory({ directory, now, keyForId: id => keys.get(id), deleteKey: async id => { deleted.push(id); } });
  assert.equal(result.counts.backups, 1); assert.equal(result.counts.exports, 1); assert.equal(result.counts.logs, 1);
  assert.deepEqual(deleted.sort(), [expired.id, exported.id].sort());
  for (const item of [fresh, unknown, partial, altered]) assert.equal((await lstat(item.folder)).isDirectory(), true);
  assert.equal((await lstat(linked)).isSymbolicLink(), true);
  assert.equal((await readdir(logs)).length, 0);
  await assert.rejects(maintainDirectory({ directory: custodyRoot, now, keyForId: id => keys.get(id) }));
});
