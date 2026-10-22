import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ticketFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('combinado/motivos aceitam 500 Unicode e rejeitam branco, 501, data inválida e campos alheios', async t => {
  const f = await ticketFixture(t);
  const original = await f.transitionBody(f.issued, 'AGREE');
  const invalid = [
    { text: '' }, { text: ' \n\t' }, { text: '💛'.repeat(501) }, { text: '\ud800' },
    { agreementDate: '2026-02-30' }, { agreementDate: '2026-01-01T12:00:00Z' },
    { agreementDate: 'hoje' }, { expectedVersion: 0 }, { expectedVersion: 1.1 },
    { participantMembershipId: f.otherParticipation.id }, { authorProfileId: f.bia.id },
    { restock: false }, { expectedBalance: '30' }, { action: 'OTHER' },
  ];
  for (const extra of invalid) await errorCode(await f.owner.client.post(f.transitionPath(f.issued), { ...original, ...extra }), 400);
  const result = await f.transition(f.issued, 'AGREE', { text: '💛'.repeat(500), agreementDate: '2000-02-29' });
  assert.equal([...result.event.text].length, 500); assert.equal(result.ticket.agreementDate, '2000-02-29');
  const request = await f.transition(f.issued, 'REQUEST_CANCELLATION', { text: '💛'.repeat(500) });
  assert.equal([...request.event.text].length, 500);
  const refusal = await f.transitionBody(f.issued, 'REJECT_CANCELLATION');
  await errorCode(await f.owner.client.post(f.transitionPath(f.issued), { ...refusal, text: '💛'.repeat(501) }), 400);
  await f.transition(f.issued, 'REJECT_CANCELLATION', { text: '💛'.repeat(500) });
});

test('cancelamento exige motivo, saldo exato string e escolha explícita; realização rejeita campos financeiros', async t => {
  const f = await ticketFixture(t);
  const original = await f.transitionBody(f.issued, 'CANCEL');
  for (const extra of [{ text: '' }, { text: '💛'.repeat(501) }, { restock: undefined },
    { restock: 'true' }, { expectedBalance: 20 }, { expectedBalance: '20.5' }, { expectedBalance: '9223372036854775808' },
    { expectedStockRevision: 2 }, { agreementDate: null }, { delta: 999 }]) {
    await errorCode(await f.owner.client.post(f.transitionPath(f.issued), { ...original, ...extra }), 400);
  }
  const fulfill = await f.transitionBody(f.issued, 'FULFILL');
  await errorCode(await f.owner.client.post(f.transitionPath(f.issued), { ...fulfill, text: 'Não é necessário motivo' }), 400);
  assert.equal((await f.events(f.issued)).total, 1); assert.equal((await f.ticketLedger(f.issued)).length, 1);
});

test('limites por conta são atômicos, explícitos e não aplicam operação rejeitada', async t => {
  const f = await ticketFixture(t);
  const body = await f.transitionBody(f.issued, 'FULFILL');
  const key = createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET)
    .update('meumimo:t04:domain-rate:v1\0').update('write').update('\0').update(f.owner.id).digest('hex');
  await f.database.query(`INSERT INTO app."AuthRateBucket" (key,attempts) VALUES ($1,array_fill(now(),ARRAY[30]))
    ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts`, [key]);
  const limited = await f.owner.client.post(f.transitionPath(f.issued), body);
  await errorCode(limited, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await f.events(f.issued)).total, 1);
  await f.database.query('DELETE FROM app."AuthRateBucket" WHERE key=$1', [key]);
  expectStatus(await f.owner.client.post(f.transitionPath(f.issued), body), 200);
  assert.equal((await f.events(f.issued)).items.at(-1).id, body.operationId);
});
