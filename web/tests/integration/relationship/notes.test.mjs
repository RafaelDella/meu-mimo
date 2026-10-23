import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { relationshipFixture, closeRuntime, deliver } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('bilhete vazio é leitura pura; envio privado não expõe recibo ao lojista', async t => {
  const f = await relationshipFixture(t);
  assert.deepEqual(await f.note(), { current: null, writable: true });
  assert.equal((await f.database.query('SELECT id FROM app."PersonalNote" WHERE "storeId"=$1', [f.store.id])).rowCount, 0);
  const sent = await f.send();
  assert.equal(sent.applied.version, 1); assert.equal(sent.applied.id, sent.request.operationId);
  assert.equal((await f.read(f.ownNotePath, f.ana)).unread, true);
  assert.equal((await f.read(f.ownNotePath, f.bia)).current, null);
  await errorCode(await f.bia.client.get(f.versionPath(sent.applied)), 404);
  await errorCode(await f.ana.client.get(f.notePath()), 404);
  const first = await f.mark(sent.applied); const repeat = await f.mark(sent.applied);
  assert.equal(repeat.readAt, first.readAt);
  assert.equal((await f.read(f.ownNotePath, f.ana)).unread, false);
  const merchant = await f.note();
  assert.deepEqual(Object.keys(merchant).sort(), ['current', 'writable']);
  assert.equal(JSON.stringify(merchant).includes('readAt'), false);
  await deliver();
  const page = await f.groups(f.ana);
  assert.equal(page.items.filter(g => g.latest.kind === 'NOTE_SENT').length, 1);
  assert.equal((await f.groups(f.bia)).total, 0);
});

test('read_v1_does_not_read_v2: duas sessões confirmam somente a versão mostrada', async t => {
  const f = await relationshipFixture(t);
  const v1 = await f.send('Primeiro bilhete');
  const secondDevice = { ...f.ana, client: f.ana.client.clone() };
  const opened = await f.read(f.versionPath(v1.applied), secondDevice);
  const v2 = await f.send('Segundo bilhete');
  await f.mark(opened, secondDevice);
  const current = await f.read(f.ownNotePath, f.ana);
  assert.equal(current.current.id, v2.applied.id); assert.equal(current.unread, true);
  await errorCode(await f.owner.client.post(`${f.versionPath(v2.applied)}/lida`, {}), 404);
  await f.mark(v2.applied);
  assert.equal((await f.read(f.ownNotePath, secondDevice)).unread, false);
  assert.equal((await f.database.query('SELECT * FROM app."NoteRead" WHERE "readerMembershipId"=$1', [f.participation.id])).rowCount, 2);
});

test('unicode_2000_2001: limite por codepoint, texto obrigatório e corpo estrito', async t => {
  const f = await relationshipFixture(t);
  const sent = await f.send(`  ${'💜'.repeat(2000)}  `);
  assert.equal([...sent.applied.text].length, 2000);
  for (const text of ['💜'.repeat(2001), '\t\n\u00a0', '\ufeff', 'inválido\u0001', '\ud800']) {
    await errorCode(await f.owner.client.patch(f.notePath(), { operationId: randomUUID(), expectedVersion: 1, text }), 400);
  }
  await errorCode(await f.owner.client.patch(f.notePath(), { ...sent.request, readAt: null }), 400);
  assert.equal((await f.note()).current.version, 1);
});

test('envio replay retorna versão aplicada e atual sem duplicar e rejeita intenção trocada', async t => {
  const f = await relationshipFixture(t);
  const first = await f.send('Versão um'); const second = await f.send('Versão dois');
  const replay = await f.owner.client.patch(f.notePath(), first.request); expectStatus(replay, 200);
  const result = await replay.json();
  assert.equal(result.applied.id, first.applied.id); assert.equal(result.current.id, second.applied.id);
  assert.equal(result.appliedVersion, 1);
  const lookup = await f.read(`${f.notePath()}/operacoes/${first.request.operationId}`);
  assert.equal(lookup.operation.applied.id, first.applied.id);
  assert.equal((await f.read(`${f.notePath()}/operacoes/${randomUUID()}`)).operation, null);
  await errorCode(await f.owner.client.patch(f.notePath(), { ...first.request, text: 'Outra intenção' }), 409);
  await errorCode(await f.owner.client.patch(f.notePath(), { ...first.request, operationId: randomUUID() }), 409);
  assert.equal((await f.database.query('SELECT id FROM app."NoteVersion" WHERE "storeId"=$1', [f.store.id])).rowCount, 2);
  assert.equal((await f.database.query('SELECT id FROM app."OutboxEvent" WHERE "storeId"=$1 AND kind=\'NOTE_SENT\'', [f.store.id])).rowCount, 2);
});

test('pausa permite bilhete; encerramento mantém leitura e bloqueia novo envio', async t => {
  const f = await relationshipFixture(t);
  await f.database.query('UPDATE app."Store" SET state=\'PAUSED\' WHERE id=$1', [f.store.id]);
  const sent = await f.send('Pode chegar durante a pausa.');
  await f.database.query('UPDATE app."Membership" SET "closedAt"=clock_timestamp() WHERE id=$1', [f.participation.id]);
  assert.equal((await f.note()).writable, false);
  await errorCode(await f.owner.client.patch(f.notePath(), { operationId: randomUUID(), expectedVersion: 1, text: 'Novo' }), 409);
  assert.equal((await f.read(f.versionPath(sent.applied), f.ana)).text, sent.applied.text);
  await f.mark(sent.applied);
});

test('bilhete rollback de projeção/versão/outbox conserva estado anterior e intenção recuperável', async t => {
  const f = await relationshipFixture(t);
  const first = await f.send('Antes da falha');
  for (const table of ['PersonalNote', 'NoteVersion', 'OutboxEvent']) {
    const operationId = randomUUID(); const name = `t12_note_${operationId.replaceAll('-', '')}`;
    const expression = table === 'PersonalNote' ? `"storeId" <> '${f.store.id}'::uuid OR version=1` :
      table === 'NoteVersion' ? `id <> '${operationId}'::uuid` : `"noteVersionId" IS DISTINCT FROM '${operationId}'::uuid`;
    await f.database.query(`ALTER TABLE app."${table}" ADD CONSTRAINT "${name}" CHECK (${expression})`);
    try {
      await errorCode(await f.owner.client.patch(f.notePath(), { operationId, expectedVersion: 1, text: 'Tentativa' }), 503);
    } finally { await f.database.query(`ALTER TABLE app."${table}" DROP CONSTRAINT "${name}"`); }
    assert.equal((await f.note()).current.id, first.applied.id);
    assert.equal((await f.read(`${f.notePath()}/operacoes/${operationId}`)).operation, null);
  }
});
