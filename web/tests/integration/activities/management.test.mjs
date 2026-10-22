import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { activityFixture, closeRuntime, fields } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('criação, edição e arquivo têm operação estável, versão e auditoria imutável', async t => {
  const f = await activityFixture(t);
  const original = await f.create();
  const creation = await f.owner.client.post(`${f.base()}/atividades`, original.request);
  expectStatus(creation, 201);
  assert.equal((await creation.json()).activity.id, original.id);
  await errorCode(await f.owner.client.post(`${f.base()}/atividades`, { ...original.request, points: 16 }), 409);
  const edited = await f.update(original, { name: 'Regra revista', points: 20 });
  assert.equal(edited.version, 2);
  const replay = await f.owner.client.patch(f.activityPath(original), edited.request);
  expectStatus(replay, 200);
  assert.equal((await replay.json()).appliedVersion, 2);
  await errorCode(await f.owner.client.patch(f.activityPath(original), { ...edited.request, points: 21 }), 409);
  await errorCode(await f.owner.client.patch(f.activityPath(original), {
    operationId: randomUUID(), expectedVersion: 1, ...fields({ points: 25 }),
  }), 409);
  const request = { operationId: randomUUID(), expectedVersion: 2 };
  const archive = await f.owner.client.post(`${f.activityPath(original)}/arquivar`, request);
  expectStatus(archive, 200);
  assert.ok((await archive.json()).activity.archivedAt);
  expectStatus(await f.owner.client.post(`${f.activityPath(original)}/arquivar`, request), 200);
  await errorCode(await f.owner.client.post(`${f.activityPath(original)}/arquivar`, { ...request, expectedVersion: 1 }), 409);
  const events = await f.database.query('SELECT kind, version, configuration FROM app."ActivityEvent" WHERE "activityId"=$1 ORDER BY version', [original.id]);
  assert.deepEqual(events.rows.map(row => [row.kind, row.version]), [['CREATE', 1], ['UPDATE', 2], ['ARCHIVE', 3]]);
  assert.equal(events.rows[0].configuration.name, original.name);
  assert.equal(events.rows[1].configuration.points, 20);
  const historic = await f.read(f.ana, f.activityPath(original));
  assert.equal(historic.availability.reason, 'ARCHIVED');
  await errorCode(await f.ana.client.post(`${f.activityPath(original)}/preparar`, { operationId: randomUUID() }), 409);
  assert.equal((await f.read(f.ana, `${f.base()}/atividades`)).total, 0);
  assert.equal((await f.read(f.owner, `${f.base()}/atividades?state=ARCHIVED`)).total, 1);
  const otherStore = await f.createStore(f.owner, 'Outra operação T07');
  await f.addMembership(otherStore, f.owner, 'MERCHANT');
  await errorCode(await f.owner.client.post(`${f.base(otherStore)}/atividades`, original.request), 409);
});

test('limites de configuração são validados e aprovação omitida começa manual', async t => {
  const f = await activityFixture(t);
  const request = { operationId: randomUUID(), ...fields({ name: 'N'.repeat(80), category: 'C'.repeat(80),
    description: 'D'.repeat(1000), points: 1, frequency: 'WEEKLY', weeklyLimit: 100 }) };
  delete request.approvalMode;
  const accepted = await f.owner.client.post(`${f.base()}/atividades`, request);
  expectStatus(accepted, 201);
  assert.equal((await accepted.json()).activity.approvalMode, 'MANUAL');
  const maximum = await f.create({ points: 1_000_000, frequency: 'WEEKLY', weeklyLimit: 1 });
  assert.equal(maximum.points, 1_000_000);
  for (const invalid of [{ name: 'N'.repeat(81) }, { category: 'C'.repeat(81) },
    { description: 'D'.repeat(1001) }, { name: '   ' }, { points: 0 }, { points: 1_000_001 },
    { points: 1.5 }, { points: '15' }, { frequency: 'MONTHLY' }, { weeklyLimit: 0 },
    { weeklyLimit: 101 }, { approvalMode: 'APPROVED' }, { sticker: 'https://example.test/image.png' }]) {
    await errorCode(await f.owner.client.post(`${f.base()}/atividades`, {
      operationId: randomUUID(), ...fields({ frequency: 'WEEKLY', ...invalid }),
    }), 400);
  }
  assert.equal((await f.read(f.owner, `${f.base()}/atividades`)).total, 2);
});

test('busca, paginação e filtros não misturam loja nem mostram rascunhos', async t => {
  const f = await activityFixture(t);
  const first = await f.create({ name: 'Busca A' });
  await f.create({ name: 'Busca B' });
  await f.create({ name: 'Outra regra' });
  await f.prepare(first);
  const pages = [];
  for (const page of [1, 2]) {
    const result = await f.read(f.ana, `${f.base()}/atividades?q=Busca&page=${page}&pageSize=1`);
    assert.equal(result.total, 2); assert.equal(result.items.length, 1);
    pages.push(result.items[0].id);
  }
  assert.equal(new Set(pages).size, 2);
  assert.equal((await f.read(f.owner, `${f.base()}/registros`)).total, 0);
  for (const query of ['page=0', 'pageSize=51', 'state=OTHER']) {
    await errorCode(await f.ana.client.get(`${f.base()}/atividades?${query}`), 400);
  }
  for (const query of ['page=-1', 'pageSize=0', 'status=DRAFT', 'from=invalid']) {
    await errorCode(await f.owner.client.get(`${f.base()}/registros?${query}`), 400);
  }
  await errorCode(await f.owner.client.get(`${f.base()}/registros?activityId=invalid`), 404);
});
