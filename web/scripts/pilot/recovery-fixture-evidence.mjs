import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { expectStatus } from '../../tests/integration/helpers/http-client.mjs';
import { json, rebaseSourceURL } from './recovery-fixture-context.mjs';

const tables = ['PointsEntry', 'Redemption', 'RedemptionEvent', 'SubmissionReviewEvent', 'Reward', 'RewardEvent',
  'Activity', 'ActivityEvent', 'ActivitySubmission', 'SubmissionEvent', 'AlbumEvent', 'TicketAlbum', 'OutboxEvent'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const base = state => `/api/lojas/${state.store.id}`;
export const submissionPath = (state, name) => `${base(state)}/registros/${state.records[name].id}`;
export const assetPath = (state, name) => `${base(state)}/midia/arquivos/${state.records[name].assetId}`;
export const commentsPath = (state, name = 'ana') => `${base(state)}/conversas/${state.records[name].conversationId}/comentarios`;

export async function financialSnapshot(database, state) {
  const client = await database.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const fingerprints = {};
    for (const table of tables) {
      const rows = await client.query(`SELECT row_to_json(t)::text AS data FROM app."${table}" t WHERE "storeId"=$1 ORDER BY id`, [state.store.id]);
      const hash = createHash('sha256');
      for (const row of rows.rows) { hash.update(row.data); hash.update('\n'); }
      fingerprints[table] = { count: rows.rowCount, sha256: hash.digest('hex') };
    }
    const balances = (await client.query(`SELECT m.id,m."profileId",m.role,coalesce(sum(p.amount),0)::text AS balance
      FROM app."Membership" m LEFT JOIN app."PointsEntry" p ON p."participantMembershipId"=m.id
      WHERE m."storeId"=$1 GROUP BY m.id ORDER BY m.id`, [state.store.id])).rows;
    await client.query('COMMIT'); return { fingerprints, balances };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function assertFinancial(database, state) {
  const current = await financialSnapshot(database, state);
  assert.deepEqual(current, state.financial, 'O financeiro integral da fixture deve permanecer idêntico ao corte.');
  assert.equal(current.balances.find(row => row.profileId === state.people.ana.id)?.balance, '5');
  assert.equal(current.balances.find(row => row.profileId === state.people.bia.id)?.balance, '15');
  assert.equal(current.fingerprints.PointsEntry.count, 3);
  assert.equal(current.fingerprints.Redemption.count, 1);
  return Object.values(current.fingerprints).reduce((sum, row) => sum + row.count, 0);
}

export async function mediaGrant(client, state, name, variant = 'display') {
  const response = await client.post(`${assetPath(state, name)}/acesso`, { variant }); expectStatus(response, 200);
  const value = await response.json();
  assert.equal(new URL(value.url, client.environment.origin).origin, client.environment.origin);
  return value;
}

export async function mediaBytes(client, grant, expected) {
  const response = await client.get(grant.url); expectStatus(response, 200);
  const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length > 16 && bytes.length < 10 * 1024 * 1024);
  const value = { bytes: bytes.length, sha256: sha256(bytes), rangeBytes: 16, rangeSha256: sha256(bytes.subarray(0, 16)) };
  if (expected) assert.deepEqual(value, expected, 'Os bytes privados restaurados devem coincidir com o corte.');
  const range = await client.get(grant.url, { Range: 'bytes=0-15' }); expectStatus(range, 206);
  assert.equal(range.headers.get('content-range'), `bytes 0-15/${value.bytes}`);
  const part = Buffer.from(await range.arrayBuffer()); assert.equal(part.length, 16); assert.equal(sha256(part), value.rangeSha256);
  return value;
}

export async function snapshotMedia(client, state, name) {
  const result = {};
  for (const variant of ['display', 'thumbnail']) {
    const grant = await mediaGrant(client, state, name, variant);
    result[variant] = { grant, content: await mediaBytes(client, grant) };
  }
  return result;
}

export async function assertMedia(client, state, name) {
  for (const variant of ['display', 'thumbnail']) {
    const grant = await mediaGrant(client, state, name, variant);
    await mediaBytes(client, grant, state.records[name].media[variant].content);
  }
}

export async function denyMedia(client, state, name, grants = state.records[name].media) {
  expectStatus(await client.get(assetPath(state, name)), 404);
  for (const variant of ['display', 'thumbnail']) {
    expectStatus(await client.post(`${assetPath(state, name)}/acesso`, { variant }), 404);
    const previous = rebaseSourceURL(client.environment, grants[variant].grant.url);
    for (const headers of [{}, { Range: 'bytes=0-15' }]) expectStatus(await client.get(previous, headers), 404);
  }
}

export async function assertPrivateViews(state, owner, bia, { suppressed = false } = {}) {
  const anaRecord = await json(owner, submissionPath(state, 'ana'));
  const biaRecord = await json(bia, submissionPath(state, 'bia'));
  assert.equal(anaRecord.caption, suppressed ? '[Conteúdo removido]' : state.text.anaCaption);
  assert.equal(anaRecord.evidenceAssetId, suppressed ? null : state.records.ana.assetId);
  assert.equal(biaRecord.caption, state.text.biaCaption); assert.equal(biaRecord.evidenceAssetId, state.records.bia.assetId);
  const comments = await json(owner, commentsPath(state));
  assert.equal(comments.items.find(item => item.id === state.comments.ana)?.text, suppressed ? '[Conteúdo removido]' : state.text.anaComment);
  assert.equal(comments.items.find(item => item.id === state.comments.owner)?.text, state.text.ownerComment);
  const biaComments = await json(bia, commentsPath(state, 'bia'));
  assert.equal(biaComments.items.find(item => item.id === state.comments.bia)?.text, state.text.biaComment);
  const note = await json(owner, `${base(state)}/participacoes/${state.memberships.ana.id}/bilhete`);
  assert.equal(note.current?.text, state.text.note);
  if (suppressed) {
    const serialized = JSON.stringify({ anaRecord, comments });
    assert.ok(!serialized.includes(state.text.anaCaption) && !serialized.includes(state.text.anaComment));
  }
  expectStatus(await bia.get(submissionPath(state, 'ana')), 404);
  expectStatus(await bia.get(assetPath(state, 'ana')), 404);
  expectStatus(await bia.get(`${base(state)}/bilhetes/versoes/${state.noteId}`), 404);
}

export async function assertRawOriginals(database, state, { suppressed = false } = {}) {
  for (const name of ['ana', 'bia']) {
    const record = state.records[name];
    const row = (await database.query(`SELECT s.caption,s."evidenceAssetId",a."authorProfileId",a."publishedAt"
      FROM app."ActivitySubmission" s JOIN app."MediaAsset" a ON a.id=s."evidenceAssetId"
      WHERE s.id=$1 AND s."storeId"=$2`, [record.id, state.store.id])).rows[0];
    assert.ok(row?.publishedAt); assert.equal(row.caption, state.text[`${name}Caption`]);
    assert.equal(row.evidenceAssetId, record.assetId); assert.equal(row.authorProfileId, state.people[name].id);
  }
  const comments = (await database.query('SELECT id,text FROM app."Comment" WHERE id=ANY($1::uuid[]) ORDER BY id', [Object.values(state.comments)])).rows;
  assert.equal(comments.length, 3);
  for (const name of ['ana', 'owner', 'bia']) assert.equal(comments.find(row => row.id === state.comments[name])?.text, state.text[`${name}Comment`]);
  const note = (await database.query('SELECT text,"actorProfileId" FROM app."NoteVersion" WHERE id=$1', [state.noteId])).rows[0];
  assert.equal(note?.text, state.text.note); assert.equal(note.actorProfileId, state.people.owner.id);
  const tombstones = (await database.query('SELECT scope FROM app."DataSuppression" WHERE "subjectProfileId"=$1 ORDER BY scope', [state.people.ana.id])).rows;
  assert.deepEqual(tombstones.map(row => row.scope).sort(), suppressed ? ['AUTHORED_CONTENT', 'IDENTITY'] : []);
}
