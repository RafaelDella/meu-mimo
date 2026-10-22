import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFixture } from '../helpers/fixtures.mjs';
import { expectStatus } from '../helpers/http-client.mjs';
import { getDb } from '../../../src/server/db/client.ts';
import { deliverOutboxBatch } from '../../../src/server/outbox/worker.ts';

export const closeRuntime = () => getDb().$disconnect();
export const deliver = () => deliverOutboxBatch({ limit: 50 });

export async function relationFixture(t) {
  const fixture = await createFixture(t);
  const user = () => fixture.createUser().then(person => fixture.login(person));
  const owner = await user();
  const ana = await user();
  const bia = await user();
  const store = await fixture.createStore(owner, 'Relação T05 fictícia');
  const merchant = await fixture.addMembership(store, owner, 'MERCHANT');
  const participation = await fixture.addMembership(store, ana);
  const otherParticipation = await fixture.addMembership(store, bia);
  async function conversation(member = participation, currentStore = store, subjectType = 'TICKET') {
    // Somente fixture: T05 não cria os registros/tickets reais de T07/T09.
    const value = { id: randomUUID(), storeId: currentStore.id, participantMembershipId: member.id,
      subjectType, subjectId: randomUUID() };
    await fixture.database.query('INSERT INTO app."Conversation" (id, "storeId", "participantMembershipId", "subjectType", "subjectId") VALUES ($1,$2,$3,$4,$5)',
      [value.id, value.storeId, value.participantMembershipId, value.subjectType, value.subjectId]);
    return value;
  }
  const thread = await conversation();
  const path = value => `/api/lojas/${value.storeId}/conversas/${value.id}/comentarios`;
  async function post(person, text, operationId = randomUUID(), currentThread = thread) {
    const response = await person.client.post(path(currentThread), { operationId, text });
    expectStatus(response, 201);
    return response.json();
  }
  async function identity(person) {
    const response = await person.client.get('/api/auth/session');
    expectStatus(response, 200);
    return response.json();
  }
  async function notifications(person) {
    const response = await person.client.get('/api/notificacoes');
    expectStatus(response, 200);
    return response.json();
  }
  async function eventFor(comment) {
    const result = await fixture.database.query('SELECT * FROM app."OutboxEvent" WHERE "commentId" = $1', [comment.id]);
    assert.equal(result.rowCount, 1);
    return result.rows[0];
  }
  async function withConstraint(table, expression, operation) {
    assert.ok(['Comment', 'OutboxEvent', 'Notification'].includes(table));
    const name = `t05_proof_${randomUUID().replaceAll('-', '')}`;
    await fixture.database.query(`ALTER TABLE app."${table}" ADD CONSTRAINT "${name}" CHECK (${expression})`);
    try { return await operation(); }
    finally { await fixture.database.query(`ALTER TABLE app."${table}" DROP CONSTRAINT "${name}"`); }
  }
  return { ...fixture, user, owner, ana, bia, store, merchant, participation, otherParticipation,
    conversation, thread, path, post, identity, notifications, eventFor, withConstraint };
}
