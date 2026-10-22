import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { reviewFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('extrato reconcilia ganhos e compensações, separa ajustes diários e preserva origem da ocasião', async t => {
  const f = await reviewFixture(t);
  const record = await f.received({ name: 'Nome histórico T08', points: 31 });
  const first = await f.decide(record, 'APPROVE');
  await f.decide(record, 'VOID'); await f.decide(record, 'REOPEN'); await f.decide(record, 'APPROVE');
  await f.update(record.activity, { name: 'Nome atual diferente', points: 999 });
  await f.received({ approvalMode: 'AUTOMATIC', name: 'Crédito de outra participação', points: 7 }, f.bia);
  const entries = await f.entries();
  assert.equal(entries.total, 3);
  assert.equal(entries.items.reduce((sum, entry) => sum + BigInt(entry.amount), 0n), 31n);
  assert.ok(entries.items.every(entry => entry.activityName === 'Nome histórico T08'));
  const balance = await f.balance();
  assert.equal(balance.available, '31'); assert.equal(balance.today.approved, 1);
  assert.equal(balance.today.credited, '31'); assert.equal(balance.today.adjusted, '0');
  const all = await f.entries('', f.owner);
  assert.equal(all.total, 4); assert.ok(all.items.every(entry => entry.storeId === f.store.id));
  const participant = await f.entries(`?membershipId=${f.participation.id}`, f.owner);
  assert.equal(participant.total, 3);
  for (const entry of entries.items) {
    const target = new URL(entry.path, f.environment.origin);
    assert.equal(target.pathname, `/lojas/${f.store.id}/registros/${record.id}`);
    assert.equal(target.searchParams.get('evento'), entry.reviewEventId);
    const source = await f.operation(record, entry.reviewEventId, f.ana);
    assert.equal(source.event.pointsEntryId, entry.id); assert.equal(source.event.delta, entry.amount);
  }
  const located = await f.operation(record, first.event.id, f.ana);
  assert.equal(located.appliedVersion, 1); assert.equal(located.submission.analysis.version, 4);
});

test('filtros por tipo e data local e paginação estável não misturam estados, pessoas ou pendências', async t => {
  const f = await reviewFixture(t);
  const record = await f.received({ points: 100 });
  await f.decide(record, 'APPROVE'); await f.decide(record, 'VOID');
  await f.decide(record, 'REOPEN'); await f.decide(record, 'APPROVE');
  const pending = await f.received({ name: 'Somente pendência', points: 50 });
  const currentDate = (await f.balance()).today.localDate;
  for (const [kind, amount] of [['ACTIVITY_CREDIT', '100'], ['ACTIVITY_REVERSAL', '-100'], ['ACTIVITY_RESTORE', '100']]) {
    const page = await f.entries(`?kind=${kind}&from=${currentDate}&to=${currentDate}`);
    assert.equal(page.total, 1); assert.equal(page.items[0].kind, kind); assert.equal(page.items[0].amount, amount);
    assert.notEqual(page.items[0].submissionId, pending.id);
  }
  const pages = [];
  for (let page = 1; page <= 3; page += 1) pages.push(await f.entries(`?pageSize=1&page=${page}`));
  assert.equal(new Set(pages.map(page => page.items[0].id)).size, 3);
  assert.equal((await f.entries('?pageSize=1')).items[0].id, pages[0].items[0].id);
  const future = new Date(`${currentDate}T12:00:00Z`); future.setUTCDate(future.getUTCDate() + 2);
  assert.equal((await f.entries(`?from=${future.toISOString().slice(0, 10)}`)).total, 0);
  for (const query of ['?kind=TICKET_DEBIT', '?from=2026-02-30', '?from=2026-10-30&to=2026-10-01', '?pageSize=51']) {
    await errorCode(await f.ana.client.get(`${f.base()}/pontos/movimentos${query}`), 400);
  }
  await errorCode(await f.ana.client.get(`${f.base()}/pontos/movimentos?membershipId=${f.otherParticipation.id}`), 404);
  const history1 = await f.history(record, f.ana, '?pageSize=2');
  const history2 = await f.history(record, f.ana, '?pageSize=2&page=2');
  assert.equal(history1.total, 5); assert.equal(history2.total, 5);
  assert.equal(new Set([...history1.items, ...history2.items].map(item => item.id)).size, 4);
  const balance = await f.balance(); assert.equal(balance.available, '100'); assert.equal(balance.pending, '50');
});

test('aritmética assinada identificada aceita saldo negativo sem simular gasto ou alterar ledger', async t => {
  const f = await reviewFixture(t);
  // Esta prova SQL não é resgate, ticket nem movimento do produto. T09 integra o gasto real.
  const before = await f.database.query('SELECT count(*)::int AS count FROM app."PointsEntry" WHERE "storeId"=$1', [f.store.id]);
  const result = await f.database.query(`SELECT (available+delta)::text AS resulting FROM
    (VALUES (5::bigint,-15::bigint), (9007199254740993::bigint,-15::bigint)) AS proof(available,delta)`);
  assert.deepEqual(result.rows.map(row => row.resulting), ['-10', '9007199254740978']);
  const after = await f.database.query('SELECT count(*)::int AS count FROM app."PointsEntry" WHERE "storeId"=$1', [f.store.id]);
  assert.equal(after.rows[0].count, before.rows[0].count); assert.equal((await f.balance()).available, '0');
});

test('período do extrato usa calendário da loja em vez de recortar pela data UTC', async t => {
  const f = await reviewFixture(t);
  const clock = (await f.database.query("SELECT extract(hour from clock_timestamp() AT TIME ZONE 'UTC')::int AS hour")).rows[0];
  const timezone = clock.hour < 12 ? 'Etc/GMT+12' : 'Pacific/Kiritimati';
  expectStatus(await f.owner.client.patch(f.base(), { timezone }), 200);
  const record = await f.received(); await f.decide(record, 'APPROVE');
  const [entry] = (await f.entries()).items;
  const dates = (await f.database.query(`SELECT
    to_char("createdAt" AT TIME ZONE $2, 'YYYY-MM-DD') AS local,
    to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS utc
    FROM app."PointsEntry" WHERE id=$1`, [entry.id, timezone])).rows[0];
  assert.notEqual(dates.local, dates.utc);
  assert.equal((await f.entries(`?from=${dates.local}&to=${dates.local}`)).total, 1);
  assert.equal((await f.entries(`?from=${dates.utc}&to=${dates.utc}`)).total, 0);
  assert.equal((await f.balance()).today.timezone, timezone);
});
