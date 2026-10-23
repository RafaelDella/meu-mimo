import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { relationshipFixture, closeRuntime, deliver } from './helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('duas intenções de bilhete com a mesma versão confirmam uma; mesma UUID confirma uma vez', async t => {
  const f = await relationshipFixture(t);
  const request = { operationId: randomUUID(), expectedVersion: 0, text: 'Uma intenção' };
  const replies = await Promise.all([f.owner.client.patch(f.notePath(), request), f.owner.client.patch(f.notePath(), { ...request, operationId: randomUUID(), text: 'Outra intenção' })]);
  assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
  const accepted = await replies.find(reply => reply.status === 200).json();
  const second = { operationId: randomUUID(), expectedVersion: 1, text: 'Segunda versão' };
  const same = await Promise.all([f.owner.client.patch(f.notePath(), second), f.owner.client.patch(f.notePath(), second)]);
  same.forEach(reply => expectStatus(reply, 200));
  assert.equal(accepted.applied.version, 1);
  assert.equal((await f.note()).current.version, 2);
  assert.equal((await f.database.query('SELECT id FROM app."NoteVersion" WHERE "storeId"=$1', [f.store.id])).rowCount, 2);
});

test('reação concorrente de autores diferentes conserva uma escolha por pessoa', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread();
  const [ana, owner] = await Promise.all([f.react(thread, '❤️', f.ana), f.react(thread, '👏', f.owner)]);
  assert.equal(ana.appliedVersion, 1); assert.equal(owner.appliedVersion, 1);
  const state = await f.read(f.reactionPath(thread), f.ana);
  assert.equal(state.reactions.length, 2); assert.equal(state.mine, '❤️');
  const body = { operationId: randomUUID(), expectedVersion: 1, emoji: '🌷' };
  const race = await Promise.all([f.ana.client.request(f.reactionPath(thread), { method: 'PUT', json: body }),
    f.ana.client.request(f.reactionPath(thread), { method: 'PUT', json: { ...body, operationId: randomUUID(), emoji: '🔥' } })]);
  assert.deepEqual(race.map(reply => reply.status).sort(), [200, 409]);
  assert.equal((await f.read(f.reactionPath(thread), f.owner)).version, 1);
});

test('leitura simultânea exata e entrega de grupo são idempotentes', async t => {
  const f = await relationshipFixture(t); const sent = await f.send();
  const reads = await Promise.all([f.mark(sent.applied), f.mark(sent.applied)]);
  assert.equal(reads[0].readAt, reads[1].readAt);
  await Promise.all([deliver(), deliver()]);
  const group = (await f.groups(f.ana)).items[0];
  const marks = await Promise.all([f.markGroup(group, group.version, f.ana), f.markGroup(group, group.version, f.ana)]);
  assert.ok(marks.every(item => item.unreadCount === 0));
  assert.equal((await f.database.query('SELECT * FROM app."NoteRead" WHERE "noteVersionId"=$1', [sent.applied.id])).rowCount, 1);
});
