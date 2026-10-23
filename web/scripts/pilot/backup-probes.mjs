import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { copyFile, lstat, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { withMaintenanceLock } from './custody.mjs';
import { backupLocation, withVerifiedBackup, readBackupManifest, createBackupStaging, clearBackupStaging } from './backup-manifest.mjs';

const identity = value => `${value.dev}:${value.ino}`;
async function absent(file) {
  try { await lstat(file); return false; } catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}

/** Controlled corruption of a newly created local proof backup; original inode is restored in finally. */
export async function probeBackupFailure(id) {
  return withMaintenanceLock(async () => {
    await withVerifiedBackup(id, async () => {});
    const manifest = await readBackupManifest(id); const item = manifest.components.find(component => component.name === 'kong-cert');
    assert.ok(item && item.encryptedBytes > 0 && item.encryptedBytes < 1_048_576);
    const file = path.join(backupLocation(id), item.file); const original = identity(await lstat(file, { bigint: true }));
    const directory = await createBackupStaging(id); const saved = path.join(directory, 'original.gcm');
    const modified = path.join(directory, 'modified.gcm'); let replacement;
    try {
      await copyFile(file, modified, constants.COPYFILE_EXCL);
      const handle = await open(modified, 'r+');
      try {
        const byte = Buffer.alloc(1); assert.equal((await handle.read(byte, 0, 1, 0)).bytesRead, 1);
        byte[0] ^= 1; assert.equal((await handle.write(byte, 0, 1, 0)).bytesWritten, 1); await handle.sync();
      } finally { await handle.close(); }
      assert.equal(identity(await lstat(file, { bigint: true })), original);
      await rename(file, saved);
      await assert.rejects(withVerifiedBackup(id, async () => {}));
      replacement = identity(await lstat(modified, { bigint: true }));
      assert.ok(await absent(file)); await rename(modified, file);
      await assert.rejects(withVerifiedBackup(id, async () => {}));
    } finally {
      if (!await absent(saved)) {
        assert.equal(identity(await lstat(saved, { bigint: true })), original);
        if (!await absent(file)) {
          assert.equal(identity(await lstat(file, { bigint: true })), replacement); await unlink(file);
        }
        await rename(saved, file);
      }
      const leftovers = [];
      if (!await absent(modified)) leftovers.push(modified);
      await clearBackupStaging(directory, leftovers);
    }
    assert.equal(identity(await lstat(file, { bigint: true })), original);
    await withVerifiedBackup(id, async () => {});
    return { code: 'BACKUP_FAILURES_REJECTED', counts: { missing: 1, corrupted: 1, originalReverified: 1 } };
  });
}
