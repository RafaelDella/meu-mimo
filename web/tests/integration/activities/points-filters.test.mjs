import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { activityFixture, closeRuntime } from './helpers.mjs';
import { errorCode } from '../helpers/http-client.mjs';

after(closeRuntime);

test('totais, filtros e paginação incluem somente recebidos e a participação autorizada', async t => {
  const f = await activityFixture(t);
  const automatic = await f.create({ name: 'Origem de créditos', points: 1_000_000,
    frequency: 'WEEKLY', weeklyLimit: 3, approvalMode: 'AUTOMATIC' });
  const manual = await f.create({ name: 'Origem de pendência', points: 7 });
  const records = [];
  for (let index = 0; index < 2; index += 1) records.push(await f.submit(await f.prepare(automatic)));
  const pending = await f.submit(await f.prepare(manual));
  await f.submit(await f.prepare(automatic, f.bia), f.bia);
  await f.prepare(automatic);
  assert.equal((await f.balance()).available, '2000000');
  assert.equal((await f.balance()).pending, '7');
  const filtered = await f.read(f.owner, `${f.base()}/registros?membershipId=${f.participation.id}&activityId=${automatic.id}&status=APPROVED&pageSize=1`);
  assert.equal(filtered.total, 2); assert.equal(filtered.items.length, 1);
  const second = await f.read(f.owner, `${f.base()}/registros?membershipId=${f.participation.id}&activityId=${automatic.id}&status=APPROVED&pageSize=1&page=2`);
  assert.notEqual(filtered.items[0].id, second.items[0].id);
  const date = records[0].localDate;
  const own = await f.read(f.ana, `${f.base()}/registros?from=${date}&to=${date}`);
  assert.equal(own.total, 3); assert.ok(own.items.every(item => item.participantMembershipId === f.participation.id));
  assert.equal((await f.read(f.owner, `${f.base()}/registros?status=PENDING`)).items[0].id, pending.id);
  const credits = await f.read(f.owner, `${f.base()}/pontos/movimentos?membershipId=${f.participation.id}&pageSize=1`);
  assert.equal(credits.total, 2); assert.equal(credits.items[0].amount, '1000000');
  assert.equal(credits.items[0].activityName, automatic.name);
  await errorCode(await f.ana.client.get(`${f.base()}/pontos/movimentos?membershipId=${f.otherParticipation.id}`), 404);
});

test('SUM bigint preserva precisão no driver e contrato decimal acima de int32 e Number.MAX_SAFE_INTEGER', async t => {
  const f = await activityFixture(t);
  // Fixture SQL identificada, sem alterar ledger, grants ou limites de crédito.
  // O volume irreal necessário não é inserido no domínio para imitar movimentação.
  const result = await f.database.query(`SELECT sum(value)::text AS total FROM
    (VALUES (9007199254740993::bigint),(2147483648::bigint),(15::bigint)) AS proof(value)`);
  assert.equal(result.rows[0].total, '9007201402224656');
  assert.equal(typeof result.rows[0].total, 'string');
  const received = await f.submit(await f.prepare(await f.create({ points: 1_000_000, approvalMode: 'AUTOMATIC' })));
  const entry = (await f.read(f.ana, `${f.base()}/pontos/movimentos`)).items[0];
  assert.equal(entry.submissionId, received.id); assert.equal(entry.amount, '1000000');
  assert.equal((await f.balance()).available, '1000000');
});
