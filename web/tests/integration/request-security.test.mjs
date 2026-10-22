import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './helpers/fixtures.mjs';
import { errorCode, expectStatus } from './helpers/http-client.mjs';

test('mutações rejeitam CSRF por outra origem e origem ausente antes de modificar a sessão', async t => {
  const fixture = await createFixture(t);
  const user = await fixture.login(await fixture.createUser());
  const before = new Map(user.client.cookies);
  for (const origin of ['https://example.org', 'null']) {
    await errorCode(await user.client.post('/api/auth/logout', {}, { Origin: origin }), 403, 'origin_forbidden');
    assert.ok(user.client.cookies.size === before.size && [...before].every(([key, value]) =>
      user.client.cookies.get(key) === value), 'A requisição rejeitada não deve alterar cookies.');
    expectStatus(await user.client.get('/api/auth/session'), 200);
  }
  const response = await fetch(`${fixture.environment.origin}/api/auth/logout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    signal: AbortSignal.timeout(10_000),
  });
  await errorCode(response, 403, 'origin_forbidden');
});

test('formato JSON, objeto válido e limite do corpo são verificados antes do login', async t => {
  const fixture = await createFixture(t);
  const client = fixture.client();
  await errorCode(await client.request('/api/auth/login', {
    method: 'POST', body: 'email=fixture&password=fixture', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }), 415, 'content_type_invalid');
  for (const body of ['{', 'null', '[]', '"texto"']) {
    await errorCode(await client.request('/api/auth/login', {
      method: 'POST', body, headers: { 'Content-Type': 'application/json' },
    }), 400, 'body_invalid');
  }
  await errorCode(await client.post('/api/auth/login', { email: fixture.newEmail(), password: 'a'.repeat(9000) }),
    413, 'body_too_large');
});

test('papel administrativo enviado nos dados de acesso não cria uma concessão pública', { timeout: 45_000 }, async t => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const response = await user.client.post('/api/auth/login', {
    email: user.email, password: user.password, role: 'ADMIN', assuranceLevel: 'aal2',
  });
  expectStatus(response, 200);
  await errorCode(await user.client.get('/api/admin/session', { 'X-Role': 'ADMIN', 'X-Aal': 'aal2' }),
    403, 'admin_forbidden');
  const grant = await fixture.database.query('SELECT "profileId" FROM app."AdminGrant" WHERE "profileId" = $1', [user.id]);
  assert.equal(grant.rowCount, 0);
});
