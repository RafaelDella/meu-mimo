import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { activityFixture } from '../activities/helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';
import { processMediaBatch } from '../../../src/server/media-worker/processing.ts';

export { closeRuntime, deliver } from '../activities/helpers.mjs';

export async function reviewFixture(t) {
  const f = await activityFixture(t);
  const latest = (record, person = f.owner) => f.read(person, f.submissionPath(record));
  async function received(fields = {}, person = f.ana, extra = {}) {
    const activity = await f.create(fields);
    return f.submit(await f.prepare(activity, person), person, extra);
  }
  async function reviewBody(record, action, extra = {}) {
    const current = await latest(record);
    const balance = await f.balance(f.owner, { id: current.participantMembershipId });
    return { operationId: randomUUID(), expectedVersion: current.analysis.version, action,
      reason: action === 'APPROVE' ? '' : 'Motivo de integração T08 fictício.',
      expectedBalance: balance.available, ...extra };
  }
  async function decide(record, action, extra = {}, person = f.owner) {
    const request = await reviewBody(record, action, extra);
    const response = await person.client.post(`${f.submissionPath(record)}/analise`, request);
    expectStatus(response, 200);
    return { ...(await response.json()), request };
  }
  async function responseBody(record, extra = {}) {
    const current = await latest(record, f.ana);
    return { operationId: randomUUID(), expectedVersion: current.analysis.version,
      requestId: current.analysis.requestId, evidenceRevision: current.analysis.evidenceRevision,
      text: 'Uma resposta de integração fictícia.', evidenceAssetId: null, ...extra };
  }
  async function respond(record, extra = {}) {
    const request = await responseBody(record, extra);
    const response = await f.ana.client.post(`${f.submissionPath(record)}/resposta`, request);
    expectStatus(response, 200);
    return { ...(await response.json()), request };
  }
  const history = (record, person = f.ana, query = '') =>
    f.read(person, `${f.submissionPath(record)}/historico${query}`);
  const operation = (record, id, person = f.owner) =>
    f.read(person, `${f.submissionPath(record)}/operacoes/${id}`);
  const entries = (query = '', person = f.ana) => f.read(person, `${f.base()}/pontos/movimentos${query}`);
  async function counts(record) {
    return (await f.database.query(`SELECT
      (SELECT count(*)::int FROM app."PointsEntry" WHERE "submissionId"=$1) AS ledger,
      (SELECT count(*)::int FROM app."SubmissionReviewEvent" WHERE "submissionId"=$1) AS reviews,
      (SELECT count(*)::int FROM app."OutboxEvent" WHERE "submissionId"=$1 AND "reviewEventId" IS NOT NULL) AS outbox`, [record.id])).rows[0];
  }
  async function ledger(record) {
    return (await f.database.query(`SELECT id, kind, amount::text, "sourceKey", "reviewEventId",
      "compensatesEntryId", "actorProfileId" FROM app."PointsEntry"
      WHERE "submissionId"=$1 ORDER BY "createdAt", id`, [record.id])).rows;
  }
  async function withFailure(table, operationId, work) {
    assert.ok(['PointsEntry', 'OutboxEvent', 'SubmissionReviewEvent'].includes(table));
    const column = table === 'SubmissionReviewEvent' ? 'id' : 'reviewEventId';
    const constraint = `t08_failure_${randomUUID().replaceAll('-', '')}`;
    await f.database.query(`ALTER TABLE app."${table}" ADD CONSTRAINT "${constraint}"
      CHECK ("${column}" IS DISTINCT FROM '${operationId}'::uuid)`);
    try { return await work(); }
    finally { await f.database.query(`ALTER TABLE app."${table}" DROP CONSTRAINT "${constraint}"`); }
  }
  async function photo(record, person = f.ana) {
    assert.equal(process.env.MEDIA_PREFIX, 't08-integration');
    const directory = process.env.T06_MEDIA_FIXTURES;
    assert.ok(directory, 'T08 exige fotos sintéticas próprias, sem dados pessoais.');
    const bytes = await readFile(path.join(directory, 'photo.png'));
    const input = { operationId: randomUUID(), mediaType: 'PHOTO', mimeType: 'image/png',
      byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    const reserved = await person.client.post(`${f.base()}/midia/${record.collectionId}`, { files: [input] });
    expectStatus(reserved, 201);
    const [asset] = (await reserved.json()).items;
    const target = `${f.base()}/midia/arquivos/${asset.id}`;
    expectStatus(await person.client.request(`${target}/partes?offset=0`, { method: 'PUT', body: bytes,
      headers: { 'Content-Type': 'application/octet-stream' } }), 200);
    expectStatus(await person.client.post(`${target}/concluir`, {}), 202);
    return { asset, target, process: () => processMediaBatch({ limit: 10 }) };
  }
  const collection = id => f.database.query('SELECT * FROM app."MediaCollection" WHERE id=$1', [id]).then(result => result.rows[0]);
  const mediaRow = id => f.database.query('SELECT * FROM app."MediaAsset" WHERE id=$1', [id]).then(result => result.rows[0]);
  return { ...f, latest, received, reviewBody, decide, responseBody, respond, history, operation,
    entries, counts, ledger, withFailure, photo, collection, mediaRow };
}
