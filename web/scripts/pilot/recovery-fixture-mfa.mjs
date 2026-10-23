import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { expectStatus } from '../../tests/integration/helpers/http-client.mjs';
import { totp } from '../../tests/integration/helpers/totp.mjs';
import { json, saveFixture, session, uuid } from './recovery-fixture-context.mjs';

const stepAt = now => Math.floor(now / 30_000);

function capturedMfa(state) {
  const value = state.mfa;
  assert.ok(value && value.ownerProfileId === state.people.owner.id, 'O fator exige a autoria da fixture.');
  for (const key of ['factorId', 'pendingChallengeId', 'sessionId']) assert.ok(uuid(value[key]));
  assert.match(value.secret, /^[A-Z2-7]+=*$/i);
  assert.ok(Number.isSafeInteger(value.lastVerifiedStep) && value.lastVerifiedStep > 0);
  assert.equal(value.sessionId, state.sessions.owner);
  return value;
}

async function challenge(client, factorId) {
  const response = await client.post('/api/auth/mfa', { action: 'challenge', factorId });
  expectStatus(response, 200);
  const value = await response.json(); assert.ok(uuid(value.challengeId)); return value.challengeId;
}

async function verify(client, factorId, challengeId, secret, now) {
  const response = await client.post('/api/auth/mfa', { action: 'verify', factorId, challengeId, code: totp(secret, now) });
  expectStatus(response, 200); assert.deepEqual(await response.json(), { assuranceLevel: 'aal2' });
}

export async function prepareRecoveryMfa(client, ownerProfileId) {
  const initial = await json(client, '/api/auth/session');
  assert.equal(initial.userId, ownerProfileId); assert.equal(initial.assuranceLevel, 'aal1');
  const enrolled = await client.post('/api/auth/mfa', { action: 'enroll' }); expectStatus(enrolled, 200);
  const factor = await enrolled.json(); assert.ok(uuid(factor.factorId)); assert.match(factor.secret, /^[A-Z2-7]+=*$/i);
  const challengeId = await challenge(client, factor.factorId); const now = Date.now();
  await verify(client, factor.factorId, challengeId, factor.secret, now);
  const identity = await json(client, '/api/auth/session');
  assert.equal(identity.userId, ownerProfileId); assert.equal(identity.assuranceLevel, 'aal2'); assert.ok(uuid(identity.sessionId));
  const pendingChallengeId = await challenge(client, factor.factorId); assert.notEqual(pendingChallengeId, challengeId);
  // Somente saveFixture persiste este retorno; segredo, fator e desafio não entram nos relatórios.
  return { ownerProfileId, factorId: factor.factorId, secret: factor.secret, sessionId: identity.sessionId,
    pendingChallengeId, verifiedAt: new Date(now).toISOString(), lastVerifiedStep: stepAt(now) };
}

export async function assertRecoveryMfa(authDatabase, state, { restored = false } = {}) {
  const value = capturedMfa(state);
  const factors = (await authDatabase.query(`SELECT id,factor_type,status FROM auth.mfa_factors
    WHERE user_id=$1 ORDER BY id`, [state.people.owner.id])).rows;
  assert.deepEqual(factors, [{ id: value.factorId, factor_type: 'totp', status: 'verified' }],
    'A recuperação deve conservar somente o fator original verificado, sem reenrolamento.');
  const pending = (await authDatabase.query('SELECT id,factor_id,verified_at FROM auth.mfa_challenges WHERE id=$1',
    [value.pendingChallengeId])).rows;
  if (restored) assert.equal(pending.length, 0, 'O desafio anterior deve ser eliminado antes de abrir Auth.');
  else assert.deepEqual(pending, [{ id: value.pendingChallengeId, factor_id: value.factorId, verified_at: null }]);
}

async function authRequest(environment, target, token, body) {
  return fetch(`${environment.supabaseURL}/auth/v1${target}`, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { apikey: environment.publishableKey, Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function verifyRecoveryMfa(context, state, client) {
  const value = capturedMfa(state); const { environment, authDatabase } = context;
  await assertRecoveryMfa(authDatabase, state, { restored: true });
  const identity = await json(client, '/api/auth/session');
  assert.equal(identity.userId, value.ownerProfileId); assert.equal(identity.assuranceLevel, 'aal1');
  assert.notEqual(identity.sessionId, value.sessionId);
  const listed = await json(client, '/api/auth/mfa');
  assert.deepEqual(listed.factors.map(factor => factor.id), [value.factorId]);
  const old = session(environment, state.people.owner.cookies).storedSession();
  assert.ok(typeof old.access_token === 'string');
  const rejectedSession = await authRequest(environment, '/user', old.access_token);
  assert.ok([401, 403].includes(rejectedSession.status), 'O token AAL2 anterior não deve autenticar no Auth restaurado.');
  const rejectedIdentity = await rejectedSession.json();
  assert.ok(['bad_jwt', 'session_not_found'].includes(rejectedIdentity.error_code ?? rejectedIdentity.code));
  assert.ok(!rejectedIdentity.id && !rejectedIdentity.access_token && !rejectedIdentity.refresh_token);

  // Um replay da fase também usa um intervalo TOTP novo, sem relaxar a proteção do Auth.
  const wait = (value.lastVerifiedStep + 1) * 30_000 - Date.now();
  assert.ok(wait <= 30_000, 'O relógio do ensaio recuou desde a verificação do fator.');
  if (wait > 0) await delay(wait + 50);
  const now = Date.now(); assert.ok(stepAt(now) > value.lastVerifiedStep);
  const token = client.storedSession().access_token; assert.ok(typeof token === 'string');
  const rejectedChallenge = await authRequest(environment, `/factors/${value.factorId}/verify`, token,
    { challenge_id: value.pendingChallengeId, code: totp(value.secret, now) });
  assert.equal(rejectedChallenge.status, 422, 'O desafio anterior não pode elevar uma sessão nova.');
  const rejected = await rejectedChallenge.json(); assert.ok(!rejected.access_token && !rejected.refresh_token);
  assert.equal(rejected.error_code ?? rejected.code, 'mfa_factor_not_found');
  assert.equal((await json(client, '/api/auth/session')).assuranceLevel, 'aal1');

  const challengeId = await challenge(client, value.factorId); assert.notEqual(challengeId, value.pendingChallengeId);
  const verifiedAt = Date.now(); await verify(client, value.factorId, challengeId, value.secret, verifiedAt);
  const confirmed = await json(client, '/api/auth/session');
  assert.equal(confirmed.userId, value.ownerProfileId); assert.equal(confirmed.assuranceLevel, 'aal2');
  assert.notEqual(confirmed.sessionId, value.sessionId);
  value.lastVerifiedStep = stepAt(verifiedAt); value.restoredVerifiedAt = new Date(verifiedAt).toISOString();
  await saveFixture(state);
  await assertRecoveryMfa(authDatabase, state, { restored: true });
  return { preservedMfaFactors: 1, oldMfaChallengesRejected: 1, oldMfaSessionsRejected: 1, newMfaAal2Sessions: 1 };
}
