import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFixture } from './helpers/fixtures.mjs';
import { confirmationLink } from './helpers/mail.mjs';
import { errorCode, expectStatus } from './helpers/http-client.mjs';

const neutralMessage = 'Se os dados estiverem corretos, confira seu e-mail.';

test('cadastro exige e-mail verificado, preserva PKCE e retorna ao convite interno', { timeout: 45_000 }, async t => {
  const fixture = await createFixture(t);
  const email = fixture.newEmail();
  fixture.trackEmail(email);
  const password = `Cadastro!${randomUUID()}`;
  const client = fixture.client();
  const returnTo = '/convites/convite-de-integracao';
  const signup = await client.post('/api/auth/signup', {
    email, password, returnTo, role: 'ADMIN', assuranceLevel: 'aal2',
  });
  expectStatus(signup, 202);
  assert.deepEqual(await signup.json(), { message: neutralMessage });
  assert.ok(signup.headers.getSetCookie().some(value =>
    value.startsWith('meumimo-auth-code-verifier') && /httponly/i.test(value) && /samesite=lax/i.test(value)),
  'O verificador PKCE deve ser guardado em cookie HttpOnly.');

  const unverifiedLogin = await client.post('/api/auth/login', { email, password });
  assert.ok([401, 403].includes(unverifiedLogin.status), 'E-mail não verificado não pode autenticar.');
  await errorCode(await client.get('/api/auth/session'), 401);
  const link = await confirmationLink(fixture.environment, email);
  const destination = await client.followConfirmation(link);
  assert.equal(new URL(destination.url).origin, fixture.environment.origin);
  assert.equal(new URL(destination.url).pathname, returnTo);
  const sessionResponse = await client.get('/api/auth/session');
  expectStatus(sessionResponse, 200);
  const session = await sessionResponse.json();
  assert.match(session.userId, /^[\da-f-]{36}$/i);
  fixture.trackUser(session.userId);
  assert.equal(session.assuranceLevel, 'aal1');
  assert.equal(session.recovery, false);
  await errorCode(await client.get('/api/admin/session'), 403, 'admin_forbidden');
  const grant = await fixture.database.query('SELECT "profileId" FROM app."AdminGrant" WHERE "profileId" = $1', [session.userId]);
  assert.equal(grant.rowCount, 0, 'O cadastro público não deve aceitar uma concessão administrativa do corpo.');
});

test('login usa destino seguro e cookies privados, sem devolver tokens no JSON', async t => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const login = await user.client.post('/api/auth/login', {
    email: user.email, password: user.password, returnTo: 'https://example.org/externo',
  });
  expectStatus(login, 200);
  assert.deepEqual(await login.json(), { returnTo: '/conta' });
  const cookies = login.headers.getSetCookie().filter(value => /^meumimo-auth(?:\.\d+)?=/.test(value));
  assert.ok(cookies.length > 0);
  assert.ok(cookies.every(value => /httponly/i.test(value) && /samesite=lax/i.test(value) && /path=\//i.test(value)));
  const sessionResponse = await user.client.get('/api/auth/session');
  expectStatus(sessionResponse, 200);
  const session = await sessionResponse.json();
  assert.equal(session.userId, user.id);
  assert.match(session.sessionId, /^[\da-f-]{36}$/i);
  assert.equal(session.recovery, false);
  assert.equal('access_token' in session, false);
  assert.equal('refresh_token' in session, false);
});

test('sessão ausente ou token adulterado não autoriza recursos privados', async t => {
  const fixture = await createFixture(t);
  await errorCode(await fixture.client().get('/api/auth/session'), 401);
  const user = await fixture.login(await fixture.createUser());
  const stored = user.client.storedSession();
  assert.equal(typeof stored.access_token, 'string');
  const [header, payload, signature] = stored.access_token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  claims.sub = randomUUID();
  claims.role = 'service_role';
  stored.access_token = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
  user.client.replaceStoredSession(stored);
  await errorCode(await user.client.get('/api/auth/session'), 401);
  await errorCode(await user.client.get('/api/admin/session'), 401);
});

test('logout revoga também a cópia anterior do cookie e suspensão afeta a próxima requisição', async t => {
  const fixture = await createFixture(t);
  const user = await fixture.login(await fixture.createUser());
  const previousCookie = user.client.clone();
  const logout = await user.client.post('/api/auth/logout', {});
  expectStatus(logout, 200);
  await errorCode(await user.client.get('/api/auth/session'), 401);
  await errorCode(await previousCookie.get('/api/auth/session'), 401);

  await fixture.login(user);
  await fixture.database.query('UPDATE app."Profile" SET "suspendedAt" = now() WHERE id = $1', [user.id]);
  await errorCode(await user.client.get('/api/auth/session'), 403, 'account_suspended');
});

test('recuperação por e-mail cria contexto restrito e só libera a conta após trocar a senha', { timeout: 45_000 }, async t => {
  const fixture = await createFixture(t);
  const user = await fixture.login(await fixture.createUser());
  const store = await fixture.createStore(user);
  await fixture.addMembership(store, user, 'MERCHANT');
  const client = fixture.client();
  const recovery = await client.post('/api/auth/recovery', { email: user.email });
  expectStatus(recovery, 202);
  assert.deepEqual(await recovery.json(), { message: neutralMessage });
  await client.followConfirmation(await confirmationLink(fixture.environment, user.email));
  const session = await client.get('/api/auth/session');
  expectStatus(session, 200);
  assert.equal((await session.json()).recovery, true);
  await errorCode(await client.get(`/api/lojas/${store.id}`), 403, 'recovery_required');
  await errorCode(await client.get('/api/admin/session'), 403, 'recovery_required');
  const newPassword = `Recuperada!${randomUUID()}`;
  expectStatus(await client.patch('/api/auth/recovery', { password: newPassword }), 200);
  const restored = await client.get('/api/auth/session');
  expectStatus(restored, 200);
  assert.equal((await restored.json()).recovery, false);
  expectStatus(await client.get(`/api/lojas/${store.id}`), 200);
  await errorCode(await fixture.client().post('/api/auth/login', { email: user.email, password: user.password }), 401);
  expectStatus(await fixture.client().post('/api/auth/login', { email: user.email, password: newPassword }), 200);
});

test('sessão comum não pode usar a conclusão de recuperação como troca irrestrita de senha', async t => {
  const fixture = await createFixture(t);
  const user = await fixture.login(await fixture.createUser());
  await errorCode(await user.client.patch('/api/auth/recovery', { password: `Outra!${randomUUID()}` }), 403);
});
