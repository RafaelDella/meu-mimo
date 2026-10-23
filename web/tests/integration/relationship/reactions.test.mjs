import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { relationshipFixture, closeRuntime, deliver } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('seis reações, troca/remoção/noop preservam autoria e auditoria sem avisar remoção', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread();
  const initial = await f.read(f.reactionPath(thread), f.ana);
  assert.equal(initial.version, 0); assert.equal(initial.mine, null); assert.deepEqual(initial.reactions, []);
  for (const emoji of ['❤️', '👏', '🥹', '🔥', '😂', '🌷']) {
    const changed = await f.react(thread, emoji);
    assert.equal(changed.state.mine, emoji);
    const noop = await f.react(thread, emoji);
    assert.equal(noop.state.version, changed.state.version + 1);
    assert.equal(noop.event.from, emoji); assert.equal(noop.event.to, emoji);
  }
  const removed = await f.react(thread, null);
  assert.equal(removed.state.mine, null); assert.equal(removed.state.reactions.length, 0);
  const events = await f.database.query('SELECT id FROM app."ReactionEvent" WHERE "conversationId"=$1', [thread.id]);
  assert.equal(events.rowCount, 13);
  const notices = await f.database.query('SELECT id FROM app."OutboxEvent" WHERE "reactionEventId"=ANY($1::uuid[])', [events.rows.map(row => row.id)]);
  assert.equal(notices.rowCount, 6);
  await f.react(thread, '👏', f.owner);
  const ana = await f.read(f.reactionPath(thread), f.ana);
  assert.equal(ana.mine, null); assert.equal(ana.reactions[0].author.id, f.owner.id);
  await deliver();
  assert.equal((await f.groups(f.bia)).total, 0);
});

test('reaction_replay_after_replace_remove retorna intenção aplicada e estado atual', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread();
  const first = await f.react(thread, '❤️');
  await f.react(thread, '🌷'); await f.react(thread, null);
  const response = await f.ana.client.request(f.reactionPath(thread), { method: 'PUT', json: first.request });
  expectStatus(response, 200); const replay = await response.json();
  assert.equal(replay.appliedVersion, 1); assert.equal(replay.event.id, first.event.id);
  assert.equal(replay.state.mine, null); assert.equal(replay.state.version, 3);
  const lookup = await f.read(`${f.reactionPath(thread)}/operacoes/${first.event.id}`, f.ana);
  assert.equal(lookup.operation.event.id, first.event.id);
  await errorCode(await f.owner.client.get(`${f.reactionPath(thread)}/operacoes/${first.event.id}`), 404);
  await errorCode(await f.ana.client.request(f.reactionPath(thread), { method: 'PUT', json: { ...first.request, emoji: '🔥' } }), 409);
  assert.equal((await f.database.query('SELECT id FROM app."ReactionEvent" WHERE "conversationId"=$1', [thread.id])).rowCount, 3);
});

test('social_actions_preserve_economy: bilhete, comentário e reação não alteram finanças', async t => {
  const f = await relationshipFixture(t); const record = await f.credit(15);
  const reward = await f.createReward({ stock: 2 }); const ticket = await f.redeem(reward);
  const thread = (await f.database.query('SELECT id FROM app."Conversation" WHERE "subjectId"=$1', [ticket.id])).rows[0];
  const before = await f.financial();
  await f.send(); await f.mark((await f.note()).current);
  await f.comment(thread); await f.react(thread, '❤️'); await f.react(thread, null);
  await deliver();
  assert.deepEqual(await f.financial(), before);
  assert.equal((await f.latest(record)).status, 'APPROVED');
});

test('reação valida emoji/corpo/versão e respeita conversa fechada sem bloquear replay', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread();
  for (const emoji of ['💜', '❤', '', 1]) {
    await errorCode(await f.ana.client.request(f.reactionPath(thread), { method: 'PUT', json: { operationId: randomUUID(), expectedVersion: 0, emoji } }), 400);
  }
  const first = await f.react(thread);
  await errorCode(await f.ana.client.request(f.reactionPath(thread), { method: 'PUT', json: { ...first.request, operationId: randomUUID() } }), 409);
  await f.database.query('UPDATE app."Conversation" SET "commentsClosedAt"=clock_timestamp() WHERE id=$1', [thread.id]);
  assert.equal((await f.read(f.reactionPath(thread), f.ana)).writable, false);
  await errorCode(await f.ana.client.request(f.reactionPath(thread), { method: 'PUT', json: { operationId: randomUUID(), expectedVersion: 1, emoji: null } }), 409);
  expectStatus(await f.ana.client.request(f.reactionPath(thread), { method: 'PUT', json: first.request }), 200);
});

test('reação rollback de projeção/evento/outbox deixa intenção sem efeito', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread();
  for (const table of ['Reaction', 'ReactionEvent', 'OutboxEvent']) {
    const operationId = randomUUID(); const name = `t12_reaction_${operationId.replaceAll('-', '')}`;
    const expression = table === 'Reaction' ? `"conversationId" <> '${thread.id}'::uuid` :
      table === 'ReactionEvent' ? `id <> '${operationId}'::uuid` : `"reactionEventId" IS DISTINCT FROM '${operationId}'::uuid`;
    await f.database.query(`ALTER TABLE app."${table}" ADD CONSTRAINT "${name}" CHECK (${expression})`);
    try {
      await errorCode(await f.ana.client.request(f.reactionPath(thread), { method: 'PUT', json: { operationId, expectedVersion: 0, emoji: '❤️' } }), 503);
    } finally { await f.database.query(`ALTER TABLE app."${table}" DROP CONSTRAINT "${name}"`); }
    assert.equal((await f.read(f.reactionPath(thread), f.ana)).version, 0);
    assert.equal((await f.read(`${f.reactionPath(thread)}/operacoes/${operationId}`, f.ana)).operation, null);
  }
});
