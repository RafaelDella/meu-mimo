import test from 'node:test';
import assert from 'node:assert/strict';
import { domainFixture } from './helpers.mjs';
import { acceptCode, codeInvitation, searchCode } from './code-helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

test('resolução autenticada mínima, origem, conta suspensa e sessão revogada são revalidadas', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const person = await f.user();
  const store = await f.createDomainStore(owner);
  const invitation = await codeInvitation(owner, store);
  await errorCode(await f.client().post('/api/lojas/buscar', { q: invitation.code }), 401);
  await errorCode(await f.client().post('/api/convites/aceitar-codigo', { code: invitation.code }), 401);
  const forbidden = { Origin: 'https://example.invalid' };
  await errorCode(await person.client.post('/api/lojas/buscar', { q: invitation.code }, forbidden), 403);
  await errorCode(await person.client.post('/api/convites/aceitar-codigo', { code: invitation.code }, forbidden), 403);
  const preview = (await searchCode(person, invitation.code)).invitation;
  assert.equal(JSON.stringify(preview).includes(person.email), false);
  assert.equal(JSON.stringify(preview).includes(owner.email), false);
  assert.equal('useCount' in preview, false);
  assert.equal('codeHash' in preview, false);
  assert.equal('maxUses' in preview, false);
  assert.equal('code' in preview, false);
  await f.database.query('UPDATE app."Profile" SET "suspendedAt"=now() WHERE id=$1', [person.id]);
  await errorCode(await person.client.post('/api/convites/aceitar-codigo', { code: invitation.code }), 403, 'account_suspended');
  await errorCode(await person.client.post('/api/lojas/buscar', { q: invitation.code }), 403, 'account_suspended');
  await f.database.query('UPDATE app."Profile" SET "suspendedAt"=NULL WHERE id=$1', [person.id]);
  const session = await person.client.get('/api/auth/session');
  expectStatus(session, 200);
  await f.database.query('UPDATE app."AuthSession" SET "revokedAt"=now() WHERE id=$1', [(await session.json()).sessionId]);
  await errorCode(await person.client.post('/api/convites/aceitar-codigo', { code: invitation.code }), 401, 'session_invalid');
  assert.equal((await f.database.query('SELECT id FROM app."InvitationUse" WHERE "invitationId"=$1', [invitation.id])).rowCount, 0);
});

test('participação encerrada ou acesso retirado nunca são reabertos por código', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const closed = await f.user();
  const revoked = await f.user();
  const store = await f.createDomainStore(owner);
  const invitation = await codeInvitation(owner, store, { expiration: { kind: 'NEVER' }, maxUses: null });
  const first = await acceptCode(closed, invitation.code);
  const second = await acceptCode(revoked, invitation.code);
  await f.database.query('UPDATE app."Membership" SET "closedAt"=now() WHERE id=$1', [first.membershipId]);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [second.membershipId]);
  assert.equal((await searchCode(closed, invitation.code)).invitation.viewerAction, 'HISTORY');
  assert.equal((await searchCode(revoked, invitation.code)).invitation.viewerAction, 'UNAVAILABLE');
  await errorCode(await closed.client.post('/api/convites/aceitar-codigo', { code: invitation.code }), 409, 'membership_closed');
  await errorCode(await revoked.client.post('/api/convites/aceitar-codigo', { code: invitation.code }), 404, 'resource_not_found');
  assert.equal((await f.database.query('SELECT "useCount" FROM app."Invitation" WHERE id=$1', [invitation.id])).rows[0].useCount, 2);
});

test('dez tentativas compartilhadas contam inválidos e aceite direto não contorna o orçamento', async t => {
  const f = await domainFixture(t);
  const person = await f.user();
  const other = await f.user();
  const invalid = await Promise.all(Array.from({ length: 8 }, () => person.client.post('/api/convites/aceitar-codigo', { code: 'inválido' })));
  for (const response of invalid) await errorCode(response, 404, 'invitation_invalid');
  for (let index = 0; index < 2; index += 1) {
    const result = await searchCode(person, '7KQ9M4TX2P');
    assert.equal(result.invitation, null);
  }
  const limited = await person.client.post('/api/convites/aceitar-codigo', { code: '7KQ9M4TX2P' }, { 'X-Forwarded-For': '198.51.100.27' });
  await errorCode(limited, 429, 'rate_limited');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  const searchLimited = await person.client.post('/api/lojas/buscar', { q: '7KQ9M4TX2P' });
  await errorCode(searchLimited, 429, 'rate_limited');
  expectStatus(await person.client.post('/api/lojas/buscar', { q: 'Nome da loja' }), 200);
  expectStatus(await person.client.post('/api/lojas/buscar', { q: '7KQ9M4TX2P', resolveInvitation: false }), 200);
  expectStatus(await other.client.post('/api/lojas/buscar', { q: '7KQ9M4TX2P' }), 200);
});
