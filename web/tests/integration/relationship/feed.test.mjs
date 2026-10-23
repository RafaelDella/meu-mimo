import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { relationshipFixture, closeRuntime } from './helpers.mjs';
import { albumFixture } from '../albums/helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

const find = (page, origin) => page.items.find(item => item.subjectId === origin.id);

test('mural vazio e rascunho não revelam conquista ou mídia ainda não recebida', async t => {
  const f = await relationshipFixture(t);
  assert.deepEqual(await f.feed(), { items: [], total: 0, page: 1, pageSize: 20 });
  const draft = await f.prepare(await f.create());
  assert.equal(draft.status, 'DRAFT');
  assert.equal((await f.feed()).total, 0); assert.equal((await f.feed(f.owner)).total, 0);
  await f.submit(draft);
  const item = find(await f.feed(), draft);
  assert.equal(item.subjectType, 'SUBMISSION'); assert.equal(item.status, 'PENDING');
  assert.equal(item.preview, null); assert.equal(item.publishedMediaCount, 0);
  assert.ok(item.conversationId); assert.equal(item.path, `/lojas/${f.store.id}/registros/${draft.id}`);
});

test('mural de Ana e Bia isola origem, legenda, reação e filtro de pessoa do lojista', async t => {
  const f = await relationshipFixture(t);
  const ana = await f.thread(f.ana, { name: 'Só Ana' });
  const bia = await f.thread(f.bia, { name: 'Só Bia' });
  await f.react(bia, '🌷', f.bia);
  const page = await f.feed(f.ana);
  assert.deepEqual(page.items.map(item => item.subjectId), [ana.record.id]);
  assert.equal(JSON.stringify(page).includes(bia.record.id), false);
  assert.equal(JSON.stringify(page).includes(f.otherParticipation.id), false);
  assert.deepEqual((await f.feed(f.bia)).items.map(item => item.subjectId), [bia.record.id]);
  const merchant = await f.feed(f.owner, `?participantMembershipId=${f.participation.id}`);
  assert.deepEqual(merchant.items.map(item => item.subjectId), [ana.record.id]);
  await errorCode(await f.ana.client.get(`${f.base()}/mural?participantMembershipId=${f.participation.id}`), 400);
  const elsewhere = await f.createStore(f.owner, 'Outra loja privada');
  await f.addMembership(elsewhere, f.owner, 'MERCHANT');
  const anotherMembership = await f.addMembership(elsewhere, f.ana);
  await errorCode(await f.owner.client.get(`${f.base()}/mural?participantMembershipId=${anotherMembership.id}`), 404);
  assert.equal((await f.read(`${f.base(elsewhere)}/mural`)).total, 0);
});

test('estado atual mantém um card por origem após aprovação, contestação, anulação e resgate', async t => {
  const f = await relationshipFixture(t);
  const pending = await f.thread();
  const contested = await f.thread(); await f.decide(contested.record, 'CONTEST');
  const voided = await f.thread(); await f.decide(voided.record, 'VOID');
  const credited = await f.credit(15);
  const reward = await f.createReward(); const ticket = await f.redeem(reward);
  const page = await f.feed();
  assert.equal(page.total, 5);
  assert.equal(find(page, pending.record).status, 'PENDING');
  assert.equal(find(page, contested.record).status, 'CONTESTED');
  assert.equal(find(page, voided.record).status, 'VOIDED');
  assert.equal(find(page, credited).status, 'APPROVED');
  assert.equal(find(page, ticket).status, 'WAITING_AGREEMENT');
  assert.deepEqual((await f.feed(f.ana, '?type=SUBMISSION&status=VOIDED')).items.map(item => item.subjectId), [voided.record.id]);
  assert.deepEqual((await f.feed(f.ana, '?type=TICKET')).items.map(item => item.subjectId), [ticket.id]);
  for (const query of ['?status=DRAFT', '?status=ANNULLED', '?type=SUBMISSION&status=CANCELLED', '?type=TICKET&status=PENDING']) {
    await errorCode(await f.ana.client.get(`${f.base()}/mural${query}`), 400);
  }
});

test('comentário e reação não duplicam nem reordenam cards ou movimentam a economia', async t => {
  const f = await relationshipFixture(t);
  const older = await f.thread(); await f.thread();
  const before = await f.feed(); const finances = await f.financial();
  await f.comment(older); await f.react(older, '🔥');
  const after = await f.feed();
  assert.equal(after.total, before.total);
  assert.deepEqual(after.items.map(item => [item.id, item.occurredAt]), before.items.map(item => [item.id, item.occurredAt]));
  assert.equal(find(after, older.record).reactions.mine, '🔥');
  assert.deepEqual(await f.financial(), finances);
});

test('paginação padrão20/máximo50 é estável e não perde nem repete origens', async t => {
  const f = await relationshipFixture(t);
  const activity = await f.create({ frequency: 'WEEKLY', weeklyLimit: 100 });
  for (let index = 0; index < 21; index++) {
    if (index % 5 === 0) await f.resetLimits();
    await f.submit(await f.prepare(activity));
  }
  const first = await f.feed(); const second = await f.feed(f.ana, '?page=2');
  assert.equal(first.total, 21); assert.equal(first.items.length, 20); assert.equal(second.items.length, 1);
  const ids = [...first.items, ...second.items].map(item => item.id);
  assert.equal(new Set(ids).size, 21);
  assert.deepEqual((await f.feed()).items.map(item => item.id), first.items.map(item => item.id));
  assert.equal((await f.feed(f.ana, '?pageSize=50')).items.length, 21);
  for (const query of ['?page=0', '?pageSize=51', '?pageSize=0', '?page=1.5']) {
    await errorCode(await f.ana.client.get(`${f.base()}/mural${query}`), 400);
  }
});

test('período civil respeita meia-noite do fuso da loja e rejeita intervalo inválido', async t => {
  const f = await relationshipFixture(t); await f.credit(15);
  const reward = await f.createReward({ cost: 1 });
  const lastDay = await f.withEmissionClock('2024-11-03T02:30:00Z', () => f.redeem(reward));
  const nextDay = await f.withEmissionClock('2024-11-03T03:30:00Z', () => f.redeem(reward));
  assert.deepEqual((await f.feed(f.ana, '?type=TICKET&from=2024-11-02&to=2024-11-02')).items.map(item => item.subjectId), [lastDay.id]);
  assert.deepEqual((await f.feed(f.ana, '?type=TICKET&from=2024-11-03&to=2024-11-03')).items.map(item => item.subjectId), [nextDay.id]);
  for (const query of ['?from=2024-02-30', '?from=2024-11-04&to=2024-11-03', '?to=amanha']) {
    await errorCode(await f.ana.client.get(`${f.base()}/mural${query}`), 400);
  }
});

test('preview da evidência exige publicação; prazo atual e proteção de análise são reavaliados', async t => {
  const f = await relationshipFixture(t);
  const draft = await f.prepare(await f.create());
  const photo = await f.photo(draft); assert.equal((await photo.process()).processed, 1);
  assert.equal((await f.feed()).total, 0);
  const received = await f.submit(draft, f.ana, { evidenceAssetId: photo.asset.id });
  assert.deepEqual(find(await f.feed(), received).preview, { assetId: photo.asset.id, mediaType: 'PHOTO' });
  // Somente relógio da mídia sintética; a origem e o crédito continuam provenientes da API.
  await f.database.query('UPDATE app."MediaAsset" SET "publishedAt"=now()-interval \'180 days 1 minute\' WHERE id=$1', [photo.asset.id]);
  assert.equal(find(await f.feed(), received).publishedMediaCount, 1, 'Análise pendente protege a evidência.');
  await f.decide(received, 'APPROVE');
  const expired = find(await f.feed(), received);
  assert.equal(expired.preview, null); assert.equal(expired.publishedMediaCount, 0);
});

test('preview T11 usa somente álbum publicado, esconde remoção e conserva hold até resolver ticket', async t => {
  const f = await albumFixture(t);
  const feed = async () => {
    const response = await f.ana.client.get(`/api/lojas/${f.store.id}/mural`); expectStatus(response, 200); return response.json();
  };
  const assets = await f.ready(['photo.png', 'photo.webp']);
  assert.equal(find(await feed(), { id: f.memory.subjectId }).publishedMediaCount, 0);
  await f.publish([assets[0].id]);
  assert.deepEqual(find(await feed(), { id: f.memory.subjectId }).preview, { assetId: assets[0].id, mediaType: 'PHOTO' });
  expectStatus(await f.owner.client.post(`${f.assetPath(assets[0].id)}/remover`, {}), 200);
  assert.equal(find(await feed(), { id: f.memory.subjectId }).publishedMediaCount, 0);
  await f.resetLimits(); await f.publish([assets[1].id]);
  expectStatus(await f.owner.client.post(`/api/lojas/${f.store.id}/participacoes/${f.participation.id}/encerrar`, {}), 200);
  await f.database.query('UPDATE app."Membership" SET "closedAt"=\'2024-02-29T12:34:56Z\' WHERE id=$1', [f.participation.id]);
  assert.equal(find(await feed(), { id: f.memory.subjectId }).publishedMediaCount, 1);
  await f.transition('FULFILL');
  const expired = find(await feed(), { id: f.memory.subjectId });
  assert.equal(expired.status, 'FULFILLED'); assert.equal(expired.preview, null); assert.equal(expired.publishedMediaCount, 0);
});
