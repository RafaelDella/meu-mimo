import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { activityFixture, closeRuntime, deliver } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { expireMediaBatch } from '../../../src/server/media-worker/retention.ts';

after(closeRuntime);

test('foto da origem T07 precisa ficar READY; recebimento publica, fecha e protege evidência manual', async t => {
  const f = await activityFixture(t);
  const draft = await f.prepare(await f.create());
  const media = await f.photo(draft);
  await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`,
    f.body(draft, { evidenceAssetId: media.asset.id })), 409, 'media_not_ready');
  assert.equal((await f.read(f.ana, f.submissionPath(draft))).status, 'DRAFT');
  const processed = await media.process(); assert.ok(processed.processed >= 1);
  const ready = await f.read(f.ana, media.target);
  assert.equal(ready.state, 'READY'); assert.equal(ready.publishedAt, null);
  await errorCode(await f.owner.client.get(media.target), 404);
  await errorCode(await f.bia.client.get(media.target), 404);
  const received = await f.submit(draft, f.ana, { evidenceAssetId: media.asset.id });
  assert.equal(received.evidenceAssetId, media.asset.id);
  expectStatus(await f.owner.client.get(media.target), 200);
  const accessResponse = await f.owner.client.post(`${media.target}/acesso`, { variant: 'display' });
  expectStatus(accessResponse, 200);
  const access = await accessResponse.json();
  assert.equal(new URL(access.url, f.environment.origin).origin, f.environment.origin);
  const content = await f.owner.client.get(access.url);
  expectStatus(content, 200); assert.match(content.headers.get('content-type'), /^image\/jpeg/);
  assert.ok((await content.arrayBuffer()).byteLength > 0);
  await errorCode(await f.bia.client.post(`${media.target}/acesso`, { variant: 'display' }), 404);
  await errorCode(await f.ana.client.post(`${media.target}/remover`, {}), 409);
  const collection = await f.database.query('SELECT "subjectId", "uploadsClosedAt", "retentionHold", "retentionUntil" FROM app."MediaCollection" WHERE id=$1', [draft.collectionId]);
  assert.equal(collection.rows[0].subjectId, draft.id); assert.ok(collection.rows[0].uploadsClosedAt);
  assert.equal(collection.rows[0].retentionHold, true);
  const conversation = await f.database.query('SELECT "subjectType", "subjectId", "participantMembershipId" FROM app."Conversation" WHERE id=$1', [received.conversation.id]);
  assert.deepEqual(conversation.rows[0], { subjectType: 'SUBMISSION', subjectId: received.id,
    participantMembershipId: f.participation.id });
  await f.database.query('UPDATE app."MediaAsset" SET "publishedAt"=now()-interval \'181 days\' WHERE id=$1', [media.asset.id]);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 0 });
  const authorGrant = await f.ana.client.post(`${media.target}/acesso`, { variant: 'display' });
  expectStatus(authorGrant, 200);
  const authorURL = (await authorGrant.json()).url;
  expectStatus(await f.ana.client.get(authorURL), 200);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  await errorCode(await f.ana.client.get(media.target), 404);
  await errorCode(await f.ana.client.get(authorURL), 404);
});

test('outra coleção, autor ou foto inexistente não se tornam evidência; automático libera retenção de 180 dias', async t => {
  const f = await activityFixture(t);
  const activity = await f.create({ frequency: 'WEEKLY', weeklyLimit: 3, approvalMode: 'AUTOMATIC' });
  const draft = await f.prepare(activity);
  const second = await f.prepare(activity);
  const biaDraft = await f.prepare(activity, f.bia);
  const wrongCollection = await f.photo(second);
  const wrongAuthor = await f.photo(biaDraft, f.bia);
  await wrongCollection.process();
  for (const evidenceAssetId of [wrongCollection.asset.id, wrongAuthor.asset.id, randomUUID()]) {
    await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft, { evidenceAssetId })), 404);
  }
  const own = await f.photo(draft);
  await own.process();
  const received = await f.submit(draft, f.ana, { evidenceAssetId: own.asset.id });
  assert.equal(received.status, 'APPROVED');
  const collection = (await f.database.query('SELECT "retentionHold", "retentionUntil" FROM app."MediaCollection" WHERE id=$1', [draft.collectionId])).rows[0];
  assert.equal(collection.retentionHold, false);
  assert.equal(collection.retentionUntil, null); // EVIDENCE conta a partir de publishedAt, sem prazo de álbum.
  await errorCode(await f.owner.client.post(`${own.target}/remover`, {}), 404);
  await errorCode(await f.ana.client.post(`${own.target}/remover`, {}), 409);
  assert.equal((await f.balance()).available, '15');
  await f.database.query('UPDATE app."MediaAsset" SET "publishedAt"=now()-interval \'179 days\' WHERE id=$1', [own.asset.id]);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 0 });
  await f.database.query('UPDATE app."MediaAsset" SET "publishedAt"=now()-interval \'181 days\' WHERE id=$1', [own.asset.id]);
  assert.deepEqual(await expireMediaBatch(), { orphaned: 0, expired: 1 });
  assert.equal((await f.read(f.ana, f.submissionPath(received))).snapshot.points, 15);
});

test('registro recebido e comentário geram novidades somente para a outra pessoa, com destino real reautorizado', async t => {
  const f = await activityFixture(t);
  const received = await f.submit(await f.prepare(await f.create()));
  await deliver();
  const ownerPage = await f.read(f.owner, '/api/notificacoes');
  const notification = ownerPage.items.find(item => item.kind === 'SUBMISSION_RECEIVED');
  assert.ok(notification); assert.equal((await f.read(f.ana, '/api/notificacoes')).total, 0);
  assert.equal((await f.read(f.bia, '/api/notificacoes')).total, 0);
  const target = await f.read(f.owner, `/api/notificacoes/${notification.id}/destino`);
  assert.equal(target.path, `/lojas/${f.store.id}/registros/${received.id}`);
  expectStatus(await f.owner.client.post(`${f.base()}/conversas/${received.conversation.id}/comentarios`, {
    operationId: randomUUID(), text: 'Recebi sua conquista.',
  }), 201);
  await deliver();
  const comments = (await f.read(f.ana, '/api/notificacoes')).items;
  assert.equal(comments.length, 1); assert.equal(comments[0].kind, 'COMMENT_CREATED');
  const commentTarget = await f.read(f.ana, `/api/notificacoes/${comments[0].id}/destino`);
  assert.equal(commentTarget.path, `/lojas/${f.store.id}/registros/${received.id}`);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  await errorCode(await f.ana.client.get(`/api/notificacoes/${comments[0].id}/destino`), 404);
});

test('falha no outbox depois do crédito também reverte publicação da foto; retry confirma tudo uma vez', async t => {
  const f = await activityFixture(t);
  const draft = await f.prepare(await f.create({ approvalMode: 'AUTOMATIC' }));
  const media = await f.photo(draft); await media.process();
  const request = f.body(draft, { evidenceAssetId: media.asset.id });
  await f.withConstraint('OutboxEvent', `"submissionId" <> '${draft.id}'::uuid`, async () => {
    await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, request), 503);
    assert.deepEqual(await f.counts(draft), { ledger: 0, events: 0, outbox: 0, conversations: 0 });
    const photo = await f.read(f.ana, media.target);
    assert.equal(photo.state, 'READY'); assert.equal(photo.publishedAt, null);
    const collection = (await f.database.query('SELECT "uploadsClosedAt", "retentionHold" FROM app."MediaCollection" WHERE id=$1', [draft.collectionId])).rows[0];
    assert.equal(collection.uploadsClosedAt, null); assert.equal(collection.retentionHold, true);
    await errorCode(await f.owner.client.get(media.target), 404);
  });
  expectStatus(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, request), 200);
  expectStatus(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, request), 200);
  assert.deepEqual(await f.counts(draft), { ledger: 1, events: 2, outbox: 1, conversations: 1 });
  assert.ok((await f.read(f.owner, media.target)).publishedAt);
});

test('fuso alterado durante a preparação da foto exige nova revisão, preservando bytes prontos', async t => {
  const f = await activityFixture(t);
  const draft = await f.prepare(await f.create());
  const media = await f.photo(draft);
  expectStatus(await f.owner.client.patch(f.base(), { timezone: 'Europe/Lisbon' }), 200);
  await media.process();
  await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`,
    f.body(draft, { evidenceAssetId: media.asset.id })), 409, 'timezone_changed');
  assert.deepEqual(await f.counts(draft), { ledger: 0, events: 0, outbox: 0, conversations: 0 });
  assert.equal((await f.read(f.ana, media.target)).state, 'READY');
  const revised = await f.read(f.ana, f.submissionPath(draft));
  assert.equal(revised.review.timezone, 'Europe/Lisbon');
  const received = await f.submit(revised, f.ana, { evidenceAssetId: media.asset.id });
  assert.equal(received.timezone, 'Europe/Lisbon'); assert.equal(received.evidenceAssetId, media.asset.id);
});
