import test from 'node:test';
import assert from 'node:assert/strict';
import { domainFixture } from './helpers.mjs';
import { codeInvitation } from './code-helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';

test('seis contas disputando duas vagas criam exatamente dois vínculos, usos e eventos', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const people = [];
  for (let index = 0; index < 6; index += 1) people.push(await f.user());
  const store = await f.createDomainStore(owner);
  const invitation = await codeInvitation(owner, store, { maxUses: 2 });
  const responses = await Promise.all(people.map(person => person.client.post('/api/convites/aceitar-codigo', { code: invitation.code })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 200, 409, 409, 409, 409]);
  for (const response of responses.filter(response => response.status === 409)) assert.equal((await response.json()).code, 'invitation_exhausted');
  const rows = await f.database.query(`SELECT "useCount",(SELECT count(*)::int FROM app."InvitationUse" WHERE "invitationId"=$1) AS uses,
    (SELECT count(*)::int FROM app."Membership" WHERE "storeId"=$2 AND role='PARTICIPANT') AS members,
    (SELECT count(*)::int FROM app."OutboxEvent" WHERE "invitationId"=$1) AS events FROM app."Invitation" WHERE id=$1`, [invitation.id, store.id]);
  assert.deepEqual(rows.rows[0], { useCount: 2, uses: 2, members: 2, events: 2 });
});

test('mesma pessoa e dois códigos simultâneos consomem um ingresso no total', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const person = await f.user();
  const store = await f.createDomainStore(owner);
  const invitations = [await codeInvitation(owner, store), await codeInvitation(owner, store)];
  const responses = await Promise.all(invitations.map(invitation => person.client.post('/api/convites/aceitar-codigo', { code: invitation.code })));
  responses.forEach(response => expectStatus(response, 200));
  const results = await Promise.all(responses.map(response => response.json()));
  assert.deepEqual(results[0], results[1]);
  const rows = await f.database.query(`SELECT sum("useCount")::int AS uses,
    (SELECT count(*)::int FROM app."InvitationUse" WHERE "storeId"=$1) AS history,
    (SELECT count(*)::int FROM app."OutboxEvent" WHERE "storeId"=$1 AND kind='INVITATION_ACCEPTED') AS events FROM app."Invitation" WHERE "storeId"=$1`, [store.id]);
  assert.deepEqual(rows.rows[0], { uses: 1, history: 1, events: 1 });
});

for (const action of ['pause', 'revoke']) {
  test(`${action} concorrendo com aceite por código mantém histórico consistente`, async t => {
    const f = await domainFixture(t);
    const owner = await f.user();
    const person = await f.user();
    const store = await f.createDomainStore(owner);
    const invitation = await codeInvitation(owner, store, { maxUses: null });
    const mutation = action === 'pause' ? `/api/lojas/${store.id}/estado` : `/api/lojas/${store.id}/convites/${invitation.id}/revogar`;
    const [acceptance, change] = await Promise.all([
      person.client.post('/api/convites/aceitar-codigo', { code: invitation.code }),
      owner.client.post(mutation, action === 'pause' ? { action: 'pause' } : {}),
    ]);
    assert.ok([200, 409].includes(acceptance.status));
    expectStatus(change, 200);
    const row = (await f.database.query(`SELECT "useCount",(SELECT count(*)::int FROM app."InvitationUse" WHERE "invitationId"=$1) AS uses,
      (SELECT count(*)::int FROM app."Membership" WHERE "storeId"=$2 AND "profileId"=$3) AS members FROM app."Invitation" WHERE id=$1`,
    [invitation.id, store.id, person.id])).rows[0];
    const expected = acceptance.status === 200 ? 1 : 0;
    assert.deepEqual(row, { useCount: expected, uses: expected, members: expected });
    if (acceptance.status === 409) assert.equal((await acceptance.json()).code, action === 'pause' ? 'store_paused' : 'invitation_revoked');
  });
}
