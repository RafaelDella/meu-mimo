import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { relationFixture, closeRuntime, deliver } from '../conversations/helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('aceite real, participação e outbox são atômicos e não notificam repetição ou o próprio autor', async t => {
  const f = await relationFixture(t);
  const newcomer = await f.user();
  const invitationResponse = await f.owner.client.post(`/api/lojas/${f.store.id}/convites`, { operationId: randomUUID() });
  expectStatus(invitationResponse, 201);
  const invitation = await invitationResponse.json();
  const acceptPath = `/api${new URL(invitation.url).pathname}/aceitar`;
  await f.withConstraint('OutboxEvent', `"storeId" <> '${f.store.id}'::uuid`, async () => {
    await errorCode(await newcomer.client.post(acceptPath, {}), 503);
    assert.equal((await f.database.query('SELECT id FROM app."Membership" WHERE "storeId"=$1 AND "profileId"=$2', [f.store.id, newcomer.id])).rowCount, 0);
    assert.equal((await f.database.query('SELECT "acceptedAt" FROM app."Invitation" WHERE id=$1', [invitation.id])).rows[0].acceptedAt, null);
  });
  expectStatus(await newcomer.client.post(acceptPath, {}), 200);
  expectStatus(await newcomer.client.post(acceptPath, {}), 200);
  expectStatus(await f.owner.client.post(acceptPath, {}), 200);
  await deliver();
  const page = await f.notifications(f.owner);
  assert.equal(page.items.filter(item => item.kind === 'INVITATION_ACCEPTED').length, 1);
  assert.equal((await f.notifications(newcomer)).total, 0);
  const targetResponse = await f.owner.client.get(`/api/notificacoes/${page.items[0].id}/destino`);
  expectStatus(targetResponse, 200);
  const target = await targetResponse.json();
  assert.equal(target.type, 'membership');
  assert.equal(target.path, `/lojas/${f.store.id}/pessoas`);
});

test('dois consumidores e repetição após commit entregam um aviso para a outra pessoa', async t => {
  const f = await relationFixture(t);
  await f.post(f.ana, 'Para o lojista.');
  await f.post(f.owner, 'Para a Ana.');
  await Promise.all([deliver(), deliver()]);
  await deliver();
  assert.equal((await f.notifications(f.owner)).total, 1);
  assert.equal((await f.notifications(f.ana)).total, 1);
  assert.equal((await f.notifications(f.bia)).total, 0);
  const duplicate = await f.database.query('SELECT "eventId", count(*)::int AS count FROM app."Notification" GROUP BY "eventId" HAVING count(*) > 1');
  assert.equal(duplicate.rowCount, 0);
});

test('falha depois de inserir aviso reverte entrega, registra retry sanitizado e recupera sem duplicar', async t => {
  const f = await relationFixture(t);
  const comment = await f.post(f.ana, 'Texto privado que nunca entra no erro técnico.');
  const event = await f.eventFor(comment);
  await f.withConstraint('OutboxEvent', `id <> '${event.id}'::uuid OR "processedAt" IS NULL`, async () => {
    const result = await deliver();
    assert.ok(result.failed >= 1);
    assert.equal((await f.database.query('SELECT id FROM app."Notification" WHERE "eventId"=$1', [event.id])).rowCount, 0);
    const current = (await f.database.query('SELECT * FROM app."OutboxEvent" WHERE id=$1', [event.id])).rows[0];
    assert.equal(current.processedAt, null);
    assert.ok(current.attempts >= 1);
    assert.equal(current.lastErrorCode, 'delivery_failed');
    assert.ok(new Date(current.availableAt).getTime() > new Date(event.availableAt).getTime());
  });
  await f.database.query('UPDATE app."OutboxEvent" SET "availableAt"=now()-interval \'1 second\' WHERE id=$1', [event.id]);
  await deliver();
  await deliver();
  assert.equal((await f.database.query('SELECT id FROM app."Notification" WHERE "eventId"=$1', [event.id])).rowCount, 1);
});

test('falha na inserção da notificação não marca o evento e libera nova tentativa', async t => {
  const f = await relationFixture(t);
  const event = await f.eventFor(await f.post(f.ana, 'Entrega que pode ser retomada.'));
  await f.withConstraint('Notification', `"eventId" <> '${event.id}'::uuid`, async () => {
    assert.ok((await deliver()).failed >= 1);
    assert.equal((await f.database.query('SELECT "processedAt" FROM app."OutboxEvent" WHERE id=$1', [event.id])).rows[0].processedAt, null);
  });
  await f.database.query('UPDATE app."OutboxEvent" SET "availableAt"=now()-interval \'1 second\' WHERE id=$1', [event.id]);
  await deliver();
  assert.equal((await f.notifications(f.owner)).total, 1);
});

test('CLI local once consome o evento com runtime restrito e repetir não cria outro aviso', async t => {
  const f = await relationFixture(t);
  const comment = await f.post(f.ana, 'Entrega pelo processo separado.');
  const event = await f.eventFor(comment);
  const run = () => promisify(execFile)(process.execPath,
    ['scripts/outbox-local.mjs', process.env.T02_TASK ?? 't05', 'integration', '--once'], { windowsHide: true, timeout: 20_000 });
  const first = await run();
  assert.ok(JSON.parse(first.stdout.trim()).delivered >= 1);
  const again = await run();
  assert.equal(JSON.parse(again.stdout.trim()).delivered, 0);
  assert.equal((await f.database.query('SELECT id FROM app."Notification" WHERE "eventId"=$1', [event.id])).rowCount, 1);
});
