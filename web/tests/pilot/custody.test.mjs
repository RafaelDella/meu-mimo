import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { pilotResources } from '../../scripts/pilot/resources.mjs';
import { ensurePrivateDirectory, readPrivateJson, writePrivateJson, backupKey, withMaintenanceLock } from '../../scripts/pilot/custody.mjs';

const root = pilotResources('development').directory;
test('custódia recusa caminhos externos, links e escrita sobre arquivo exclusivo', async () => {
  const directory = path.join(root, 'temp', `custody-${randomUUID()}`);
  await ensurePrivateDirectory(directory);
  try {
    await assert.rejects(ensurePrivateDirectory(path.dirname(root)));
    const file = path.join(directory, 'report.json');
    await writePrivateJson(file, { count: 1 }, { exclusive: true });
    await assert.rejects(writePrivateJson(file, { count: 2 }, { exclusive: true }));
    assert.deepEqual(await readPrivateJson(file), { count: 1 });
    const link = path.join(directory, 'link');
    await symlink(directory, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(writePrivateJson(path.join(link, 'bad.json'), {}));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('chave externa não é sobrescrita; lock recusa manutenção concorrente', async () => {
  const id = randomUUID();
  const key = await backupKey(id, { create: true });
  try {
    assert.equal(key.length, 32);
    assert.deepEqual(await backupKey(id, { create: true }), key);
    assert.deepEqual(await readFile(path.join(root, 'keys', `${id}.key`)), key);
    await withMaintenanceLock(async () => {
      await assert.rejects(withMaintenanceLock(async () => assert.fail('não pode entrar')));
    });
    await withMaintenanceLock(async () => {});
  } finally { await rm(path.join(root, 'keys', `${id}.key`)); }
});
