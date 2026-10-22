import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createFixture } from '../helpers/fixtures.mjs';
import { expectStatus } from '../helpers/http-client.mjs';
import { getDb } from '../../../src/server/db/client.ts';
import { processMediaBatch } from '../../../src/server/media-worker/processing.ts';
import { deliverOutboxBatch } from '../../../src/server/outbox/worker.ts';

export const closeRuntime = () => getDb().$disconnect();
export const deliver = () => deliverOutboxBatch({ limit: 50 });
export const fields = (extra = {}) => ({ name: 'Uma conquista de teste', description: 'Uma regra clara.',
  category: '', sticker: '', points: 15, frequency: 'DAILY', weeklyLimit: 1, approvalMode: 'MANUAL', ...extra });

export async function activityFixture(t) {
  const fixture = await createFixture(t);
  const user = () => fixture.createUser().then(person => fixture.login(person));
  const owner = await user();
  const ana = await user();
  const bia = await user();
  const store = await fixture.createStore(owner, 'Atividades T07 fictícias');
  const merchant = await fixture.addMembership(store, owner, 'MERCHANT');
  const participation = await fixture.addMembership(store, ana);
  const otherParticipation = await fixture.addMembership(store, bia);
  const base = (currentStore = store) => `/api/lojas/${currentStore.id}`;
  const activityPath = (activity, currentStore = store) => `${base(currentStore)}/atividades/${activity.id}`;
  const submissionPath = (submission, currentStore = store) => `${base(currentStore)}/registros/${submission.id}`;
  async function create(extra = {}, person = owner, currentStore = store, operationId = randomUUID()) {
    const request = { operationId, ...fields(extra) };
    const response = await person.client.post(`${base(currentStore)}/atividades`, request);
    expectStatus(response, 201);
    return { ...(await response.json()).activity, request };
  }
  async function update(activity, extra = {}, operationId = randomUUID()) {
    const request = { operationId, expectedVersion: activity.version, ...fields(activity), ...extra };
    // DTO includes view-only members; the mutation contract accepts only configuration fields.
    for (const key of ['id', 'storeId', 'version', 'createdAt', 'archivedAt', 'availability', 'request']) delete request[key];
    const response = await owner.client.patch(activityPath(activity), request);
    expectStatus(response, 200);
    return { ...(await response.json()).activity, request };
  }
  async function prepare(activity, person = ana, operationId = randomUUID()) {
    const response = await person.client.post(`${activityPath(activity)}/preparar`, { operationId });
    expectStatus(response, 201);
    return response.json();
  }
  const body = (draft, extra = {}) => ({ caption: '', evidenceAssetId: null,
    expectedVersion: draft.review.expectedVersion, expectedLocalDate: draft.review.localDate,
    expectedTimezone: draft.review.timezone, ...extra });
  async function submit(draft, person = ana, extra = {}) {
    const request = body(draft, extra);
    const response = await person.client.post(`${submissionPath(draft)}/enviar`, request);
    expectStatus(response, 200);
    return { ...(await response.json()), request };
  }
  async function read(person, target) {
    const response = await person.client.get(target); expectStatus(response, 200); return response.json();
  }
  const balance = (person = ana, membership) => read(person,
    `${base()}/pontos${membership ? `?membershipId=${membership.id}` : ''}`);
  async function counts(submission) {
    const result = await fixture.database.query(`SELECT
      (SELECT count(*)::int FROM app."PointsEntry" WHERE "submissionId"=$1) AS ledger,
      (SELECT count(*)::int FROM app."SubmissionEvent" WHERE "submissionId"=$1) AS events,
      (SELECT count(*)::int FROM app."OutboxEvent" WHERE "submissionId"=$1) AS outbox,
      (SELECT count(*)::int FROM app."Conversation" WHERE "subjectId"=$1 AND "subjectType"='SUBMISSION') AS conversations`, [submission.id]);
    return result.rows[0];
  }
  async function withConstraint(table, expression, operation) {
    assert.ok(['SubmissionEvent', 'PointsEntry', 'OutboxEvent', 'Conversation'].includes(table));
    const name = `t07_proof_${randomUUID().replaceAll('-', '')}`;
    await fixture.database.query(`ALTER TABLE app."${table}" ADD CONSTRAINT "${name}" CHECK (${expression})`);
    try { return await operation(); }
    finally { await fixture.database.query(`ALTER TABLE app."${table}" DROP CONSTRAINT "${name}"`); }
  }
  async function photo(draft, person = ana) {
    assert.equal(process.env.MEDIA_PREFIX, `${process.env.T02_TASK}-integration`);
    const directory = process.env.T06_MEDIA_FIXTURES;
    assert.ok(directory, 'A integração exige imagens sintéticas preparadas para T07.');
    const bytes = await readFile(path.join(directory, 'photo.png'));
    const input = { operationId: randomUUID(), mediaType: 'PHOTO', mimeType: 'image/png',
      byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    const response = await person.client.post(`${base()}/midia/${draft.collectionId}`, { files: [input] });
    expectStatus(response, 201);
    const [asset] = (await response.json()).items;
    const target = `${base()}/midia/arquivos/${asset.id}`;
    expectStatus(await person.client.request(`${target}/partes?offset=0`, { method: 'PUT', body: bytes,
      headers: { 'Content-Type': 'application/octet-stream' } }), 200);
    expectStatus(await person.client.post(`${target}/concluir`, {}), 202);
    return { asset, target, process: () => processMediaBatch({ limit: 10 }) };
  }
  return { ...fixture, user, owner, ana, bia, store, merchant, participation, otherParticipation,
    base, activityPath, submissionPath, create, update, prepare, body, submit, read, balance, counts, withConstraint, photo };
}
