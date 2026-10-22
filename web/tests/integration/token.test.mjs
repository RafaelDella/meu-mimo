import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFixture } from './helpers/fixtures.mjs';
import { errorCode, expectStatus } from './helpers/http-client.mjs';
import { localTokenPair, tokenClaims } from './helpers/jwt.mjs';

async function expectProviderAcceptsKeyAndRejectsExpiry(environment, pair) {
  const accepted = await fetch(`${environment.supabaseURL}/auth/v1/user`, {
    headers: { apikey: environment.publishableKey, Authorization: `Bearer ${pair.valid}` },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(accepted.status, 200,
    'O Auth real deve aceitar a assinatura HMAC local vigente antes da prova de expiração.');
  const response = await fetch(`${environment.supabaseURL}/auth/v1/user`, {
    headers: { apikey: environment.publishableKey, Authorization: `Bearer ${pair.expired}` },
    signal: AbortSignal.timeout(10_000),
  });
  assert.ok([401, 403].includes(response.status), 'O provedor real deve rejeitar o JWT assinado e expirado.');
  const body = await response.json();
  const diagnostic = [body.code, body.error_code, body.message, body.msg, body.error_description]
    .filter(value => typeof value === 'string').join(' ');
  assert.match(diagnostic, /expir/i,
    'O motivo do Auth deve ser a expiração, não apenas uma assinatura ou estrutura inválida.');
}

test('JWT expirado com assinatura local válida não autentica sem um refresh token utilizável', async t => {
  const fixture = await createFixture(t);
  const user = await fixture.login(await fixture.createUser());
  const stored = user.client.storedSession();
  const pair = localTokenPair(stored.access_token);
  const expired = pair.expired;
  await expectProviderAcceptsKeyAndRejectsExpiry(fixture.environment, pair);
  stored.access_token = expired;
  stored.refresh_token = `invalido-${randomUUID()}`;
  stored.expires_at = Math.floor(Date.now() / 1000) - 60;
  user.client.replaceStoredSession(stored);
  await errorCode(await user.client.get('/api/auth/session'), 401);
});

test('refresh real renova JWT expirado, preserva identidade e devolve cookies sem cache público', async t => {
  const fixture = await createFixture(t);
  const user = await fixture.login(await fixture.createUser());
  const stored = user.client.storedSession();
  const previousClaims = tokenClaims(stored.access_token);
  const pair = localTokenPair(stored.access_token);
  const expired = pair.expired;
  await expectProviderAcceptsKeyAndRejectsExpiry(fixture.environment, pair);
  stored.access_token = expired;
  stored.expires_at = Math.floor(Date.now() / 1000) - 60;
  user.client.replaceStoredSession(stored);
  const response = await user.client.get('/api/auth/session');
  expectStatus(response, 200);
  assert.match(response.headers.get('vary') ?? '', /cookie/i);
  const session = await response.json();
  assert.equal(session.userId, user.id);
  assert.equal(session.sessionId, previousClaims.session_id);
  assert.ok(response.headers.getSetCookie().some(value =>
    /^meumimo-auth(?:\.\d+)?=/.test(value) && /httponly/i.test(value) && /samesite=lax/i.test(value)),
  'A renovação no servidor deve propagar o cookie HttpOnly para o navegador.');
  const refreshed = user.client.storedSession();
  assert.ok(refreshed.access_token !== expired, 'O cookie deve conter o JWT renovado, sem exibir o token.');
  const claims = tokenClaims(refreshed.access_token);
  assert.equal(claims.sub, user.id);
  assert.ok(claims.exp > Date.now() / 1000);
  const verified = await fetch(`${fixture.environment.supabaseURL}/auth/v1/user`, {
    headers: { apikey: fixture.environment.publishableKey, Authorization: `Bearer ${refreshed.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(verified.status, 200);
});
