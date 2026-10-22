import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHmac } from 'node:crypto';
import { mediaFixture, fixtureBytes, processBatch } from '../media/helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';
export { closeRuntime, fixtureBytes, processBatch, fileInput } from '../media/helpers.mjs';

export async function albumFixture(t) {
  const f = await mediaFixture(t);
  const albumPath = (collection = f.memory) => `/api/lojas/${collection.storeId}/tickets/${collection.subjectId}/album`;
  const ticketPath = (collection = f.memory) => `/api/lojas/${collection.storeId}/tickets/${collection.subjectId}`;
  async function read(path, person = f.owner) {
    const response = await person.client.get(path); expectStatus(response, 200); return response.json();
  }
  const album = (person = f.owner, collection = f.memory, query = '') => read(albumPath(collection) + query, person);
  const ticket = (person = f.owner, collection = f.memory) => read(ticketPath(collection), person);
  const body = (current, items, extra = {}) => ({ operationId: randomUUID(), expectedVersion: current.version,
    items: items.map(item => typeof item === 'string' ? { assetId: item, caption: '' } : item), ...extra });
  async function publish(items, extra = {}, collection = f.memory) {
    const request = body(await album(f.owner, collection), items, extra);
    const response = await f.owner.client.post(`${albumPath(collection)}/publicacoes`, request);
    expectStatus(response, 200); return { ...(await response.json()), request };
  }
  async function ready(names = ['photo.png'], collection = f.memory) {
    const types = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime' };
    const assets = [];
    for (const name of names) {
      assets.push(await f.upload(f.owner, await fixtureBytes(name), types[name.split('.').at(-1)], collection));
      if (assets.length % 5 === 0) await resetLimits(f.owner);
    }
    const processed = await processBatch(10);
    assert.equal(processed.processed, names.length); assert.equal(processed.failed, 0);
    return assets;
  }
  async function transition(action, text = 'Decisão real do ticket', collection = f.memory, person = f.owner) {
    const current = await ticket(person, collection);
    const request = { operationId: randomUUID(), expectedVersion: current.version, action,
      ...(action === 'FULFILL' ? {} : { text }),
      ...(action === 'CANCEL' ? { expectedBalance: current.cancellationImpact.balanceBefore, restock: false } : {}) };
    const response = await person.client.post(`${ticketPath(collection)}/transicoes`, request);
    expectStatus(response, 200); return response.json();
  }
  async function financial() {
    const result = await f.database.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM app."PointsEntry" p WHERE "storeId"=$1) ledger,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM app."Reward" r WHERE "storeId"=$1) rewards,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM app."Redemption" r WHERE "storeId"=$1) tickets`, [f.store.id]);
    return result.rows[0];
  }
  async function resetLimits(...people) {
    for (const person of people.length ? people : [f.owner, f.ana]) {
      const keys = ['read', 'write'].map(kind => createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET)
        .update('meumimo:t04:domain-rate:v1\0').update(kind).update('\0').update(person.id).digest('hex'));
      await f.database.query('DELETE FROM app."AuthRateBucket" WHERE key=ANY($1::text[])', [keys]);
      await f.expireReserveQuota(person);
    }
  }
  async function counts() {
    return (await f.database.query(`SELECT
      (SELECT count(*)::int FROM app."AlbumEvent" WHERE "albumId"=$1) events,
      (SELECT count(*)::int FROM app."AlbumItem" WHERE "albumId"=$1) items,
      (SELECT count(*)::int FROM app."OutboxEvent" WHERE "albumEventId" IN (SELECT id FROM app."AlbumEvent" WHERE "albumId"=$1)) outbox`, [f.memory.albumId])).rows[0];
  }
  return { ...f, albumPath, ticketPath, read, album, ticket, body, publish, ready, transition, financial, resetLimits, counts };
}
