import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createFixture } from '../helpers/fixtures.mjs';
import { expectStatus } from '../helpers/http-client.mjs';
import { getDb } from '../../../src/server/db/client.ts';
import { processMediaBatch } from '../../../src/server/media-worker/processing.ts';
import { publishMedia } from '../../../src/server/media/registration.ts';
import { withStoreTransaction } from '../../../src/server/stores/transaction.ts';
import { memoryOrigin } from './origin-fixture.mjs';

export const closeRuntime = () => getDb().$disconnect();
export const processBatch = (limit = 10) => processMediaBatch({ limit });
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const PART_BYTES = 5 * 1024 * 1024;
export const fileInput = (bytes, mimeType = 'image/png', id = randomUUID()) => ({ operationId: id,
  mediaType: mimeType.startsWith('image/') ? 'PHOTO' : 'VIDEO', mimeType, byteLength: bytes.length, sha256: digest(bytes) });

export async function fixtureBytes(name) {
  assert.ok(process.env.T06_MEDIA_FIXTURES, 'A integração exige arquivos sintéticos locais de T06.');
  assert.ok(/^[a-z0-9-]+\.(?:jpg|png|webp|mp4|mov)$/.test(name));
  return readFile(path.join(process.env.T06_MEDIA_FIXTURES, name));
}

export async function mediaFixture(t) {
  const fixture = await createFixture(t);
  const user = () => fixture.createUser().then(person => fixture.login(person));
  const owner = await user();
  const ana = await user();
  const bia = await user();
  const store = await fixture.createStore(owner, 'Mídia T06 fictícia');
  const merchant = await fixture.addMembership(store, owner, 'MERCHANT');
  const participation = await fixture.addMembership(store, ana);
  const otherParticipation = await fixture.addMembership(store, bia);
  const assets = new Set();
  const bucketName = process.env.MEDIA_BUCKET;
  const prefix = process.env.MEDIA_PREFIX;
  assert.equal(bucketName, 'meumimo-t06-private');
  assert.equal(prefix, ['t07', 't08', 't09', 't10', 't11'].includes(process.env.T02_TASK) ? `${process.env.T02_TASK}-integration` : 'integration');
  const storage = fixture.auth.storage.from(bucketName);
  const hasAlbums = !!(await fixture.database.query("SELECT to_regclass('app.\"TicketAlbum\"') AS table")).rows[0].table;

  async function collection(purpose = 'MEMORY', member = participation, currentStore = store) {
    if (purpose === 'MEMORY' && hasAlbums) {
      const participant = [ana, bia].find(person => person.id === member.profileId);
      assert.ok(participant, 'A origem real exige a conta participante desta fixture.');
      return memoryOrigin(owner, participant, currentStore, member);
    }
    // Testes isolados anteriores a T11 preservam o contrato histórico de T06.
    const value = { id: randomUUID(), storeId: currentStore.id, participantMembershipId: member.id, purpose, subjectId: randomUUID() };
    await fixture.database.query('INSERT INTO app."MediaCollection" (id, "storeId", "participantMembershipId", purpose, "subjectId") VALUES ($1,$2,$3,$4,$5)',
      [value.id, value.storeId, value.participantMembershipId, value.purpose, value.subjectId]);
    return value;
  }
  const memory = await collection();
  const evidence = await collection('EVIDENCE');
  const collectionPath = value => `/api/lojas/${value.storeId}/midia/${value.id}`;
  const assetPath = (id, currentStore = store) => `/api/lojas/${currentStore.id}/midia/arquivos/${id}`;
  async function reserve(person, inputs, current = memory) {
    for (const input of inputs) trackAsset(input.operationId, person);
    const response = await person.client.post(collectionPath(current), { files: inputs });
    expectStatus(response, 201);
    return (await response.json()).items;
  }
  function part(person, id, bytes, offset = 0, headers = {}) {
    return person.client.request(`${assetPath(id)}/partes?offset=${offset}`, { method: 'PUT', body: bytes,
      headers: { 'Content-Type': 'application/octet-stream', ...headers } });
  }
  async function upload(person, bytes, mimeType = 'image/png', current = memory) {
    const input = fileInput(bytes, mimeType);
    const [asset] = await reserve(person, [input], current);
    for (let offset = 0; offset < bytes.length; offset += PART_BYTES) {
      expectStatus(await part(person, asset.id, bytes.subarray(offset, offset + PART_BYTES), offset), 200);
    }
    const response = await person.client.post(`${assetPath(asset.id)}/concluir`, {});
    expectStatus(response, 202);
    return response.json();
  }
  async function identity(person) {
    const response = await person.client.get('/api/auth/session'); expectStatus(response, 200); return response.json();
  }
  async function asset(person, id) {
    const response = await person.client.get(assetPath(id)); expectStatus(response, 200); return response.json();
  }
  async function access(person, id, variant = 'display') {
    const response = await person.client.post(`${assetPath(id)}/acesso`, { variant });
    expectStatus(response, 200); return response.json();
  }
  async function publish(person, current, ids) {
    if (current.albumId) {
      const base = `/api/lojas/${current.storeId}/tickets/${current.subjectId}/album`;
      const response = await person.client.get(base); expectStatus(response, 200);
      const album = await response.json();
      const publication = await person.client.post(`${base}/publicacoes`, { operationId: randomUUID(),
        expectedVersion: album.version, items: ids.map(assetId => ({ assetId, caption: '' })) });
      expectStatus(publication, 200); return publication.json();
    }
    return withStoreTransaction(await identity(person), current.storeId, scope => publishMedia(scope, current.id, ids));
  }
  async function objectKeys(id) {
    const found = [];
    const pending = [`${prefix}/${id}`];
    while (pending.length) {
      const directory = pending.shift();
      const { data, error } = await storage.list(directory, { limit: 1000 });
      assert.equal(error, null);
      for (const item of data) {
        const key = `${directory}/${item.name}`;
        if (item.id) found.push(key); else pending.push(key);
      }
    }
    return found;
  }
  t.after(async () => {
    for (const id of assets) {
      const keys = await objectKeys(id);
      if (keys.length) assert.equal((await storage.remove(keys)).error, null);
    }
  });
  for (const person of [owner, ana, bia]) for (const kind of ['reserve', 'part']) {
    fixture.trackRateKey(createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET).update(`media-${kind}\0${person.id}`).digest('hex'));
  }
  const trackAsset = (id, person = owner) => {
    assets.add(id);
    fixture.trackRateKey(createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET).update(`meumimo:t06:parts:${person.id}:${id}`).digest('hex'));
  };
  async function expireReserveQuota(person) {
    const key = createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET).update(`media-reserve\0${person.id}`).digest('hex');
    await fixture.database.query('UPDATE app."AuthRateBucket" SET attempts = ARRAY(SELECT value - interval \'61 seconds\' FROM unnest(attempts) value) WHERE key = $1', [key]);
  }
  return { ...fixture, owner, ana, bia, user, store, merchant, participation, otherParticipation, memory, evidence,
    collection, collectionPath, assetPath, reserve, part, upload, identity, asset, access, publish, objectKeys, storage, trackAsset, expireReserveQuota };
}
