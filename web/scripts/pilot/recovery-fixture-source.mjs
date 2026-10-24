import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { relationshipFixture } from '../../tests/integration/relationship/helpers.mjs';
import { createFixture } from '../../tests/integration/helpers/fixtures.mjs';
import { expectStatus } from '../../tests/integration/helpers/http-client.mjs';
import { openRightsProtocol, applyRights } from './rights.mjs';
import { sourceEnvironment, saveFixture, loadFixture, withDatabases, session, json, pendingRecovery,
  disconnectRuntime, uuid, assertFixtureOwnership, fixturePath } from './recovery-fixture-context.mjs';
import { custodyRoot, readPrivateJson, writePrivateJson, withMaintenanceLock } from './custody.mjs';
import { base, financialSnapshot, assertFinancial, snapshotMedia, assertMedia, denyMedia, assertPrivateViews,
  assertRawOriginals } from './recovery-fixture-evidence.mjs';
import { prepareRecoveryMfa, assertRecoveryMfa } from './recovery-fixture-mfa.mjs';

async function hooksInReverse(hooks) {
  const results = [];
  for (const hook of [...hooks].reverse()) results.push(...await Promise.allSettled([hook()]));
  const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, 'Há limpeza da fixture pendente.');
}

async function photoRecord(f, state, name) {
  const person = f[name];
  const activity = await f.create({ name: `Recuperação sintética ${name} ${randomUUID()}`, points: 15, approvalMode: 'MANUAL' });
  const draft = await f.prepare(activity, person); const photo = await f.photo(draft, person);
  const queued = (await f.database.query(`SELECT id FROM app."MediaAsset" WHERE "removedAt" IS NULL AND "uploadedBytes"="byteLength"
    AND ((state='QUEUED' AND "availableAt"<=clock_timestamp()) OR (state='PROCESSING' AND "leaseUntil"<=clock_timestamp()))`)).rows;
  assert.ok(queued.length === 1 && queued[0].id === photo.asset.id, 'O processamento manual exige fila limitada à foto própria.');
  assert.deepEqual(await photo.process(), { processed: 1, failed: 0 });
  const record = await f.submit(draft, person, { caption: state.text[`${name}Caption`], evidenceAssetId: photo.asset.id });
  assert.ok(uuid(record.conversation?.id));
  return { id: record.id, activityId: activity.id, collectionId: draft.collectionId,
    assetId: photo.asset.id, conversationId: record.conversation.id };
}

export async function prepareFixture() {
  const environment = sourceEnvironment(); const hooks = [];
  const state = { formatVersion: 1, kind: 't14-recovery-fixture', phase: 'PREPARING', createdAt: new Date().toISOString() };
  await withMaintenanceLock(async () => {
    let previous;
    try { previous = await readPrivateJson(fixturePath); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous === undefined) { await saveFixture(state, { exclusive: true }); return; }
    const verified = await loadFixture(['CLEANED', 'FAILED_PREPARE_CLEANED']);
    assert.deepEqual(verified, previous, 'O estado anterior mudou durante a conferência.');
    assert.ok(Number.isFinite(Date.parse(previous.createdAt)));
    for (const name of ['owner', 'ana', 'bia']) {
      assert.equal(previous.memberships[name].storeId, previous.store.id);
      assert.equal(previous.memberships[name].profileId, previous.people[name].id);
      assert.equal(previous.memberships[name].role, name === 'owner' ? 'MERCHANT' : 'PARTICIPANT');
    }
    const profileIds = ['owner', 'ana', 'bia'].map(name => previous.people[name].id);
    await withDatabases('integration', async ({ database, authDatabase }) => {
      assert.equal((await authDatabase.query('SELECT 1 FROM auth.users WHERE id=ANY($1::uuid[])', [profileIds])).rowCount, 0,
        'Identidade anterior ainda existe na fonte.');
      assert.equal((await database.query('SELECT 1 FROM app."Profile" WHERE id=ANY($1::uuid[])', [profileIds])).rowCount, 0,
        'Perfil anterior ainda existe na fonte.');
      assert.equal((await database.query('SELECT 1 FROM app."Store" WHERE id=$1', [previous.store.id])).rowCount, 0,
        'Loja anterior ainda existe na fonte.');
    });
    const archived = path.join(custodyRoot, 'reports', `recovery-fixture-history-${randomUUID()}.json`);
    await writePrivateJson(archived, previous, { exclusive: true });
    assert.deepEqual(await readPrivateJson(fixturePath), previous, 'O estado anterior mudou antes do reuso.');
    await saveFixture(state);
  });
  let f; let cleaned = false; let cleanupAttempted = false;
  try {
    f = await relationshipFixture({ after: hook => hooks.push(hook) });
    const owner = await f.auth.auth.admin.getUserById(f.owner.id); assert.equal(owner.error, null);
    state.fixtureRun = owner.data.user?.app_metadata?.fixture_run; assert.ok(uuid(state.fixtureRun));
    state.store = f.store; state.people = {};
    const codeResponse = await f.owner.client.post(`${base(state)}/convites`, {
      operationId: randomUUID(), kind: 'CODE', expiration: { kind: 'NEVER' }, maxUses: null,
    });
    expectStatus(codeResponse, 201);
    const codeInvitation = await codeResponse.json();
    state.codeInvitationId = codeInvitation.id;
    // A base histórica cria vínculos diretamente. Nesta prova, substituímos
    // apenas esses dois vínculos sintéticos ainda vazios por ingressos reais.
    for (const [name, membership] of [['ana', f.participation], ['bia', f.otherParticipation]]) {
      const removed = await f.database.query(`DELETE FROM app."Membership"
        WHERE id=$1 AND "storeId"=$2 AND "profileId"=$3 AND role='PARTICIPANT' RETURNING id`,
      [membership.id, f.store.id, f[name].id]);
      assert.equal(removed.rowCount, 1);
      const accepted = await f[name].client.post('/api/convites/aceitar-codigo', { code: codeInvitation.code });
      expectStatus(accepted, 200);
      const joined = await accepted.json();
      assert.equal(joined.storeId, f.store.id);
      assert.equal(joined.role, 'PARTICIPANT');
      Object.assign(membership, { id: joined.membershipId });
    }
    assert.equal((await f.database.query('SELECT count(*)::int n FROM app."InvitationUse" WHERE "invitationId"=$1',
      [codeInvitation.id])).rows[0].n, 2);
    state.memberships = { owner: f.merchant, ana: f.participation, bia: f.otherParticipation };
    for (const name of ['owner', 'ana', 'bia']) {
      const person = f[name]; state.people[name] = { id: person.id, email: person.email, password: person.password, cookies: [...person.client.cookies] };
    }
    await saveFixture(state);
    const marker = randomUUID();
    state.text = { anaCaption: `Legenda própria de Ana ${marker}`, biaCaption: `Legenda preservada de Bia ${marker}`,
      anaComment: `Comentário próprio de Ana ${marker}`, ownerComment: `Comentário preservado do lojista ${marker}`,
      biaComment: `Comentário preservado de Bia ${marker}`, note: `Bilhete privado do lojista para Ana ${marker}` };
    state.records = {};
    state.records.ana = await photoRecord(f, state, 'ana');
    await f.decide({ id: state.records.ana.id }, 'APPROVE');
    const reward = await f.createReward({ cost: 10, stock: 2 }); const ticket = await f.redeem(reward);
    state.rewardId = reward.id; state.ticketId = ticket.id;
    state.records.bia = await photoRecord(f, state, 'bia');
    await f.decide({ id: state.records.bia.id }, 'APPROVE');
    state.comments = {};
    state.comments.ana = (await f.comment({ id: state.records.ana.conversationId }, state.text.anaComment, f.ana)).id;
    state.comments.owner = (await f.comment({ id: state.records.ana.conversationId }, state.text.ownerComment, f.owner)).id;
    state.comments.bia = (await f.comment({ id: state.records.bia.conversationId }, state.text.biaComment, f.bia)).id;
    state.noteId = (await f.send(state.text.note)).applied.id;
    await f.database.query('INSERT INTO app."AdminGrant"("profileId") VALUES($1)', [f.owner.id]);
    state.mfa = await prepareRecoveryMfa(f.owner.client, f.owner.id);
    state.sessions = {};
    for (const name of ['owner', 'ana', 'bia']) {
      const identity = await json(f[name].client, '/api/auth/session'); assert.ok(uuid(identity.sessionId)); state.sessions[name] = identity.sessionId;
      state.people[name].cookies = [...f[name].client.cookies];
    }
    assert.equal(state.sessions.owner, state.mfa.sessionId); await saveFixture(state);
    for (const name of ['ana', 'bia']) state.records[name].media = await snapshotMedia(f.owner.client, state, name);
    state.financial = await financialSnapshot(f.database, state); await assertFinancial(f.database, state);
    assert.equal(state.financial.fingerprints.InvitationUse.count, 2);
    await assertRawOriginals(f.database, state); await assertPrivateViews(state, f.owner.client, f.bia.client);
    state.pkce = await withDatabases('integration', async context => {
      await assertFixtureOwnership(context, state);
      await assertRecoveryMfa(context.authDatabase, state);
      return pendingRecovery(environment, state.people.owner, context.authDatabase);
    });
    state.phase = 'PREPARED'; state.preparedAt = new Date().toISOString(); await saveFixture(state);
    return { code: 'RECOVERY_FIXTURE_PREPARED', counts: { users: 3, stores: 1, photos: 2, ledger: 3, tickets: 1,
      pendingPkce: 1, verifiedMfaFactors: 1, pendingMfaChallenges: 1, codeInvitations: 1 } };
  } catch (error) {
    let cleanupFailure;
    try { cleanupAttempted = true; await hooksInReverse(hooks); cleaned = true; }
    catch (failure) { cleanupFailure = failure; }
    finally {
      state.phase = cleaned ? 'FAILED_PREPARE_CLEANED' : 'FAILED_PREPARE_CLEANUP_PENDING';
      await saveFixture(state);
    }
    if (cleanupFailure) throw new AggregateError([error, cleanupFailure], 'Preparação e limpeza da fixture exigem conferência.');
    throw error;
  } finally { if (f && !cleanupAttempted) await f.database.end(); await disconnectRuntime(); }
}

export async function sourceAfter() {
  sourceEnvironment(); const state = await loadFixture(['PREPARED', 'SOURCE_VERIFIED']);
  const result = await withDatabases('integration', async context => {
    await assertFixtureOwnership(context, state);
    const owner = session(context.environment, state.people.owner.cookies);
    const ana = session(context.environment, state.people.ana.cookies);
    const bia = session(context.environment, state.people.bia.cookies);
    for (const client of [owner, ana, bia]) await json(client, '/api/auth/session');
    const ownerIdentity = await json(owner, '/api/auth/session');
    assert.equal(ownerIdentity.sessionId, state.mfa.sessionId); assert.equal(ownerIdentity.assuranceLevel, 'aal2');
    await assertRecoveryMfa(context.authDatabase, state);
    await assertPrivateViews(state, owner, bia); await assertRawOriginals(context.database, state);
    const code = (await context.database.query('SELECT "revokedAt","useCount" FROM app."Invitation" WHERE id=$1', [state.codeInvitationId])).rows[0];
    assert.equal(code.revokedAt, null); assert.equal(code.useCount, 2);
    await assertMedia(owner, state, 'ana'); await assertMedia(bia, state, 'bia');
    const rows = await assertFinancial(context.database, state);
    assert.equal((await context.database.query('SELECT 1 FROM app."AdminGrant" WHERE "profileId"=$1 AND "revokedAt" IS NULL', [state.people.owner.id])).rowCount, 1);
    assert.equal((await context.authDatabase.query('SELECT 1 FROM auth.flow_state WHERE id=$1 AND auth_code=$2 AND user_id=$3',
      [state.pkce.flowStateId, state.pkce.code, state.people.owner.id])).rowCount, 1);
    return { code: 'RECOVERY_SOURCE_RESTART_VERIFIED', counts: { users: 3, photos: 2, financialRows: rows,
      pendingPkce: 1, verifiedMfaFactors: 1, pendingMfaChallenges: 1 } };
  });
  state.phase = 'SOURCE_VERIFIED'; state.sourceVerifiedAt = new Date().toISOString(); await saveFixture(state); return result;
}

export async function eraseFixture() {
  sourceEnvironment(); const state = await loadFixture(['SOURCE_VERIFIED', 'ERASED']);
  return withDatabases('integration', async context => {
    await assertFixtureOwnership(context, state); await assertFinancial(context.database, state);
    const owner = session(context.environment, state.people.owner.cookies);
    if (state.phase !== 'ERASED') {
      state.erasureMedia = await snapshotMedia(owner, state, 'ana');
      state.erasureInput ??= { operationId: randomUUID(), subjectProfileId: state.people.ana.id,
        operatorProfileId: state.people.owner.id, kind: 'ERASURE', verifiedAt: new Date(Date.now() - 1000).toISOString() };
      await saveFixture(state);
    }
    const registered = await openRightsProtocol(state.erasureInput, { mode: 'integration' });
    assert.equal(registered.protocolId, state.erasureInput.operationId);
    const report = await applyRights(registered.protocolId, { mode: 'integration' }); assert.equal(report.status, 'PARTIAL');
    state.protocolId = registered.protocolId; state.phase = 'ERASED'; state.erasedAt = new Date().toISOString(); await saveFixture(state);
    expectStatus(await session(context.environment, state.people.ana.cookies).get('/api/auth/session'), 401);
    expectStatus(await session(context.environment).post('/api/auth/login', { email: state.people.ana.email, password: state.people.ana.password }), 401);
    await denyMedia(owner, state, 'ana', state.erasureMedia);
    const bia = session(context.environment, state.people.bia.cookies);
    await assertPrivateViews(state, owner, bia, { suppressed: true }); await assertRawOriginals(context.database, state, { suppressed: true });
    await assertMedia(bia, state, 'bia'); const rows = await assertFinancial(context.database, state);
    assert.equal((await context.authDatabase.query('SELECT 1 FROM auth.users WHERE id=$1', [state.people.ana.id])).rowCount, 0);
    return { code: 'RECOVERY_POST_CUT_ERASURE_VERIFIED', counts: { subjects: 1, suppressions: 2, financialRows: rows, preservedPhotos: 1 } };
  });
}

export async function cleanupFixture() {
  sourceEnvironment({ select: true });
  const state = await loadFixture(['PREPARED', 'SOURCE_VERIFIED', 'ERASED', 'RESTORE_VERIFIED', 'WEB_RUNNING', 'WEB_VERIFIED', 'FAILED_PREPARE_CLEANUP_PENDING']);
  await withDatabases('integration', async context => {
    await assertFixtureOwnership(context, state);
    if (state.pkce) await context.authDatabase.query('DELETE FROM auth.flow_state WHERE id=$1 AND user_id=$2 AND auth_code=$3',
      [state.pkce.flowStateId, state.people.owner.id, state.pkce.code]);
  });
  const hooks = []; const f = await createFixture({ after: hook => hooks.push(hook) });
  for (const person of Object.values(state.people)) { f.trackUser(person.id); f.trackEmail(person.email); }
  f.trackStore(state.store.id);
  if (state.erasureInput) f.trackAuthRemoval(state.people.ana.id);
  try {
    await hooksInReverse(hooks); state.phase = 'CLEANED'; state.cleanedAt = new Date().toISOString(); await saveFixture(state);
    return { code: 'RECOVERY_SOURCE_FIXTURE_CLEANED', counts: { users: 3, stores: 1 } };
  } finally { await disconnectRuntime(); }
}
