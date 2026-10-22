import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { activityFixture, closeRuntime } from './helpers.mjs';
import { getDb } from '../../../src/server/db/client.ts';
import { periodAt } from '../../../src/server/activities/periods.ts';

after(closeRuntime);

const iso = value => value?.toISOString() ?? null;
const hours = period => (period.endsAt.getTime() - period.startsAt.getTime()) / 3_600_000;

test('calendário PostgreSQL usa data da loja, segunda-feira e dias DST de 23/25 horas', async t => {
  await activityFixture(t);
  await getDb().$transaction(async tx => {
    const before = await periodAt(tx, 'America/Sao_Paulo', 'DAILY', new Date('2026-10-22T02:59:59Z'));
    const afterMidnight = await periodAt(tx, 'America/Sao_Paulo', 'DAILY', new Date('2026-10-22T03:00:00Z'));
    assert.equal(before.localDate, '2026-10-21'); assert.equal(afterMidnight.localDate, '2026-10-22');
    assert.equal(iso(afterMidnight.startsAt), '2026-10-22T03:00:00.000Z');
    assert.equal(iso(afterMidnight.endsAt), '2026-10-23T03:00:00.000Z');
    const spring = await periodAt(tx, 'Europe/Lisbon', 'DAILY', new Date('2026-03-29T12:00:00Z'));
    const autumn = await periodAt(tx, 'Europe/Lisbon', 'DAILY', new Date('2026-10-25T12:00:00Z'));
    assert.equal(hours(spring), 23); assert.equal(hours(autumn), 25);
    assert.equal(iso(spring.startsAt), '2026-03-29T00:00:00.000Z');
    assert.equal(iso(spring.endsAt), '2026-03-29T23:00:00.000Z');
    assert.equal(iso(autumn.startsAt), '2026-10-24T23:00:00.000Z');
    assert.equal(iso(autumn.endsAt), '2026-10-26T00:00:00.000Z');
    const sunday = await periodAt(tx, 'Europe/Lisbon', 'WEEKLY', new Date('2026-10-18T22:59:59Z'));
    const monday = await periodAt(tx, 'Europe/Lisbon', 'WEEKLY', new Date('2026-10-18T23:00:00Z'));
    const thursday = await periodAt(tx, 'Europe/Lisbon', 'WEEKLY', new Date('2026-10-22T12:00:00Z'));
    assert.notEqual(sunday.key, monday.key); assert.equal(monday.key, thursday.key);
    assert.equal(iso(monday.startsAt), '2026-10-18T23:00:00.000Z');
    assert.equal(iso(monday.endsAt), '2026-10-26T00:00:00.000Z');
    assert.equal(hours(monday), 169);
    const once = await periodAt(tx, 'Pacific/Auckland', 'ONCE', new Date('2026-10-22T12:00:00Z'));
    assert.equal(once.localDate, '2026-10-23');
    assert.equal(once.startsAt, null); assert.equal(once.endsAt, null);
  });
});

test('horário de revisão é o banco e um fuso diferente do aparelho não permite retroatividade', async t => {
  const f = await activityFixture(t);
  await f.database.query('UPDATE app."Store" SET timezone=$2 WHERE id=$1', [f.store.id, 'Pacific/Auckland']);
  const activity = await f.create();
  const draft = await f.prepare(activity);
  const clock = await f.database.query(`SELECT clock_timestamp() AS now,
    to_char(clock_timestamp() AT TIME ZONE 'Pacific/Auckland','YYYY-MM-DD') AS date`);
  assert.equal(draft.review.timezone, 'Pacific/Auckland');
  assert.equal(draft.review.localDate, clock.rows[0].date);
  assert.ok(Math.abs(Date.parse(draft.review.now) - new Date(clock.rows[0].now).getTime()) < 15_000);
  const received = await f.submit(draft);
  assert.equal(received.localDate, draft.review.localDate); assert.equal(received.timezone, 'Pacific/Auckland');
  assert.ok(Date.parse(received.receivedAt) >= Date.parse(draft.createdAt));
});

test('meia-noite repetida ou saltada em Havana delimita o dia inteiro sem excluir a primeira hora', async t => {
  await activityFixture(t);
  await getDb().$transaction(async tx => {
    const firstMidnight = await periodAt(tx, 'America/Havana', 'DAILY', new Date('2026-11-01T04:30:00Z'));
    const repeatedMidnight = await periodAt(tx, 'America/Havana', 'DAILY', new Date('2026-11-01T05:30:00Z'));
    for (const period of [firstMidnight, repeatedMidnight]) {
      assert.equal(period.localDate, '2026-11-01');
      assert.equal(iso(period.startsAt), '2026-11-01T04:00:00.000Z');
      assert.equal(iso(period.endsAt), '2026-11-02T05:00:00.000Z');
      assert.equal(hours(period), 25);
      assert.ok(period.startsAt <= period.now && period.now < period.endsAt);
    }
    const previous = await periodAt(tx, 'America/Havana', 'DAILY', new Date('2026-10-31T12:00:00Z'));
    assert.equal(previous.localDate, '2026-10-31');
    assert.equal(iso(previous.endsAt), '2026-11-01T04:00:00.000Z');
    const skippedMidnight = await periodAt(tx, 'America/Havana', 'DAILY', new Date('2026-03-08T12:00:00Z'));
    assert.equal(skippedMidnight.localDate, '2026-03-08');
    assert.equal(iso(skippedMidnight.startsAt), '2026-03-08T05:00:00.000Z');
    assert.equal(iso(skippedMidnight.endsAt), '2026-03-09T04:00:00.000Z');
    assert.equal(hours(skippedMidnight), 23);
    const localHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Havana',
      hour: '2-digit', hourCycle: 'h23' }).format(new Date('2026-03-08T05:00:00Z'));
    assert.equal(localHour, '01');
  });
});
