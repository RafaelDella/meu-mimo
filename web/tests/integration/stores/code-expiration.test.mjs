import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { domainFixture } from './helpers.mjs';
import { codeInvitation } from './code-helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

function sunday(year, month, occurrence) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const day = 1 + (7 - first.getUTCDay()) % 7 + (occurrence - 1) * 7;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:30`;
}

test('prazo enumera Havana ambígua, recusa lacuna, data civil inválida e offset incompatível', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const store = await f.createDomainStore(owner, 'Fuso de Havana', { timezone: 'America/Havana' });
  const year = new Date().getUTCFullYear() + 2;
  const localDateTime = sunday(year, 11, 1);
  const candidates = await owner.client.post(`/api/lojas/${store.id}/convites/prazo`, { localDateTime });
  expectStatus(candidates, 200);
  const result = await candidates.json();
  assert.equal(result.timezone, 'America/Havana');
  assert.deepEqual(result.candidates.map(item => item.offset), ['-04:00', '-05:00']);
  const invitation = await codeInvitation(owner, store, { expiration: { kind: 'AT', at: result.candidates[0].at } });
  assert.equal(invitation.expiresAt, new Date(result.candidates[0].at).toISOString());
  const gap = await owner.client.post(`/api/lojas/${store.id}/convites/prazo`, { localDateTime: sunday(year, 3, 2) });
  expectStatus(gap, 200);
  assert.deepEqual((await gap.json()).candidates, []);
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/convites/prazo`, { localDateTime: `${year}-02-30T12:00` }), 400, 'field_invalid');
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/convites`, { ...invitation.request, operationId: randomUUID(),
    expiration: { kind: 'AT', at: `${localDateTime}:00-03:00` } }), 400, 'invitation_expiration_invalid');
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/convites`, { ...invitation.request, operationId: randomUUID(),
    expiration: { kind: 'AT', at: `${sunday(year, 3, 2)}:00-05:00` } }), 400, 'invitation_expiration_invalid');
});

test('repetição recupera prazo original mesmo depois de expirar; nova criação no passado falha', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const store = await f.createDomainStore(owner);
  const invitation = await codeInvitation(owner, store);
  await f.database.query(`UPDATE app."Invitation" SET "createdAt"=now()-interval '2 days',"expiresAt"=now()-interval '1 day' WHERE id=$1`, [invitation.id]);
  const repeated = await owner.client.post(`/api/lojas/${store.id}/convites`, invitation.request);
  expectStatus(repeated, 201);
  const result = await repeated.json();
  assert.equal(result.status, 'EXPIRED');
  assert.equal(result.code, invitation.code);
  assert.ok(Date.parse(result.expiresAt) < Date.now());
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const candidates = await owner.client.post(`/api/lojas/${store.id}/convites/prazo`, { localDateTime: past });
  expectStatus(candidates, 200);
  await errorCode(await owner.client.post(`/api/lojas/${store.id}/convites`, { ...invitation.request, operationId: randomUUID(),
    expiration: { kind: 'AT', at: (await candidates.json()).candidates[0].at } }), 400, 'invitation_expiration_past');
});
