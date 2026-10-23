import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { link, readFile, rm, unlink, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { backupLocation, writeBackupManifest, inspectBackupBundle } from '../../scripts/pilot/backup-manifest.mjs';
import { custodyRoot, ensurePrivateDirectory, backupKey } from '../../scripts/pilot/custody.mjs';
import { encryptComponent } from '../../scripts/pilot/archive.mjs';

test('inventário autenticado recusa extra, ausência e hardlink; alteração de arquivo invalida fingerprint', async () => {
  const id = randomUUID(); const directory = backupLocation(id); await ensurePrivateDirectory(directory);
  const key = await backupKey(id, { create: true });
  try {
    const definitions = [
      ['pgdata', 'db', '/var/lib/postgresql/data', '/var/lib/postgresql'], ['storage', 'storage', '/mnt', '/'],
      ['postgres-config', 'db', '/etc/postgresql', '/etc'], ['pgsodium-key', 'db', '/etc/postgresql-custom/pgsodium_root.key', '/etc/postgresql-custom'],
      ['kong-config', 'kong', '/home/kong/kong.yml', '/home/kong'], ['kong-cert', 'kong', '/home/kong/localhost.crt', '/home/kong'],
      ['kong-key', 'kong', '/home/kong/localhost.key', '/home/kong'],
    ];
    const components = [];
    const encrypt = name => encryptComponent({ key, id, directory, name, source: Readable.from(['somente sintético']) });
    for (const [name, service, sourcePath, restorePath] of definitions) {
      components.push({ ...await encrypt(name), kind: 'tar', service, sourcePath, restorePath,
        tarRoot: path.posix.basename(sourcePath), counts: { files: 0, bytes: 0 } });
      components.push({ ...await encrypt(`${name}-inventory`), kind: 'inventory', for: name });
    }
    for (const name of ['configuration', 'journal']) components.push({ ...await encrypt(name), kind: 'json' });
    const startedAt = new Date().toISOString();
    await writeBackupManifest({ formatVersion: 1, kind: 'backup', id, sourceProject: 'meumimo-t02',
      sourceMode: 'development', sourceDatabase: 'meumimo_t14_dev', sourcePrefix: 't14-development',
      applicationSha: 'a'.repeat(40), applicationBuildId: 'synthetic', startedAt,
      consistentAt: startedAt, completedAt: startedAt, expiresAt: new Date(Date.parse(startedAt) + 30 * 86400000).toISOString(), components }, key);
    const original = await inspectBackupBundle(id); assert.equal(original.manifest.id, id);
    const extra = path.join(directory, 'foreign.txt'); await writeFile(extra, 'fixture própria');
    await assert.rejects(inspectBackupBundle(id)); await unlink(extra);
    const file = path.join(directory, components[0].file); const missing = `${file}.missing`;
    await rename(file, missing); await assert.rejects(inspectBackupBundle(id)); await rename(missing, file);
    await ensurePrivateDirectory(path.join(custodyRoot, 'temp'));
    const hardlink = path.join(custodyRoot, 'temp', `bundle-link-${id}`); await link(file, hardlink);
    try { await assert.rejects(inspectBackupBundle(id)); } finally { await unlink(hardlink); }
    const before = await inspectBackupBundle(id); const bytes = await readFile(file); bytes[0] ^= 1; await writeFile(file, bytes);
    const after = await inspectBackupBundle(id); assert.notEqual(after.fingerprint, before.fingerprint);
  } finally {
    key.fill(0); assert.equal(path.dirname(directory), path.join(custodyRoot, 'backups'));
    await rm(directory, { recursive: true }); await unlink(path.join(custodyRoot, 'keys', `${id}.key`));
  }
});
