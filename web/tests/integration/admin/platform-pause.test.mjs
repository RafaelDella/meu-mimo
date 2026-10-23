import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { fileInput, fixtureBytes } from '../media/helpers.mjs';
import { invitation, merchantState, part, pause, photoReservation, resume, storeTarget, transition, uploadPhoto } from './platform-pause-helpers.mjs';
after(closeRuntime);

test('pausas independentes: cada retomada conserva a outra causa e sua revisão', async t => {
  const f = await adminFixture(t); const before = await f.financial();
  const merchantPause = await merchantState(f, 'pause'); assert.equal(merchantPause.state, 'PAUSED');
  const platformPause = await pause(f);
  let normal = await f.read(f.base());
  assert.equal(normal.state, 'PAUSED'); assert.ok(normal.platformPausedAt);
  assert.equal(JSON.stringify(normal).includes(platformPause.request.reason), false);
  const merchantResume = await merchantState(f, 'resume');
  assert.equal(merchantResume.state, 'ACTIVE'); assert.equal(merchantResume.platformPausedAt, normal.platformPausedAt);
  let admin = await f.adminRead(f.targetPath(storeTarget(f)));
  assert.equal(admin.version, platformPause.appliedVersion);
  await merchantState(f, 'pause'); await resume(f);
  normal = await f.read(f.base()); assert.equal(normal.state, 'PAUSED'); assert.equal(normal.platformPausedAt, null);
  admin = await f.adminRead(f.targetPath(storeTarget(f)));
  const platformVersion = admin.version;
  await merchantState(f, 'resume');
  normal = await f.read(f.base()); assert.equal(normal.state, 'ACTIVE'); assert.equal(normal.platformPausedAt, null);
  assert.equal((await f.adminRead(f.targetPath(storeTarget(f)))).version, platformVersion);
  assert.deepEqual(await f.financial(), before);
});

test('remover pausa da plataforma não reabre loja ou participação encerrada', async t => {
  const f = await adminFixture(t);
  expectStatus(await f.owner.client.post(`${f.base()}/participacoes/${f.participation.id}/encerrar`, {}), 200);
  await merchantState(f, 'close'); await pause(f); await resume(f);
  const normal = await f.read(f.base());
  assert.equal(normal.state, 'CLOSED'); assert.equal(normal.platformPausedAt, null);
  const person = await f.read(`${f.base()}/participacoes/${f.participation.id}`);
  assert.ok(person.closedAt);
  await errorCode(await f.owner.client.post(`${f.base()}/convites`, { operationId: randomUUID() }), 409, 'store_closed');
});

test('pausa bloqueia convite, aceite novo, preparo/recebimento de DRAFT e resgate direto', async t => {
  const f = await adminFixture(t); await f.credit(30);
  const activity = await f.create(); const draft = await f.prepare(activity);
  const reward = await f.createReward(); const redemption = await f.redemptionBody(reward);
  const link = await invitation(f); const newcomer = await f.user();
  const before = await f.financial(); await pause(f);
  await errorCode(await f.owner.client.post(`${f.base()}/convites`, { operationId: randomUUID() }), 409, 'store_platform_paused');
  await errorCode(await newcomer.client.post(`/api/convites/${link.token}/aceitar`, {}), 409, 'store_platform_paused');
  await errorCode(await f.ana.client.post(`${f.activityPath(activity)}/preparar`, { operationId: randomUUID() }), 409, 'store_platform_paused');
  await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft)), 409, 'store_platform_paused');
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, redemption), 409, 'store_platform_paused');
  assert.deepEqual(await f.financial(), before);
  assert.equal((await f.database.query('SELECT "acceptedAt" FROM app."Invitation" WHERE id=$1', [link.id])).rows[0].acceptedAt, null);
  const preview = await f.read(`/api/convites/${link.token}`, newcomer);
  assert.equal(preview.status, 'PAUSED'); assert.equal(Object.hasOwn(preview, 'reason'), false);
  expectStatus(await f.ana.client.post(`/api/convites/${link.token}/aceitar`, {}), 200);
  assert.equal((await f.preview(reward)).availability.eligible, false);
  assert.equal((await f.read(f.activityPath(activity), f.ana)).availability.eligible, false);
  await f.resetLimits();
  await f.update(activity, { description: 'Preparar a retomada continua permitido.' });
  await f.updateReward(reward, { description: 'Catálogo pode ser preparado.' });
  const elsewhere = await f.createStore(f.owner, 'Outra loja ativa');
  await f.addMembership(elsewhere, f.owner, 'MERCHANT'); await f.addMembership(elsewhere, f.ana);
  const otherActivity = await f.create({}, f.owner, elsewhere);
  expectStatus(await f.ana.client.post(`${f.activityPath(otherActivity, elsewhere)}/preparar`, { operationId: randomUUID() }), 201);
});

test('replay autorizado recupera convite, DRAFT e emissões confirmadas sem nova origem', async t => {
  const f = await adminFixture(t); const received = await f.credit(30);
  const reward = await f.createReward(); const ticket = await f.redeem(reward);
  const activity = await f.create(); const draft = await f.prepare(activity);
  const link = await invitation(f); const before = await f.financial();
  await pause(f);
  expectStatus(await f.owner.client.post(`${f.base()}/convites`, link.request), 201);
  expectStatus(await f.ana.client.post(`${f.submissionPath(received)}/enviar`, received.request), 200);
  expectStatus(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, ticket.request), 200);
  expectStatus(await f.ana.client.post(`${f.activityPath(activity)}/preparar`, { operationId: draft.id }), 201);
  await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft)), 409, 'store_platform_paused');
  assert.deepEqual(await f.financial(), before);
  assert.equal((await f.emissionCounts(ticket.id)).tickets, 1);
});

test('evidência DRAFT já reservada não permite continuar partes ou concluir após a pausa', async t => {
  const f = await adminFixture(t); const activity = await f.create({ frequency: 'WEEKLY', weeklyLimit: 10 });
  const first = await f.prepare(activity); const second = await f.prepare(activity); const third = await f.prepare(activity);
  const partial = await photoReservation(f, f.ana, first.collectionId);
  const half = Math.max(1, Math.floor(partial.bytes.length / 2));
  expectStatus(await part(f.ana, partial, 0, partial.bytes.subarray(0, half)), 200);
  const complete = await photoReservation(f, f.ana, second.collectionId);
  expectStatus(await part(f.ana, complete), 200);
  const before = await f.financial(); await pause(f);
  await errorCode(await f.ana.client.post(`${f.base()}/midia/${third.collectionId}`, {
    files: [fileInput(await fixtureBytes('photo.png'))],
  }), 409, 'store_platform_paused');
  await errorCode(await part(f.ana, partial, half), 409, 'store_platform_paused');
  await errorCode(await f.ana.client.post(`${complete.path}/concluir`, {}), 409, 'store_platform_paused');
  const collection = await f.read(`${f.base()}/midia/${first.collectionId}`, f.ana);
  assert.equal(collection.collection.writable, false);
  const assets = (await f.database.query('SELECT id,"uploadedBytes",state FROM app."MediaAsset" WHERE id=ANY($1::uuid[])',
    [[partial.asset.id, complete.asset.id]])).rows;
  assert.equal(assets.find(row => row.id === partial.asset.id).uploadedBytes, half);
  assert.ok(assets.every(row => row.state === 'UPLOADING'));
  assert.deepEqual(await f.financial(), before);
});

for (const merchantPaused of [false, true]) test(`análise/complemento e relação existentes continuam com pausa da plataforma; lojista pausado=${merchantPaused}`, async t => {
  const f = await adminFixture(t); const thread = await f.thread();
  if (merchantPaused) await merchantState(f, 'pause');
  await pause(f); await f.decide(thread.record, 'CONTEST');
  const photo = await f.photo(await f.latest(thread.record, f.ana));
  assert.equal((await photo.process()).processed, 1);
  await f.respond(thread.record, { evidenceAssetId: photo.asset.id });
  await f.decide(thread.record, 'APPROVE');
  assert.equal((await f.balance()).available, '15');
  const before = await f.financial();
  await f.comment(thread, 'Conversa existente segue privada.'); await f.react(thread, '🌷');
  const note = await f.send('Bilhete durante a pausa.'); await f.mark(note.applied);
  assert.deepEqual(await f.financial(), before);
  const normal = await f.read(f.base()); assert.ok(normal.platformPausedAt);
  assert.equal(normal.state, merchantPaused ? 'PAUSED' : 'ACTIVE');
});

test('combinado, realização, pedido/recusa e cancelamento tratam tickets emitidos antes da pausa', async t => {
  const f = await adminFixture(t); await f.credit(100);
  const reward = await f.createReward({ stock: 3 });
  const first = await f.redeem(reward); const second = await f.redeem(reward); await pause(f);
  await transition(f, first, 'AGREE'); await transition(f, first, 'FULFILL');
  await transition(f, second, 'REQUEST_CANCELLATION'); await transition(f, second, 'REJECT_CANCELLATION');
  await transition(f, second, 'REQUEST_CANCELLATION'); await transition(f, second, 'CANCEL', { restock: true });
  assert.equal((await f.ticket(first)).status, 'FULFILLED'); assert.equal((await f.ticket(second)).status, 'CANCELLED');
  assert.equal((await f.balance()).available, '90'); assert.equal((await f.rewardRow(reward)).stock, 2);
  assert.deepEqual((await f.ticket(first)).snapshot, first.snapshot);
  assert.deepEqual((await f.ticket(second)).snapshot, second.snapshot);
});

test('álbum de ticket existente pode iniciar/publicar sob pausa e mantém leitura privada/Range', async t => {
  const f = await adminFixture(t); await f.credit(15);
  const ticket = await f.redeem(await f.createReward()); const before = await f.financial(); await pause(f);
  const albumPath = `${f.ticketPath(ticket)}/album`;
  const started = await f.owner.client.post(`${albumPath}/iniciar`, { operationId: randomUUID() }); expectStatus(started, 201);
  const album = (await started.json()).album;
  const photo = await uploadPhoto(f, f.owner, album.collectionId);
  const publication = await f.owner.client.post(`${albumPath}/publicacoes`, { operationId: randomUUID(), expectedVersion: album.version,
    items: [{ assetId: photo.asset.id, caption: 'Um momento já combinado.' }] });
  expectStatus(publication, 200);
  assert.equal((await f.read(albumPath, f.ana)).total, 1);
  const signed = await f.ana.client.post(`${photo.path}/acesso`, { variant: 'display' }); expectStatus(signed, 200);
  expectStatus(await f.ana.client.get((await signed.json()).url, { Range: 'bytes=0-15' }), 206);
  await errorCode(await f.bia.client.get(albumPath), 404);
  const collection = (await f.database.query('SELECT "retentionUntil","uploadsClosedAt" FROM app."MediaCollection" WHERE id=$1', [album.collectionId])).rows[0];
  assert.equal(collection.retentionUntil, null); assert.equal(collection.uploadsClosedAt, null);
  assert.deepEqual(await f.financial(), before);
});

for (const kind of ['invitation', 'submission', 'redemption']) test(`corrida pausa × ${kind} confirma somente uma ordem serial autorizada`, async t => {
  const f = await adminFixture(t);
  let command; let expectedStatus; let select; let values;
  if (kind === 'invitation') {
    const operationId = randomUUID(); expectedStatus = 201;
    command = () => f.owner.client.post(`${f.base()}/convites`, { operationId });
    select = 'SELECT "createdAt" AS instant FROM app."Invitation" WHERE id=$1'; values = [operationId];
  } else if (kind === 'submission') {
    const draft = await f.prepare(await f.create()); expectedStatus = 200;
    command = () => f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft));
    select = 'SELECT "receivedAt" AS instant FROM app."ActivitySubmission" WHERE id=$1 AND "receivedAt" IS NOT NULL'; values = [draft.id];
  } else {
    await f.credit(15); const reward = await f.createReward(); const request = await f.redemptionBody(reward); expectedStatus = 200;
    command = () => f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, request);
    select = 'SELECT "createdAt" AS instant FROM app."Redemption" WHERE id=$1'; values = [request.operationId];
  }
  const [admin, source] = await Promise.all([pause(f), command()]);
  assert.ok([expectedStatus, 409].includes(source.status));
  const rows = (await f.database.query(select, values)).rows;
  if (source.status === expectedStatus) {
    expectStatus(source, expectedStatus); assert.equal(rows.length, 1);
    assert.ok(new Date(rows[0].instant).getTime() <= new Date(admin.current.platformPausedAt).getTime());
  } else {
    await errorCode(source, 409, 'store_platform_paused'); assert.equal(rows.length, 0);
  }
});
