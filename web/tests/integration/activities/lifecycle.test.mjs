import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { activityFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('manual pendente impede encerrar a relação e loja certas; outra participação pode encerrar', async t => {
  const f = await activityFixture(t);
  const activity = await f.create();
  await f.submit(await f.prepare(activity));
  const close = member => `${f.base()}/participacoes/${member.id}/encerrar`;
  await errorCode(await f.ana.client.post(close(f.participation), {}), 409);
  await errorCode(await f.owner.client.post(close(f.participation), {}), 409);
  await errorCode(await f.owner.client.post(`${f.base()}/estado`, { action: 'close' }), 409);
  expectStatus(await f.bia.client.post(close(f.otherParticipation), {}), 200);
  const members = await f.database.query('SELECT id, "closedAt" FROM app."Membership" WHERE id=ANY($1::uuid[])',
    [[f.participation.id, f.otherParticipation.id]]);
  assert.equal(members.rows.find(row => row.id === f.participation.id).closedAt, null);
  assert.ok(members.rows.find(row => row.id === f.otherParticipation.id).closedAt);
});

test('rascunho não bloqueia encerramento nem marca fuso; envio automático marca e preserva histórico', async t => {
  const f = await activityFixture(t);
  const activity = await f.create({ approvalMode: 'AUTOMATIC' });
  const draft = await f.prepare(activity, f.bia);
  const before = await f.database.query('SELECT "domainStartedAt" FROM app."Store" WHERE id=$1', [f.store.id]);
  assert.equal(before.rows[0].domainStartedAt, null);
  expectStatus(await f.bia.client.post(`${f.base()}/participacoes/${f.otherParticipation.id}/encerrar`, {}), 200);
  await errorCode(await f.bia.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft)), 409);
  const received = await f.submit(await f.prepare(activity));
  const afterReceive = await f.database.query('SELECT "domainStartedAt" FROM app."Store" WHERE id=$1', [f.store.id]);
  assert.ok(afterReceive.rows[0].domainStartedAt);
  await errorCode(await f.owner.client.patch(f.base(), { timezone: 'Europe/Lisbon' }), 409, 'timezone_locked');
  expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: 'close' }), 200);
  expectStatus(await f.ana.client.get(f.submissionPath(received)), 200);
  assert.equal((await f.balance()).available, '15');
  const comment = await f.ana.client.post(`${f.base()}/conversas/${received.conversation.id}/comentarios`, {
    operationId: randomUUID(), text: 'O histórico continua privado e conversável.',
  });
  expectStatus(comment, 201);
});

test('pausa bloqueia preparar/receber sem consumir ocorrência; retomada recupera o mesmo rascunho', async t => {
  const f = await activityFixture(t);
  const activity = await f.create({ approvalMode: 'AUTOMATIC' });
  const draft = await f.prepare(activity);
  expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: 'pause' }), 200);
  await errorCode(await f.ana.client.post(`${f.activityPath(activity)}/preparar`, { operationId: randomUUID() }), 409);
  await errorCode(await f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft)), 409);
  assert.deepEqual(await f.counts(draft), { ledger: 0, events: 0, outbox: 0, conversations: 0 });
  expectStatus(await f.owner.client.post(`${f.base()}/estado`, { action: 'resume' }), 200);
  await f.submit(draft);
  assert.equal((await f.balance()).available, '15');
});

test('encerrar concorrendo com receber manual nunca deixa relação fechada com nova pendência', async t => {
  const f = await activityFixture(t);
  const draft = await f.prepare(await f.create());
  const responses = await Promise.all([
    f.ana.client.post(`${f.submissionPath(draft)}/enviar`, f.body(draft)),
    f.owner.client.post(`${f.base()}/participacoes/${f.participation.id}/encerrar`, {}),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const result = await f.database.query(`SELECT s.status, m."closedAt" FROM app."ActivitySubmission" s
    JOIN app."Membership" m ON m.id=s."participantMembershipId" WHERE s.id=$1`, [draft.id]);
  const row = result.rows[0];
  assert.ok((row.status === 'PENDING' && row.closedAt === null) || (row.status === 'DRAFT' && row.closedAt !== null));
});
