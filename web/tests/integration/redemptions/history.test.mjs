import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { redemptionFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('histórico pagina de forma estável e contador ignora página, período e filtro do histórico', async t => {
  const f = await redemptionFixture(t);
  await f.credit(30); await f.credit(10, f.bia);
  const reward = await f.createReward({ cost: 5 });
  const ana = [];
  for (let index = 0; index < 3; index += 1) ana.push(await f.redeem(reward));
  const bia = await f.redeem(reward, f.bia);
  const pages = [];
  for (let page = 1; page <= 3; page += 1) pages.push(await f.tickets(`?pageSize=1&page=${page}`));
  assert.ok(pages.every(page => page.total === 3));
  assert.equal(new Set(pages.flatMap(page => page.items.map(item => item.id))).size, 3);
  assert.equal((await f.tickets('?pageSize=1')).items[0].id, pages[0].items[0].id);
  assert.deepEqual(await f.summary(), { total: 3, outstanding: 3 });
  assert.equal((await f.tickets('?status=FULFILLED&pageSize=1')).total, 0);
  assert.equal((await f.tickets('?from=2099-01-01&to=2099-01-02')).total, 0);
  assert.deepEqual(await f.summary(), { total: 3, outstanding: 3 });
  assert.equal((await f.tickets(`?from=${ana[0].localDate}&to=${ana[0].localDate}&status=WAITING_AGREEMENT`)).total, 3);
  const merchantPage = await f.tickets(`?membershipId=${f.participation.id}`, f.owner);
  assert.equal(merchantPage.total, 3); assert.ok(merchantPage.items.every(ticket => ticket.participantMembershipId === f.participation.id));
  assert.equal((await f.tickets('', f.owner)).total, 4);
  assert.deepEqual(await f.summary('', f.owner), { total: 4, outstanding: 4 });
  assert.deepEqual(await f.summary(`?membershipId=${f.otherParticipation.id}`, f.owner), { total: 1, outstanding: 1 });
  assert.equal((await f.tickets('', f.bia)).items[0].id, bia.id);
  for (const query of ['?from=2026-02-30', '?from=2026-10-30&to=2026-10-01', '?pageSize=51', '?page=0', '?status=UNKNOWN']) {
    await errorCode(await f.ana.client.get(`${f.base()}/tickets${query}`), 400);
  }
});

test('emissão usa instante do banco e data da loja mesmo quando o calendário UTC diverge', async t => {
  const f = await redemptionFixture(t);
  const hour = (await f.database.query("SELECT extract(hour from clock_timestamp() AT TIME ZONE 'UTC')::int AS hour")).rows[0].hour;
  const timezone = hour < 12 ? 'Etc/GMT+12' : 'Pacific/Kiritimati';
  expectStatus(await f.owner.client.patch(f.base(), { timezone }), 200);
  await f.credit(20); const reward = await f.createReward(); const ticket = await f.redeem(reward);
  const clock = (await f.database.query(`SELECT clock_timestamp() AS now,
    to_char("createdAt" AT TIME ZONE $2,'YYYY-MM-DD') AS local,
    to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD') AS utc FROM app."Redemption" WHERE id=$1`, [ticket.id, timezone])).rows[0];
  assert.notEqual(clock.local, clock.utc); assert.equal(ticket.timezone, timezone); assert.equal(ticket.localDate, clock.local);
  assert.ok(Math.abs(Date.parse(ticket.createdAt) - new Date(clock.now).getTime()) < 15_000);
  assert.equal((await f.tickets(`?from=${clock.local}&to=${clock.local}`)).total, 1);
  assert.equal((await f.tickets(`?from=${clock.utc}&to=${clock.utc}`)).total, 0);
});

for (const scenario of [
  { name: 'meia-noite repetida de 25h', timezone: 'America/Havana', date: '2026-11-01', instants: [
    '2026-11-01T03:59:59Z', '2026-11-01T04:00:00Z', '2026-11-01T04:30:00Z',
    '2026-11-01T05:30:00Z', '2026-11-02T04:59:59Z', '2026-11-02T05:00:00Z'] },
  { name: 'meia-noite saltada de 23h', timezone: 'America/Havana', date: '2026-03-08', instants: [
    '2026-03-08T04:59:59Z', '2026-03-08T05:00:00Z', '2026-03-08T05:30:00Z',
    '2026-03-09T03:59:59Z', '2026-03-09T04:00:00Z'] },
]) {
  test(`filtro inclusivo cobre ${scenario.name} sem excluir primeira hora ou incluir dias vizinhos`, async t => {
    const f = await redemptionFixture(t);
    expectStatus(await f.owner.client.patch(f.base(), { timezone: scenario.timezone }), 200);
    await f.credit(100); const reward = await f.createReward({ cost: 1 });
    const records = [];
    for (const instant of scenario.instants) records.push(await f.withEmissionClock(instant, () => f.redeem(reward)));
    const expected = records.slice(1, -1).map(ticket => ticket.id).sort();
    const page = await f.tickets(`?from=${scenario.date}&to=${scenario.date}`);
    assert.equal(page.total, expected.length); assert.deepEqual(page.items.map(ticket => ticket.id).sort(), expected);
    assert.ok(page.items.every(ticket => ticket.localDate === scenario.date && ticket.timezone === scenario.timezone));
    assert.deepEqual(await f.summary(), { total: records.length, outstanding: records.length });
    const ownerPage = await f.tickets(`?from=${scenario.date}&to=${scenario.date}&membershipId=${f.participation.id}`, f.owner);
    assert.deepEqual(ownerPage.items.map(ticket => ticket.id).sort(), expected);
  });
}
