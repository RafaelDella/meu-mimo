import assert from 'node:assert/strict';
import { expectStatus, errorCode } from '../../tests/integration/helpers/http-client.mjs';
import { loadFixture, withDatabases, saveFixture, session, login, rebaseSourceURL, json, assertFixtureOwnership } from './recovery-fixture-context.mjs';
import { assertFinancial, assertPrivateViews, assertRawOriginals, assertMedia, denyMedia, base } from './recovery-fixture-evidence.mjs';
import { readJournal, applyJournal } from './journal.mjs';
import { verifyRecoveryMfa } from './recovery-fixture-mfa.mjs';

async function oldAuthContexts(context, state) {
  const { environment, database, authDatabase } = context;
  const ids = Object.values(state.sessions);
  const old = (await database.query('SELECT id,"revokedAt" FROM app."AuthSession" WHERE id=ANY($1::uuid[]) ORDER BY id', [ids])).rows;
  assert.equal(old.length, 3); assert.ok(old.every(row => row.revokedAt !== null));
  assert.equal((await authDatabase.query('SELECT 1 FROM auth.sessions WHERE id=ANY($1::uuid[])', [ids])).rowCount, 0);
  assert.equal((await authDatabase.query('SELECT 1 FROM auth.flow_state WHERE id=$1 OR auth_code=$2', [state.pkce.flowStateId, state.pkce.code])).rowCount, 0);
  assert.equal((await authDatabase.query('SELECT 1 FROM auth.users WHERE id=$1', [state.people.ana.id])).rowCount, 0);
  const grant = (await database.query('SELECT "revokedAt" FROM app."AdminGrant" WHERE "profileId"=$1', [state.people.owner.id])).rows[0];
  assert.ok(grant?.revokedAt, 'O grant copiado deve exigir nova concessão operacional.');
  for (const person of Object.values(state.people)) {
    expectStatus(await session(environment, person.cookies).get('/api/auth/session'), 401);
  }
  const pending = session(environment, state.pkce.cookies);
  const callback = rebaseSourceURL(environment, state.pkce.callback);
  assert.equal(new URL(callback, environment.origin).pathname, '/api/auth/callback');
  await errorCode(await pending.get(callback), 400, 'callback_invalid');
  expectStatus(await pending.get('/api/auth/session'), 401);
  // This second proof reaches Auth directly, independently of the rotated application context secret.
  const pkce = await fetch(`${environment.supabaseURL}/auth/v1/token?grant_type=pkce`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { apikey: environment.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_code: state.pkce.code, code_verifier: state.pkce.verifier }),
  });
  assert.ok([400, 404].includes(pkce.status), 'O código PKCE anterior não pode gerar sessão na cópia.');
  const rejected = await pkce.json(); assert.ok(!rejected.access_token && !rejected.refresh_token);
  assert.equal(rejected.error_code ?? rejected.code, 'flow_state_not_found');
  const before = session(environment, state.people.owner.cookies).storedSession();
  assert.ok(before.refresh_token);
  const refresh = await fetch(`${environment.supabaseURL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { apikey: environment.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: before.refresh_token }),
  });
  assert.ok([400, 401].includes(refresh.status));
  const refreshed = await refresh.json(); assert.ok(!refreshed.access_token && !refreshed.refresh_token);
  assert.ok(['refresh_token_not_found', 'session_not_found'].includes(refreshed.error_code ?? refreshed.code));
}

export async function verifyRestore() {
  const state = await loadFixture(['ERASED', 'RESTORE_VERIFIED']);
  const result = await withDatabases('restore', async context => {
    const { environment, database, authDatabase } = context;
    await assertFixtureOwnership(context, state);
    await oldAuthContexts(context, state);
    const entries = (await readJournal()).entries.filter(entry => entry.protocolId === state.protocolId);
    assert.equal(entries.length, 1);
    const rightsCount = async () => (await database.query(`SELECT
      (SELECT count(*)::int FROM app."DataRightsEvent" WHERE "protocolId"=$1) AS events,
      (SELECT count(*)::int FROM app."DataSuppression" WHERE "protocolId"=$1) AS suppressions`, [state.protocolId])).rows[0];
    const beforeReplay = await rightsCount(); const replay = await database.connect();
    try {
      for (let count = 0; count < 2; count++) assert.deepEqual(await applyJournal({ client: replay,
        database: environment.resources.database, sourceDatabase: 'meumimo_t14', entries, mode: 'restore' }), { applied: 1, pending: 1 });
    } finally { replay.release(); }
    assert.deepEqual(await rightsCount(), beforeReplay); await assertFinancial(database, state);
    await login(environment, state.people.ana, 401);
    const owner = await login(environment, state.people.owner);
    assert.ok(state.codeInvitationId, 'A prova exige um convite por código copiado.');
    const copiedInvitation = (await database.query('SELECT kind,"revokedAt","useCount" FROM app."Invitation" WHERE id=$1', [state.codeInvitationId])).rows[0];
    assert.equal(copiedInvitation?.kind, 'CODE');
    assert.ok(copiedInvitation.revokedAt, 'A cópia deve revogar explicitamente os códigos derivados da chave anterior.');
    assert.equal(copiedInvitation.useCount, 2);
    assert.equal(state.financial.fingerprints.InvitationUse.count, 2);
    assert.equal((await database.query('SELECT count(*)::int n FROM app."InvitationUse" WHERE "invitationId"=$1',
      [state.codeInvitationId])).rows[0].n, 2);
    const mfaCounts = await verifyRecoveryMfa(context, state, owner);
    const bia = await login(environment, state.people.bia);
    await errorCode(await owner.get('/api/admin/session'), 403, 'admin_forbidden');
    await assertPrivateViews(state, owner, bia, { suppressed: true });
    await assertRawOriginals(database, state, { suppressed: true });
    await denyMedia(owner, state, 'ana');
    await denyMedia(owner, state, 'ana', state.erasureMedia);
    await assertMedia(bia, state, 'bia');
    await assertMedia(owner, state, 'bia');
    const ticket = await json(owner, `${base(state)}/tickets/${state.ticketId}`);
    assert.equal(ticket.id, state.ticketId); assert.equal(ticket.snapshot.cost, 10);
    const financialRows = await assertFinancial(database, state);
    const protocol = (await database.query(`SELECT id FROM app."DataRightsProtocol" WHERE id=$1 AND "subjectProfileId"=$2
      AND "operatorProfileId"=$3 AND kind='ERASURE'`, [state.protocolId, state.people.ana.id, state.people.owner.id])).rows;
    assert.equal(protocol.length, 1);
    assert.equal((await database.query(`SELECT 1 FROM app."DataSuppression" WHERE "subjectProfileId"=ANY($1::uuid[])`,
      [[state.people.owner.id, state.people.bia.id]])).rowCount, 0);
    const identities = (await authDatabase.query('SELECT id FROM auth.users WHERE id=ANY($1::uuid[])',
      [[state.people.owner.id, state.people.bia.id]])).rows;
    assert.equal(identities.length, 2);
    // Fresh authentication may create only new session/audit rows, never outbox/ledger mutations.
    await assertFinancial(database, state);
    return { code: 'RECOVERY_APPLICATION_VERIFIED', counts: { oldSessionsRevoked: 3, oldPkceRejected: 1,
      oldRefreshRejected: 1, suppressedSubjects: 1, journalReplays: 2, preservedIdentities: 2, preservedPhotos: 1, revokedCodeInvitations: 1,
      preservedInvitationUses: 2, financialRows, ...mfaCounts } };
  });
  state.phase = 'RESTORE_VERIFIED'; state.restoreVerifiedAt = new Date().toISOString(); await saveFixture(state); return result;
}
