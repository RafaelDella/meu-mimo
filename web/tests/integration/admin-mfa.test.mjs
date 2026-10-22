import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './helpers/fixtures.mjs';
import { errorCode, expectStatus } from './helpers/http-client.mjs';
import { totp } from './helpers/totp.mjs';

test('admin exige concessão separada e TOTP, sem bypass para loja ou concessão revogada', { timeout: 45_000 }, async t => {
  const fixture = await createFixture(t);
  const admin = await fixture.login(await fixture.createUser());
  const merchant = await fixture.login(await fixture.createUser());
  const store = await fixture.createStore(merchant);
  await fixture.addMembership(store, merchant, 'MERCHANT');
  await errorCode(await admin.client.get('/api/admin/session'), 403, 'admin_forbidden');
  await fixture.database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [admin.id]);
  await errorCode(await admin.client.get('/api/admin/session'), 403, 'mfa_required');
  const enrollment = await admin.client.post('/api/auth/mfa', { action: 'enroll' });
  expectStatus(enrollment, 200);
  const factor = await enrollment.json();
  assert.equal(typeof factor.factorId, 'string');
  assert.ok(typeof factor.secret === 'string' && factor.secret.length > 0);
  assert.ok(typeof factor.qrCode === 'string' && factor.qrCode.length > 0);
  const challenge = await admin.client.post('/api/auth/mfa', { action: 'challenge', factorId: factor.factorId });
  expectStatus(challenge, 200);
  const { challengeId } = await challenge.json();
  const verified = await admin.client.post('/api/auth/mfa', {
    action: 'verify', factorId: factor.factorId, challengeId, code: totp(factor.secret),
  });
  expectStatus(verified, 200);
  assert.deepEqual(await verified.json(), { assuranceLevel: 'aal2' });
  const session = await admin.client.get('/api/auth/session');
  expectStatus(session, 200);
  assert.equal((await session.json()).assuranceLevel, 'aal2');
  const access = await admin.client.get('/api/admin/session');
  expectStatus(access, 200);
  assert.deepEqual(await access.json(), { actorUserId: admin.id, assuranceLevel: 'aal2' });
  await errorCode(await admin.client.get(`/api/lojas/${store.id}`), 404);
  const factors = await admin.client.get('/api/auth/mfa');
  expectStatus(factors, 200);
  assert.ok((await factors.json()).factors.some(item => item.id === factor.factorId));
  await fixture.database.query('UPDATE app."AdminGrant" SET "revokedAt" = now() WHERE "profileId" = $1', [admin.id]);
  await errorCode(await admin.client.get('/api/admin/session'), 403, 'admin_forbidden');
});
