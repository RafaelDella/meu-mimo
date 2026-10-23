import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { relationshipFixture, closeRuntime, deliver } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('preferências padrão são virtuais; escrita versionada vale em outro dispositivo', async t => {
  const f = await relationshipFixture(t);
  assert.deepEqual(await f.preferences(), { storeId: f.store.id, version: 0, socialMuted: false, automaticApprovalNotices: true });
  assert.equal((await f.database.query('SELECT * FROM app."NotificationPreference" WHERE "storeId"=$1', [f.store.id])).rowCount, 0);
  const first = await f.preference({ socialMuted: true });
  assert.equal(first.preferences.version, 1);
  const otherDevice = { ...f.ana, client: f.ana.client.clone() };
  assert.deepEqual(await f.preferences(otherDevice), first.preferences);
  await f.preference({ automaticApprovalNotices: false });
  const replay = await f.ana.client.patch(f.preferencePath, first.request); expectStatus(replay, 200);
  const current = await replay.json();
  assert.equal(current.appliedVersion, 1); assert.equal(current.preferences.version, 2);
  assert.equal(current.preferences.automaticApprovalNotices, false);
  const lookup = await f.read(`${f.preferencePath}/operacoes/${first.request.operationId}`, otherDevice);
  assert.equal(lookup.operation.appliedVersion, 1);
  await errorCode(await f.ana.client.patch(f.preferencePath, { ...first.request, socialMuted: false }), 409);
  await errorCode(await f.ana.client.patch(f.preferencePath, { ...first.request, operationId: randomUUID() }), 409);
  assert.equal((await f.preferences(f.bia)).version, 0);
});

test('silenciar retira só atenção e reativar recompõe não lidos sem mudar readAt', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread();
  await f.comment(thread, 'Do lojista para Ana', f.owner); await deliver();
  const initial = await f.groups(f.ana); assert.equal(initial.attentionUnreadCount, 1);
  const id = initial.items[0].id;
  const before = (await f.database.query('SELECT id,"readAt" FROM app."Notification" WHERE "groupId"=$1 ORDER BY id', [id])).rows;
  await f.preference({ socialMuted: true });
  const muted = await f.groups(f.ana); assert.equal(muted.total, 1); assert.equal(muted.attentionUnreadCount, 0);
  assert.equal(muted.items[0].attentionActive, false); assert.equal(muted.items[0].unreadCount, 1);
  await f.preference({ socialMuted: false });
  assert.equal((await f.groups(f.ana)).attentionUnreadCount, 1);
  assert.deepEqual((await f.database.query('SELECT id,"readAt" FROM app."Notification" WHERE "groupId"=$1 ORDER BY id', [id])).rows, before);
});

test('silenciamento automático distingue decisão manual e preserva ambos no histórico', async t => {
  const f = await relationshipFixture(t);
  await f.received({ approvalMode: 'AUTOMATIC', name: 'Automática' });
  await f.credit(15); await deliver();
  const before = await f.groups(f.owner); assert.equal(before.total, 2); assert.equal(before.attentionUnreadCount, 2);
  await f.preference({ automaticApprovalNotices: false, socialMuted: true }, f.owner);
  const after = await f.groups(f.owner);
  assert.equal(after.total, 2); assert.equal(after.attentionUnreadCount, 1);
  assert.equal(after.items.filter(group => group.attentionActive).length, 1);
  assert.ok(after.items.every(group => group.category === 'ACTIVITIES' && group.unreadCount === 1));
  assert.equal((await f.groups(f.ana)).attentionUnreadCount, 1, 'A aprovação manual continua avisando a participante.');
  assert.equal((await f.balance()).available, '30');
});

test('preferência exige campos booleanos exatos e audit failure reverte projeção', async t => {
  const f = await relationshipFixture(t);
  for (const extra of [{ socialMuted: 'true' }, { recipientMembershipId: f.otherParticipation.id }, { version: 1 }, { expectedVersion: -1 }]) {
    await errorCode(await f.ana.client.patch(f.preferencePath, { operationId: randomUUID(), expectedVersion: 0, socialMuted: false, automaticApprovalNotices: true, ...extra }), 400);
  }
  const operationId = randomUUID(); const name = `t12_preference_${operationId.replaceAll('-', '')}`;
  await f.database.query(`ALTER TABLE app."NotificationPreferenceEvent" ADD CONSTRAINT "${name}" CHECK (id <> '${operationId}'::uuid)`);
  try {
    await errorCode(await f.ana.client.patch(f.preferencePath, { operationId, expectedVersion: 0, socialMuted: true, automaticApprovalNotices: false }), 503);
  } finally { await f.database.query(`ALTER TABLE app."NotificationPreferenceEvent" DROP CONSTRAINT "${name}"`); }
  assert.equal((await f.preferences()).version, 0);
});
