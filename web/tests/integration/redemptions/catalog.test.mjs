import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { redemptionFixture, rewardFields, closeRuntime, noEmission } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('catálogo privado começa sem saldo e diferencia ilimitado, esgotado e indisponível', async t => {
  const f = await redemptionFixture(t);
  const reward = await f.createReward();
  const empty = await f.createReward({ name: 'Esgotado', stock: 0 });
  const unavailable = await f.createReward({ name: 'Indisponível', available: false });
  assert.equal(reward.version, 1); assert.equal(reward.stockRevision, 1);
  const preview = await f.preview(reward);
  assert.deepEqual(preview.availability, { eligible: false, reason: 'INSUFFICIENT_POINTS',
    available: '0', pending: '0', resulting: '-10', shortfall: '10' });
  assert.equal((await f.preview(empty)).availability.reason, 'SOLD_OUT');
  assert.equal((await f.preview(unavailable)).availability.reason, 'UNAVAILABLE');
  assert.equal((await f.read(f.ana, `${f.base()}/mimos`)).total, 3);
  assert.deepEqual(await f.summary(), { total: 0, outstanding: 0 });
  assert.equal((await f.tickets()).total, 0);
  const pending = await f.received({ points: 20 });
  assert.equal(pending.status, 'PENDING');
  assert.equal((await f.preview(reward)).availability.pending, '20');
  await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, await f.redemptionBody(reward)), 409, 'insufficient_points');
  assert.equal((await f.balance()).available, '0');
});

test('saldo suficiente não permite emissão de esgotado, indisponível ou arquivado', async t => {
  const f = await redemptionFixture(t);
  await f.credit(30);
  const rewards = [await f.createReward({ stock: 0 }), await f.createReward({ available: false })];
  const archived = await f.createReward(); await f.archiveReward(archived); rewards.push(archived);
  for (const reward of rewards) {
    const request = await f.redemptionBody(reward);
    await errorCode(await f.ana.client.post(`${f.rewardPath(reward)}/resgatar`, request), 409, 'reward_unavailable');
    assert.deepEqual(await f.emissionCounts(request.operationId), noEmission);
  }
  assert.equal((await f.balance()).available, '30'); assert.equal((await f.tickets()).total, 0);
});

test('CRUD usa Unicode, limite 16KiB, versões e UUID sem duplicar configuração', async t => {
  const f = await redemptionFixture(t);
  const fields = rewardFields({ name: '🎁'.repeat(80), category: '☕'.repeat(80),
    description: '🎁'.repeat(1000), instructions: '💌'.repeat(1000), note: '✨'.repeat(500),
    cost: 1_000_000, stock: 1_000_000 });
  const request = { operationId: randomUUID(), ...fields };
  assert.ok(Buffer.byteLength(JSON.stringify(request)) > 8192);
  const created = await f.owner.client.post(`${f.base()}/mimos`, request);
  expectStatus(created, 201);
  const reward = (await created.json()).reward;
  assert.equal(reward.name, fields.name); assert.equal(reward.description, fields.description);
  const found = await f.read(f.owner, `${f.base()}/mimos?q=${encodeURIComponent(fields.name)}`);
  assert.equal(found.items[0].id, reward.id, 'A busca deve aceitar todos os 80 caracteres Unicode de um nome válido.');
  expectStatus(await f.owner.client.post(`${f.base()}/mimos`, request), 201);
  await errorCode(await f.owner.client.post(`${f.base()}/mimos`, { ...request, note: 'Outro corpo' }), 409, 'operation_conflict');
  const updated = await f.updateReward(reward, { name: 'Nome revisado', stock: 2, cost: 10 });
  assert.equal(updated.version, 2); assert.equal(updated.stockRevision, 2);
  expectStatus(await f.owner.client.patch(f.rewardPath(reward), updated.request), 200);
  await errorCode(await f.owner.client.patch(f.rewardPath(reward), f.rewardBody(reward, { name: 'Formulário antigo' })), 409, 'reward_changed');
  const events = (await f.database.query('SELECT version, configuration FROM app."RewardEvent" WHERE "rewardId"=$1 ORDER BY version', [reward.id])).rows;
  assert.deepEqual(events.map(event => event.version), [1, 2]);
  assert.equal(events[0].configuration.name, fields.name);
});

test('valida inteiros, texto simples, Unicode excedente e campos proibidos sem gravar catálogo', async t => {
  const f = await redemptionFixture(t);
  const invalid = [{ name: '' }, { name: '🎁'.repeat(81) }, { category: 'a'.repeat(81) },
    { description: 'a'.repeat(1001) }, { instructions: 'a'.repeat(1001) }, { note: '💌'.repeat(501) },
    { cost: 0 }, { cost: 1_000_001 }, { cost: 1.5 }, { cost: '10' },
    { stock: -1 }, { stock: 1_000_001 }, { stock: 1.5 }, { stock: '1' },
    { sticker: 'remote' }, { available: 'true' }, { authorProfileId: f.bia.id }];
  for (const extra of invalid) {
    await errorCode(await f.owner.client.post(`${f.base()}/mimos`, { operationId: randomUUID(), ...rewardFields(extra) }), 400);
  }
  await errorCode(await f.owner.client.post(`${f.base()}/mimos`, { operationId: randomUUID(), ...rewardFields(), padding: 'a'.repeat(17_000) }), 413);
  assert.equal((await f.read(f.owner, `${f.base()}/mimos?state=ALL`)).total, 0);
  const plain = await f.createReward({ name: '<script>alert(1)</script>', note: '<b>Texto simples</b>' });
  assert.equal((await f.preview(plain)).note, '<b>Texto simples</b>');
});

test('busca, categoria e páginas estáveis preservam arquivo apenas na listagem administrativa', async t => {
  const f = await redemptionFixture(t);
  const one = await f.createReward({ name: 'Café com conversa', category: 'Pra você', sticker: 'coffee' });
  const two = await f.createReward({ name: 'Surpresa a dois', category: 'Surpresas' });
  const three = await f.createReward({ name: 'Café da tarde', category: 'Pra você' });
  const search = await f.read(f.ana, `${f.base()}/mimos?q=Caf%C3%A9&category=Pra%20voc%C3%AA`);
  assert.equal(search.total, 2); assert.ok(search.categories.includes('Pra você'));
  const pages = await Promise.all([1, 2, 3].map(page => f.read(f.owner, `${f.base()}/mimos?pageSize=1&page=${page}`)));
  assert.equal(new Set(pages.flatMap(page => page.items.map(item => item.id))).size, 3);
  assert.equal((await f.read(f.owner, `${f.base()}/mimos?pageSize=1`)).items[0].id, pages[0].items[0].id);
  const archived = await f.archiveReward(two);
  assert.ok(archived.archivedAt); assert.equal(archived.version, 2);
  expectStatus(await f.owner.client.post(`${f.rewardPath(two)}/arquivar`, archived.request), 200);
  assert.equal((await f.read(f.ana, `${f.base()}/mimos`)).total, 2);
  const archive = await f.read(f.owner, `${f.base()}/mimos?state=ARCHIVED`);
  assert.equal(archive.total, 1); assert.equal(archive.items[0].id, two.id);
  assert.equal((await f.preview(two)).availability.reason, 'ARCHIVED');
  for (const query of ['?pageSize=51', '?page=0', '?state=INVALID']) await errorCode(await f.owner.client.get(`${f.base()}/mimos${query}`), 400);
  assert.notEqual(one.id, three.id);
});

for (const table of ['Reward', 'RewardEvent']) {
  test(`falha em ${table} reverte criação e permite o mesmo UUID sem configuração parcial`, async t => {
    const f = await redemptionFixture(t);
    const request = { operationId: randomUUID(), ...rewardFields() };
    await f.withCatalogFailure(table, request.operationId, async () => {
      await errorCode(await f.owner.client.post(`${f.base()}/mimos`, request), 503);
      assert.equal((await f.read(f.owner, `${f.base()}/mimos?state=ALL`)).total, 0);
      assert.equal((await f.database.query('SELECT id FROM app."RewardEvent" WHERE id=$1', [request.operationId])).rowCount, 0);
    });
    expectStatus(await f.owner.client.post(`${f.base()}/mimos`, request), 201);
    expectStatus(await f.owner.client.post(`${f.base()}/mimos`, request), 201);
    assert.equal((await f.read(f.owner, `${f.base()}/mimos?state=ALL`)).total, 1);
  });
}
