import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { encryptComponent, decryptComponent, sealJson, openJson } from '../../scripts/pilot/archive.mjs';
import { pilotResources } from '../../scripts/pilot/resources.mjs';
import { ensurePrivateDirectory } from '../../scripts/pilot/custody.mjs';

const parent = path.join(pilotResources('development').directory, 'temp');
async function fixture(t) {
  await ensurePrivateDirectory(parent); const directory = await mkdtemp(path.join(parent, 't14-crypto-'));
  t.after(async () => { assert.equal(path.dirname(directory), parent); assert.match(path.basename(directory), /^t14-crypto-/); await rm(directory, { recursive: true }); });
  const destinationDirectory = path.join(directory, 'verified'); await mkdir(destinationDirectory);
  return { directory, destinationDirectory, key: randomBytes(32), id: randomUUID(), name: 'pgdata' };
}

test('arquivo cifrado preserva bytes por stream e só libera plaintext autenticado', async t => {
  const f = await fixture(t); const bytes = Buffer.concat([Buffer.from('Dados sintéticos T14\n'), randomBytes(2 * 1024 * 1024)]);
  const component = await encryptComponent({ ...f, source: Readable.from([bytes.subarray(0, 512), bytes.subarray(512)]) });
  assert.equal(component.bytes, bytes.length); assert.equal(component.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal((await readFile(path.join(f.directory, component.file))).includes(bytes.subarray(0, 20)), false);
  const opened = await decryptComponent({ ...f, component });
  assert.ok((await readFile(opened.file)).equals(bytes)); assert.equal(opened.sha256, component.sha256);
  assert.equal((await readdir(f.directory)).some(file => file.endsWith('.partial')), false);
});

test('chave errada, tag adulterada e componente faltante não liberam destino', async t => {
  const f = await fixture(t); const component = await encryptComponent({ ...f, source: Readable.from(['Conteúdo privado sintético']) });
  for (const change of [{ key: randomBytes(32) }, { component: { ...component, tag: randomBytes(16).toString('base64') } },
    { component: { ...component, file: 'ausente.gcm' } }]) {
    await assert.rejects(decryptComponent({ ...f, component, ...change }));
    assert.deepEqual(await readdir(f.destinationDirectory), []);
  }
});

test('adulteração dos bytes ou troca de contexto falha antes da publicação', async t => {
  const f = await fixture(t); const component = await encryptComponent({ ...f, source: Readable.from(['Corte confirmado']) });
  await assert.rejects(decryptComponent({ ...f, id: randomUUID(), component }));
  const file = path.join(f.directory, component.file); const bytes = await readFile(file); bytes[Math.floor(bytes.length / 2)] ^= 1; await writeFile(file, bytes);
  await assert.rejects(decryptComponent({ ...f, component })); assert.deepEqual(await readdir(f.destinationDirectory), []);
});

test('componentes recusam traversal, referência parcial e diretório com junction', async t => {
  const f = await fixture(t); const component = await encryptComponent({ ...f, source: Readable.from(['Original']) });
  for (const file of ['../fora.gcm', '/fora.gcm', 'pgdata.gcm.partial']) {
    await assert.rejects(decryptComponent({ ...f, component: { ...component, file } }));
  }
  const linked = path.join(f.directory, 'linked'); await symlink(f.destinationDirectory, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(decryptComponent({ ...f, component, destinationDirectory: linked }));
  assert.deepEqual(await readdir(f.destinationDirectory), []);
});

test('manifesto autenticado usa nonce novo e recusa chave ou contexto trocado', () => {
  const key = randomBytes(32); const id = randomUUID(); const name = 'manifest'; const value = { formatVersion: 1, counts: { objects: 2 } };
  const first = sealJson({ value, key, id, name }); const second = sealJson({ value, key, id, name });
  assert.notDeepEqual(first, second); assert.deepEqual(openJson({ envelope: first, key, id, name }), value);
  assert.throws(() => openJson({ envelope: first, key: randomBytes(32), id, name }));
  assert.throws(() => openJson({ envelope: first, key, id: randomUUID(), name }));
});
