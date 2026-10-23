import { createHmac, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { relationshipFixture } from '../relationship/helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';
import { totp } from '../helpers/totp.mjs';
export { closeRuntime, deliver } from '../relationship/helpers.mjs';

export async function adminFixture(t) {
  const f = await relationshipFixture(t);
  async function grant(person) {
    const client = await f.database.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client.query('SELECT id,"suspendedAt" FROM app."Profile" WHERE id=$1 FOR UPDATE', [person.id]);
      const result = await client.query(`INSERT INTO app."AdminGrant" ("profileId")
        SELECT id FROM app."Profile" WHERE id=$1 AND "suspendedAt" IS NULL
        ON CONFLICT ("profileId") DO UPDATE SET "revokedAt"=NULL RETURNING "profileId"`, [person.id]);
      assert.equal(result.rowCount, 1, 'Provisionamento exige perfil atual livre sob lock.');
      await client.query('COMMIT'); return person;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function mfa(person) {
    const enrolled = await person.client.post('/api/auth/mfa', { action: 'enroll' });
    expectStatus(enrolled, 200); const factor = await enrolled.json();
    const challenged = await person.client.post('/api/auth/mfa', { action: 'challenge', factorId: factor.factorId });
    expectStatus(challenged, 200); const { challengeId } = await challenged.json();
    const confirmed = await person.client.post('/api/auth/mfa', { action: 'verify', factorId: factor.factorId,
      challengeId, code: totp(factor.secret) });
    expectStatus(confirmed, 200); return person;
  }
  const admin = await f.user(); await grant(admin); await mfa(admin);
  const privateMarker = `Conteúdo privado fictício ${randomUUID()}`;
  const targetPath = target => `/api/admin/${target.type === 'ACCOUNT' ? 'contas' : 'lojas'}/${target.id}`;
  async function adminRead(path, body, person = admin) {
    const response = body === undefined ? await person.client.get(path) : await person.client.post(path, body);
    expectStatus(response, 200); return response.json();
  }
  async function action(target, kind, extra = {}, person = admin) {
    const current = await adminRead(targetPath(target), undefined, person);
    const request = { operationId: randomUUID(), target, action: kind, expectedVersion: current.version,
      reason: 'Ajuste administrativo fictício de integração.', ...extra };
    const response = await person.client.post('/api/admin/acoes', request);
    expectStatus(response, 200); return { ...(await response.json()), request };
  }
  async function resetAdminLimits(...people) {
    const keys = (people.length ? people : [admin]).flatMap(person => ['read', 'write'].map(kind =>
      createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET).update('meumimo:t13:admin-rate:v1\0')
        .update(kind).update('\0').update(person.id).digest('hex')));
    for (const key of keys) f.trackRateKey(key);
    await f.database.query('DELETE FROM app."AuthRateBucket" WHERE key=ANY($1::text[])', [keys]);
  }
  // A limpeza registra as chaves mesmo quando o teste nunca precisa zerar a cota.
  await resetAdminLimits();
  return { ...f, admin, target: f.ana, privateMarker, grant, mfa, targetPath, adminRead, action, resetAdminLimits };
}
