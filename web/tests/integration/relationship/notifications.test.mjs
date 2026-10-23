import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { relationshipFixture, closeRuntime, deliver } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('grupo v1 lido enquanto v2 chega preserva a segunda interação não lida', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread();
  await f.comment(thread, 'Primeira interação'); await deliver();
  const v1 = (await f.groups()).items.find(group => group.category === 'SOCIAL'); assert.ok(v1);
  await f.comment(thread, 'Segunda interação'); await deliver();
  const read = await f.markGroup(v1);
  assert.equal(read.id, v1.id); assert.equal(read.version, 2); assert.equal(read.count, 2); assert.equal(read.unreadCount, 1);
  assert.equal((await f.markGroup(v1)).unreadCount, 1);
  await errorCode(await f.owner.client.post(`/api/notificacoes/grupos/${v1.id}/lida`, { throughVersion: 3 }), 400);
  const all = await f.groups(); assert.equal(all.attentionUnreadCount, 2);
  await f.markGroup(all.items.find(group => group.id === v1.id));
  assert.equal((await f.groups()).attentionUnreadCount, 1);
});

test('dois consumidores não duplicam fonte ou grupo e leitura individual altera o grupo', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread();
  await f.comment(thread); await f.react(thread, '👏');
  await Promise.all([deliver(), deliver()]); await deliver();
  const page = await f.groups(); const social = page.items.filter(group => group.category === 'SOCIAL');
  assert.equal(social.length, 1); assert.equal(social[0].count, 2);
  const notifications = await f.read('/api/notificacoes');
  const comment = notifications.items.find(item => item.kind === 'COMMENT_CREATED');
  expectStatus(await f.owner.client.post(`/api/notificacoes/${comment.id}/lida`, {}), 200);
  const updated = (await f.groups()).items.find(group => group.id === social[0].id);
  assert.equal(updated.unreadCount, 1);
  const duplicate = await f.database.query('SELECT "eventId" FROM app."Notification" GROUP BY "eventId" HAVING count(*)>1');
  assert.equal(duplicate.rowCount, 0);
});

test('grupos separam item, autor, destinatário e loja, sem fundir decisões financeiras', async t => {
  const f = await relationshipFixture(t); const first = await f.thread(); const second = await f.thread(f.ana, { name: 'Outra origem' });
  await f.comment(first, 'Item um'); await f.comment(second, 'Item dois');
  await f.comment(first, 'Resposta', f.owner); await f.decide(first.record, 'APPROVE');
  await f.send('Bilhete separado'); await deliver();
  const owner = await f.groups();
  assert.equal(owner.items.filter(group => group.category === 'SOCIAL').length, 2);
  assert.equal(owner.items.filter(group => group.category === 'ACTIVITIES').length, 2);
  const ana = await f.groups(f.ana);
  assert.equal(ana.items.filter(group => group.category === 'SOCIAL').length, 1);
  assert.equal(ana.items.filter(group => group.category === 'NOTES').length, 1);
  assert.equal(ana.items.filter(group => group.category === 'ACTIVITIES').length, 1);
  assert.equal((await f.groups(f.bia)).total, 0);
});

test('central pagina e filtra loja/categoria; destino bilhete não confirma sua leitura', async t => {
  const f = await relationshipFixture(t); const sent = await f.send('Corpo jamais no evento');
  await deliver();
  const page = await f.groups(f.ana, `?storeId=${f.store.id}&category=NOTES&pageSize=1`);
  assert.equal(page.total, 1); assert.equal(page.items.length, 1); assert.equal(page.pageSize, 1);
  assert.equal(JSON.stringify(page).includes('Corpo jamais'), false);
  const group = page.items[0];
  const target = await f.read(`/api/notificacoes/grupos/${group.id}/destino`, f.ana);
  assert.equal(target.type, 'note'); assert.equal(target.subjectId, sent.applied.id);
  assert.equal(target.path, `/lojas/${f.store.id}?bilhete=${sent.applied.id}`);
  await f.markGroup(group, group.version, f.ana);
  assert.equal((await f.read(f.ownNotePath, f.ana)).unread, true);
  await errorCode(await f.bia.client.get(`/api/notificacoes/grupos/${group.id}/destino`), 404);
  for (const query of ['?category=INVALID', '?pageSize=51']) await errorCode(await f.ana.client.get(`/api/notificacoes/grupos${query}`), 400);
  await errorCode(await f.ana.client.get('/api/notificacoes/grupos?storeId=invalid'), 404);
});

test('falha na projeção de grupo reverte a entrega inteira e retry materializa uma vez', async t => {
  const f = await relationshipFixture(t); await f.send();
  const name = `t12_group_${randomUUID().replaceAll('-', '')}`;
  await f.database.query(`ALTER TABLE app."NotificationGroup" ADD CONSTRAINT "${name}" CHECK ("storeId" <> '${f.store.id}'::uuid)`);
  try {
    assert.ok((await deliver()).failed >= 1);
    assert.equal((await f.database.query('SELECT n.id FROM app."Notification" n JOIN app."OutboxEvent" e ON e.id=n."eventId" WHERE e."storeId"=$1', [f.store.id])).rowCount, 0);
  } finally { await f.database.query(`ALTER TABLE app."NotificationGroup" DROP CONSTRAINT "${name}"`); }
  await f.database.query('UPDATE app."OutboxEvent" SET "availableAt"=now()-interval \'1 second\' WHERE "storeId"=$1', [f.store.id]);
  await deliver(); await deliver();
  assert.equal((await f.groups(f.ana)).total, 1);
});

test('fronteira de 300s separa grupos; entrega tardia acrescenta versão sem trocar o instante original', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread();
  await f.withEventClock('2026-10-22T12:04:59.000Z', () => f.comment(thread, 'Antes da fronteira'));
  await deliver();
  const first = (await f.groups()).items.find(group => group.category === 'SOCIAL');
  await f.markGroup(first);
  await f.withEventClock('2026-10-22T12:05:00.000Z', () => f.comment(thread, 'Nova janela'));
  await deliver();
  assert.equal((await f.groups()).items.filter(group => group.category === 'SOCIAL').length, 2);
  await f.withEventClock('2026-10-22T12:00:01.000Z', () => f.comment(thread, 'Antiga entregue por último'));
  await deliver();
  const late = (await f.groups()).items.find(group => group.id === first.id);
  assert.equal(late.version, 2); assert.equal(late.unreadCount, 1); assert.equal(late.count, 2);
  assert.equal(late.firstOccurredAt, '2026-10-22T12:00:01.000Z');
  assert.equal(late.lastOccurredAt, '2026-10-22T12:04:59.000Z');
  assert.ok(Date.parse(late.lastDeliveredAt) > Date.parse(late.lastOccurredAt));
});
