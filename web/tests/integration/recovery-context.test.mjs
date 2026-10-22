import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createFixture } from './helpers/fixtures.mjs';
import { confirmationLink } from './helpers/mail.mjs';
import { errorCode, expectStatus } from './helpers/http-client.mjs';

function verifierCookie(client, callbackURL) {
  const flowId = callbackURL ? new URL(callbackURL).searchParams.get('sb_flow_id') : null;
  const name = flowId ? `meumimo-auth-flow-${flowId}-code-verifier` : 'meumimo-auth-code-verifier';
  const value = client.cookies.get(name);
  assert.ok(value, 'O fluxo deve emitir o verificador PKCE selecionado pelo callback.');
  return { name, value };
}

async function recoveryFixture(t) {
  const fixture = await createFixture(t);
  const user = await fixture.login(await fixture.createUser());
  const store = await fixture.createStore(user, 'Loja restrita durante recuperação');
  await fixture.addMembership(store, user, 'MERCHANT');
  const client = fixture.client();
  expectStatus(await client.post('/api/auth/recovery', { email: user.email }), 202);
  const link = await confirmationLink(fixture.environment, user.email);
  return { fixture, user, store, client, link };
}

async function callbackBeforeExchange(client, link) {
  let next = new URL(link);
  for (let hop = 0; hop < 8; hop += 1) {
    if (next.origin === client.environment.origin && next.pathname === '/api/auth/callback') {
      assert.ok(next.searchParams.has('code'), 'A confirmação real deve fornecer um código PKCE.');
      return next.href;
    }
    const response = await client.get(next.href);
    assert.ok([301, 302, 303, 307, 308].includes(response.status),
      'O e-mail deve passar pelo Auth real antes do callback da aplicação.');
    const location = response.headers.get('location');
    assert.ok(location, 'A confirmação do Auth deve informar o próximo destino.');
    next = new URL(location, next);
  }
  throw new Error('O fluxo não chegou ao callback local dentro do limite de redirecionamentos.');
}

async function expectRejectedContext(client, callbackURL) {
  await errorCode(await client.get(callbackURL), 400, 'callback_invalid');
  await errorCode(await client.get('/api/auth/session'), 401);
}

test('remover a finalidade recovery do verificador não libera uma sessão comum antes de trocar a senha',
  { timeout: 45_000 }, async t => {
    const { client, store, link } = await recoveryFixture(t);
    const callbackURL = await callbackBeforeExchange(client, link);
    let changed = 0;
    for (const [name, value] of client.cookies) {
      if (!name.endsWith('-code-verifier')) continue;
      const encoded = decodeURIComponent(value);
      assert.ok(encoded.startsWith('base64-'), 'O verificador deve usar o formato SSR esperado.');
      const decoded = Buffer.from(encoded.slice(7), 'base64url').toString('utf8');
      if (!decoded.includes('/recovery')) continue;
      client.cookies.set(name, `base64-${Buffer.from(decoded.replace('/recovery', '')).toString('base64url')}`);
      changed += 1;
    }
    assert.ok(changed > 0, 'O ensaio precisa remover a finalidade de um fluxo real de recuperação.');

    const callback = await client.get(callbackURL);
    if (callback.status === 400) {
      await errorCode(callback, 400, 'callback_invalid');
      await errorCode(await client.get('/api/auth/session'), 401);
      return;
    }
    expectStatus(callback, 303);
    const sessionResponse = await client.get('/api/auth/session');
    expectStatus(sessionResponse, 200);
    const session = await sessionResponse.json();
    assert.equal(session.recovery, true,
      'Alterar metadados do cookie PKCE não pode transformar recuperação em acesso comum.');
    await errorCode(await client.get(`/api/lojas/${store.id}`), 403, 'recovery_required');
    await errorCode(await client.get('/api/admin/session'), 403, 'recovery_required');
  });

test('callback de recuperação rejeita contexto de finalidade ausente', { timeout: 45_000 }, async t => {
  const { client, link } = await recoveryFixture(t);
  const callbackURL = await callbackBeforeExchange(client, link);
  const cookie = verifierCookie(client, callbackURL);
  client.cookies.delete(`${cookie.name}-context`);
  await expectRejectedContext(client, callbackURL);
});

test('callback de recuperação rejeita contexto assinado adulterado', { timeout: 45_000 }, async t => {
  const { client, link } = await recoveryFixture(t);
  const callbackURL = await callbackBeforeExchange(client, link);
  const cookie = verifierCookie(client, callbackURL);
  const contextName = `${cookie.name}-context`;
  const context = client.cookies.get(contextName) ?? 'contexto-nao-autenticado';
  const offset = Math.floor(context.length / 2);
  const replacement = context[offset] === 'A' ? 'B' : 'A';
  client.cookies.set(contextName, `${context.slice(0, offset)}${replacement}${context.slice(offset + 1)}`);
  await expectRejectedContext(client, callbackURL);
});

test('contexto legítimo de cadastro não pode ser transplantado para outro verificador de recuperação',
  { timeout: 45_000 }, async t => {
    const { fixture, client, link } = await recoveryFixture(t);
    const callbackURL = await callbackBeforeExchange(client, link);
    const recoveryCookie = verifierCookie(client, callbackURL);
    const signupClient = fixture.client();
    const email = fixture.newEmail();
    fixture.trackEmail(email);
    expectStatus(await signupClient.post('/api/auth/signup', {
      email, password: `Cadastro!${randomUUID()}`, returnTo: '/conta',
    }), 202);
    const signupCookie = verifierCookie(signupClient);
    const signupContext = signupClient.cookies.get(`${signupCookie.name}-context`);
    assert.ok(signupContext, 'O cadastro precisa emitir seu próprio contexto autenticado para provar o transplante.');
    client.cookies.set(`${recoveryCookie.name}-context`, signupContext);
    await expectRejectedContext(client, callbackURL);
  });

test('reusar challenge de cadastro no recover público não muda a finalidade autenticada pelo provedor',
  { timeout: 45_000 }, async t => {
    const fixture = await createFixture(t);
    const user = await fixture.login(await fixture.createUser());
    const client = fixture.client();
    const email = fixture.newEmail();
    fixture.trackEmail(email);
    expectStatus(await client.post('/api/auth/signup', {
      email, password: `Cadastro!${randomUUID()}`,
    }), 202);
    const cookie = verifierCookie(client);
    const encoded = decodeURIComponent(cookie.value);
    assert.ok(encoded.startsWith('base64-'));
    const verifier = JSON.parse(Buffer.from(encoded.slice(7), 'base64url').toString('utf8'));
    assert.equal(typeof verifier, 'string');
    const provider = new URL('/auth/v1/recover', fixture.environment.supabaseURL);
    provider.searchParams.set('redirect_to', `${fixture.environment.origin}/api/auth/callback`);
    const recovery = await fetch(provider, {
      method: 'POST', headers: { apikey: fixture.environment.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 's256' }),
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(recovery.status, 200, 'A prova exige um código de recuperação real para o mesmo challenge.');
    const callbackURL = await callbackBeforeExchange(client, await confirmationLink(fixture.environment, user.email));
    await expectRejectedContext(client, callbackURL);
  });
