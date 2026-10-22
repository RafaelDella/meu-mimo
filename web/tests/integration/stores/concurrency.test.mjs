import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { domainFixture } from './helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';

test('repetições concorrentes da criação recuperam uma única loja e um único convite', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const request = { operationId: randomUUID(), name: 'Criação concorrente',
    presentation: 'Uma única loja.', timezone: 'America/Sao_Paulo' };
  const responses = await Promise.all(Array.from({ length: 3 }, () => owner.client.post('/api/lojas', request)));
  responses.forEach(response => expectStatus(response, 201));
  const stores = await Promise.all(responses.map(response => response.json()));
  stores.forEach(store => fixture.trackStore(store.id));
  assert.ok(stores.every(store => store.id === stores[0].id && store.membershipId === stores[0].membershipId));
  const operationId = randomUUID();
  const invitations = await Promise.all(Array.from({ length: 3 }, () => fixture.invite(owner, stores[0], operationId)));
  assert.ok(invitations.every(invitation => invitation.id === invitations[0].id && invitation.url === invitations[0].url));
  const count = await fixture.database.query(
    'SELECT count(*)::int AS total FROM app."Invitation" WHERE "storeId" = $1', [stores[0].id]);
  assert.equal(count.rows[0].total, 1);
});

test('duas contas disputam o mesmo token: somente uma participação é criada', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const ana = await fixture.user();
  const bia = await fixture.user();
  const store = await fixture.createDomainStore(owner);
  const invitation = await fixture.invite(owner, store);
  const responses = await Promise.all([ana, bia].map(person =>
    person.client.post(`/api/convites/${invitation.token}/aceitar`, {})));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const winner = responses.findIndex(response => response.status === 200);
  const result = await responses[winner].json();
  const loser = await responses[1 - winner].json();
  assert.equal(loser.code, 'invitation_accepted');
  const rows = await fixture.database.query(
    'SELECT id, "profileId" FROM app."Membership" WHERE "storeId" = $1 AND role = \'PARTICIPANT\'', [store.id]);
  assert.deepEqual(rows.rows, [{ id: result.membershipId, profileId: [ana, bia][winner].id }]);
  const accepted = await fixture.database.query(
    'SELECT "acceptedByProfileId", "acceptedMembershipId" FROM app."Invitation" WHERE id = $1', [invitation.id]);
  assert.equal(accepted.rows[0].acceptedByProfileId, [ana, bia][winner].id);
  assert.equal(accepted.rows[0].acceptedMembershipId, result.membershipId);
});

test('dois links aceitos simultaneamente pela mesma conta retornam um único vínculo', async t => {
  const fixture = await domainFixture(t);
  const owner = await fixture.user();
  const person = await fixture.user();
  const store = await fixture.createDomainStore(owner);
  const invitations = [await fixture.invite(owner, store), await fixture.invite(owner, store)];
  const responses = await Promise.all(invitations.map(invitation =>
    person.client.post(`/api/convites/${invitation.token}/aceitar`, {})));
  responses.forEach(response => expectStatus(response, 200));
  const results = await Promise.all(responses.map(response => response.json()));
  assert.deepEqual(results[0], results[1]);
  const rows = await fixture.database.query(
    'SELECT id FROM app."Membership" WHERE "storeId" = $1 AND "profileId" = $2', [store.id, person.id]);
  assert.deepEqual(rows.rows, [{ id: results[0].membershipId }]);
});

for (const action of ['pause', 'revoke']) {
  test(`${action} concorrendo com aceite preserva um resultado consistente`, async t => {
    const fixture = await domainFixture(t);
    const owner = await fixture.user();
    const person = await fixture.user();
    const store = await fixture.createDomainStore(owner);
    const invitation = await fixture.invite(owner, store);
    const mutation = action === 'pause' ?
      `/api/lojas/${store.id}/estado` : `/api/lojas/${store.id}/convites/${invitation.id}/revogar`;
    const [acceptance, change] = await Promise.all([
      person.client.post(`/api/convites/${invitation.token}/aceitar`, {}),
      owner.client.post(mutation, action === 'pause' ? { action: 'pause' } : {}),
    ]);
    assert.ok([200, 409].includes(acceptance.status));
    assert.ok([200, 409].includes(change.status));
    const row = await fixture.database.query(
      'SELECT "acceptedAt", "acceptedMembershipId", "revokedAt" FROM app."Invitation" WHERE id = $1', [invitation.id]);
    const memberships = await fixture.database.query(
      'SELECT id FROM app."Membership" WHERE "storeId" = $1 AND "profileId" = $2', [store.id, person.id]);
    if (acceptance.status === 200) {
      assert.equal(memberships.rowCount, 1);
      assert.ok(row.rows[0].acceptedAt);
      assert.equal(row.rows[0].acceptedMembershipId, memberships.rows[0].id);
      if (action === 'revoke') {
        assert.equal(row.rows[0].revokedAt, null);
        expectStatus(change, 409);
        assert.equal((await change.json()).code, 'invitation_accepted');
      }
    } else {
      assert.equal(memberships.rowCount, 0);
      assert.equal(row.rows[0].acceptedAt, null);
      const body = await acceptance.json();
      assert.equal(body.code, action === 'pause' ? 'store_paused' : 'invitation_revoked');
      expectStatus(change, 200);
    }
    if (action === 'pause') {
      expectStatus(change, 200);
      const current = await owner.client.get(`/api/lojas/${store.id}`);
      assert.equal((await current.json()).state, 'PAUSED');
    }
  });
}
