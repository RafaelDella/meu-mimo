import { randomUUID } from 'node:crypto';
import { expectStatus } from '../helpers/http-client.mjs';

export async function codeInvitation(owner, store, policy = {}) {
  const request = { operationId: randomUUID(), kind: 'CODE', expiration: { kind: 'AFTER_DAYS', days: 7 }, maxUses: 1, ...policy };
  const response = await owner.client.post(`/api/lojas/${store.id}/convites`, request);
  expectStatus(response, 201);
  const result = await response.json();
  return { ...result, request, token: new URL(result.url).pathname.split('/').at(-1) };
}

export async function searchCode(person, code, filters = {}) {
  const response = await person.client.post('/api/lojas/buscar', { q: code, ...filters });
  expectStatus(response, 200);
  return response.json();
}

export async function acceptCode(person, code) {
  const response = await person.client.post('/api/convites/aceitar-codigo', { code });
  expectStatus(response, 200);
  return response.json();
}
