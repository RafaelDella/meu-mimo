import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { relationFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { registerConversation } from '../../../src/server/conversations/service.ts';
import { withStoreTransaction } from '../../../src/server/stores/transaction.ts';

after(closeRuntime);

test('conversa pertence somente à relação; outra loja, participante e admin não ganham acesso', async t => {
  const f = await relationFixture(t);
  await f.post(f.ana, 'Conversa privada da Ana.');
  const own = await f.ana.client.get(f.path(f.thread));
  expectStatus(own, 200);
  assert.equal((await own.json()).items[0].author.id, f.ana.id);
  expectStatus(await f.owner.client.get(f.path(f.thread)), 200);
  await errorCode(await f.bia.client.get(f.path(f.thread)), 404);
  await errorCode(await f.bia.client.post(f.path(f.thread), { operationId: randomUUID(), text: 'Intrusão', role: 'MERCHANT' }), 400);
  await errorCode(await f.bia.client.post(f.path(f.thread), { operationId: randomUUID(), text: 'Intrusão' }, { 'X-Role': 'MERCHANT' }), 404);
  const outsider = await f.user();
  await f.database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [outsider.id]);
  await errorCode(await outsider.client.get(f.path(f.thread)), 404);
  const another = await f.createStore(outsider);
  await f.addMembership(another, outsider, 'MERCHANT');
  await errorCode(await outsider.client.get(`/api/lojas/${another.id}/conversas/${f.thread.id}/comentarios`), 404);
});

test('IDs arbitrários não criam assunto; o registrador interno não aceita contexto divergente', async t => {
  const f = await relationFixture(t);
  await errorCode(await f.ana.client.post(`/api/lojas/${f.store.id}/conversas/${randomUUID()}/comentarios`,
    { operationId: randomUUID(), text: 'Sem assunto' }), 404);
  assert.equal((await f.ana.client.post(`/api/lojas/${f.store.id}/conversas`, { subjectId: randomUUID() })).status, 404);
  const identity = await f.identity(f.owner);
  const input = { subjectType: f.thread.subjectType, subjectId: f.thread.subjectId, participantMembershipId: f.participation.id };
  const existing = await withStoreTransaction(identity, f.store.id, scope => registerConversation(scope, input));
  assert.equal(existing.id, f.thread.id);
  await assert.rejects(withStoreTransaction(identity, f.store.id, scope => registerConversation(scope,
    { ...input, participantMembershipId: f.otherParticipation.id })));
  const stranger = await f.user();
  const otherStore = await f.createStore(stranger);
  await f.addMembership(otherStore, stranger, 'MERCHANT');
  const otherMember = await f.addMembership(otherStore, f.ana);
  await assert.rejects(withStoreTransaction(await f.identity(stranger), otherStore.id, scope => registerConversation(scope,
    { ...input, participantMembershipId: otherMember.id })));
  assert.equal((await f.database.query('SELECT id FROM app."Conversation" WHERE "subjectId" = $1', [f.thread.subjectId])).rowCount, 1);
});

test('sessão, origem, suspensão e revogação são verificadas antes de ler ou comentar', async t => {
  const f = await relationFixture(t);
  await errorCode(await f.client().get(f.path(f.thread)), 401);
  await errorCode(await f.ana.client.post(f.path(f.thread), { operationId: randomUUID(), text: 'CSRF' }, { Origin: 'https://example.invalid' }), 403);
  await f.database.query('UPDATE app."Profile" SET "suspendedAt" = now() WHERE id = $1', [f.ana.id]);
  await errorCode(await f.ana.client.get(f.path(f.thread)), 403);
  await f.database.query('UPDATE app."Profile" SET "suspendedAt" = NULL WHERE id = $1', [f.ana.id]);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt" = now() WHERE id = $1', [f.participation.id]);
  await errorCode(await f.ana.client.get(f.path(f.thread)), 404);
  await errorCode(await f.owner.client.get(f.path(f.thread)), 404);
  await errorCode(await f.owner.client.post(f.path(f.thread), { operationId: randomUUID(), text: 'Revogado' }), 404);
});

test('pausa e encerramento preservam conversa; fechar escrita ainda recupera comentário confirmado', async t => {
  const f = await relationFixture(t);
  await f.database.query('UPDATE app."Store" SET state = \'PAUSED\', "pausedAt" = now() WHERE id = $1', [f.store.id]);
  const first = await f.post(f.ana, 'Uma pendência para combinar.');
  await f.database.query('UPDATE app."Store" SET state = \'CLOSED\', "closedAt" = now() WHERE id = $1', [f.store.id]);
  await f.database.query('UPDATE app."Membership" SET "closedAt" = now() WHERE id = $1', [f.participation.id]);
  await f.post(f.owner, 'Podemos resolver por aqui.');
  await f.database.query('UPDATE app."Conversation" SET "commentsClosedAt" = now() WHERE id = $1', [f.thread.id]);
  const current = await f.ana.client.get(f.path(f.thread));
  expectStatus(current, 200);
  assert.equal((await current.json()).conversation.writable, false);
  const repeated = await f.post(f.ana, first.text, first.id);
  assert.deepEqual(repeated, first);
  await errorCode(await f.ana.client.post(f.path(f.thread), { operationId: randomUUID(), text: 'Novo texto' }), 409, 'conversation_read_only');
});
