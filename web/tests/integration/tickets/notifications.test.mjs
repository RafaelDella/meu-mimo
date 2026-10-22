import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { ticketFixture, closeRuntime, deliver } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('avisos de cada transição são únicos, privados, da outra pessoa e resolvem evento real', async t => {
  const f = await ticketFixture(t);
  const results = [];
  results.push(await f.transition(f.issued, 'AGREE', { text: 'Texto secreto do combinado' }));
  results.push(await f.transition(f.issued, 'REQUEST_CANCELLATION', { text: 'Motivo privado do pedido' }));
  results.push(await f.transition(f.issued, 'REJECT_CANCELLATION'));
  results.push(await f.transition(f.issued, 'CANCEL'));
  expectStatus(await f.owner.client.post(f.transitionPath(f.issued), results.at(-1).request), 200);
  await Promise.all([deliver(), deliver()]); await deliver();
  const rows = (await f.database.query(`SELECT e."redemptionEventId",e."recipientMembershipId",count(n.id)::int AS count
    FROM app."OutboxEvent" e LEFT JOIN app."Notification" n ON n."eventId"=e.id
    WHERE e."redemptionId"=$1 AND e.kind='REDEMPTION_UPDATED' GROUP BY e.id`, [f.issued.id])).rows;
  assert.equal(rows.length, 4); assert.ok(rows.every(row => row.count === 1));
  for (const result of results) {
    const requested = result.event.kind === 'REQUEST_CANCELLATION';
    const recipient = requested ? f.owner : f.ana;
    const actor = requested ? f.ana : f.owner;
    const notices = await f.read(recipient, '/api/notificacoes');
    assert.doesNotMatch(JSON.stringify(notices), /Texto secreto|Motivo privado/);
    const noticeId = (await f.database.query(`SELECT n.id FROM app."Notification" n
      JOIN app."OutboxEvent" e ON e.id=n."eventId" WHERE e."redemptionEventId"=$1`, [result.event.id])).rows[0].id;
    const target = await f.read(recipient, `/api/notificacoes/${noticeId}/destino`);
    const url = new URL(target.path, f.environment.origin);
    assert.equal(url.pathname, f.ticketPath(f.issued).replace('/api', ''));
    assert.equal(url.searchParams.get('evento'), result.event.id);
    await errorCode(await actor.client.get(`/api/notificacoes/${noticeId}/destino`), 404);
    await errorCode(await f.bia.client.get(`/api/notificacoes/${noticeId}/destino`), 404);
  }
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  assert.equal((await f.read(f.ana, '/api/notificacoes')).total, 0);
});
