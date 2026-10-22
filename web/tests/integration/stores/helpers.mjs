import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFixture } from '../helpers/fixtures.mjs';
import { expectStatus } from '../helpers/http-client.mjs';

export async function domainFixture(t) {
  const fixture = await createFixture(t);
  const user = async () => fixture.login(await fixture.createUser());
  async function createStore(owner, name = 'Lojinha de teste', extra = {}) {
    const request = {
      operationId: randomUUID(), name, presentation: 'Um cantinho privado.',
      timezone: 'America/Sao_Paulo', ...extra,
    };
    const response = await owner.client.post('/api/lojas', request);
    expectStatus(response, 201);
    const store = await response.json();
    fixture.trackStore(store.id);
    return { ...store, request };
  }
  async function invite(owner, store, operationId = randomUUID()) {
    const response = await owner.client.post(`/api/lojas/${store.id}/convites`, { operationId });
    expectStatus(response, 201);
    const invitation = await response.json();
    const url = new URL(invitation.url, fixture.environment.origin);
    assert.equal(url.origin, fixture.environment.origin);
    assert.match(url.pathname, /^\/convites\/[a-zA-Z0-9_-]+$/);
    return { ...invitation, token: url.pathname.split('/').at(-1), operationId };
  }
  async function accept(person, invitation) {
    const response = await person.client.post(`/api/convites/${invitation.token}/aceitar`, {});
    expectStatus(response, 200);
    return response.json();
  }
  async function state(owner, store, action) {
    const response = await owner.client.post(`/api/lojas/${store.id}/estado`, { action });
    expectStatus(response, 200);
    return response.json();
  }
  return { ...fixture, user, createDomainStore: createStore, invite, accept, state };
}
