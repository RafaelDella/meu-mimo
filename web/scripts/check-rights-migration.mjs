import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendRightsEvent, applyDataErasure, assertRightsPreserved, registerRights, rightsEvolutionSnapshot,
  rightsMigrationFixture, rightsTables, suppressRights, withRightsOperator } from './check-rights-migration-helpers.mjs';

/** Privilégios reais e evolução T13→T14 exclusivamente no banco descartável. */
export async function checkRightsMigration(database, runtime, context) {
  const result = await database.query(`SELECT count(*)::int AS total FROM pg_tables
    WHERE schemaname='app' AND tablename=ANY($1::text[])`,
  [['DataRightsProtocol', 'DataRightsEvent', 'DataSuppression']]);
  assert.equal(result.rows[0].total, 3, 'T14 exige protocolo, eventos e supressões persistentes.');
  assert.equal((await database.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='app' AND rowsecurity")).rows[0].n, 41);
  for (const table of rightsTables) assert.equal((await runtime.query(`SELECT * FROM app."${table}"`)).rowCount, 0,
    'Evolução não inventa protocolos ou supressões para dados legados.');
  const flags = (await database.query(`SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls
    FROM pg_roles WHERE rolname='meumimo_rights_operator'`)).rows[0];
  assert.ok(flags && Object.values(flags).every(value => value === false));
  assert.equal((await runtime.query("SELECT pg_has_role(current_user,'meumimo_rights_operator','MEMBER') AS member")).rows[0].member, false);
  await assert.rejects(runtime.query('SET ROLE meumimo_rights_operator'), { code: '42501' });
  for (const inherited of ['meumimo_runtime', 'meumimo_admin_executor']) {
    assert.equal((await database.query('SELECT pg_has_role($1,$2,$3) AS member', ['meumimo_rights_operator', inherited, 'MEMBER'])).rows[0].member, false);
  }
  assert.equal((await database.query("SELECT has_schema_privilege('meumimo_rights_operator','app','CREATE') AS allowed")).rows[0].allowed, false);
  const fn = (await database.query(`SELECT prosecdef,proconfig FROM pg_proc
    WHERE oid='app.apply_data_erasure(uuid)'::regprocedure`)).rows[0];
  assert.equal(fn.prosecdef, false);
  assert.ok(fn.proconfig.some(value => value.replaceAll(' ', '') === 'search_path=pg_catalog,app,pg_temp'));
  for (const table of rightsTables) {
    for (const verb of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      assert.equal((await runtime.query('SELECT has_table_privilege(current_user,$1,$2) AS allowed', [`app."${table}"`, verb])).rows[0].allowed, false);
    }
    for (const sql of [`INSERT INTO app."${table}" DEFAULT VALUES`, `UPDATE app."${table}" SET "createdAt"=now()`, `DELETE FROM app."${table}"`]) {
      await assert.rejects(runtime.query(sql), { code: '42501' });
    }
    for (const role of ['anon', 'authenticated']) {
      await database.query('BEGIN');
      try {
        await database.query(`SET LOCAL ROLE ${role}`);
        await assert.rejects(database.query(`SELECT * FROM app."${table}"`), { code: '42501' });
      } finally { await database.query('ROLLBACK'); }
    }
  }
  await assert.rejects(runtime.query('SELECT app.apply_data_erasure($1)', [randomUUID()]), { code: '42501' });
  for (const role of ['anon', 'authenticated']) {
    await database.query('BEGIN');
    try {
      await database.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(database.query('SELECT app.apply_data_erasure(NULL)'), { code: '42501' });
    } finally { await database.query('ROLLBACK'); }
  }
  const immutable = ['PointsEntry', 'Redemption', 'RedemptionEvent', 'SubmissionReviewEvent', 'AdminAction',
    'SecurityAudit', 'StoreAudit', 'Reward', 'RewardEvent', 'AlbumEvent', 'AlbumItem', 'Comment', 'NoteVersion'];
  for (const table of immutable) {
    for (const verb of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      assert.equal((await database.query('SELECT has_table_privilege($1,$2,$3) AS allowed',
        ['meumimo_rights_operator', `app."${table}"`, verb])).rows[0].allowed, false, `${table}:${verb} não pertence ao procedimento.`);
    }
    await assert.rejects(withRightsOperator(database, () => database.query(`SELECT * FROM app."${table}"`)), { code: '42501' });
    await assert.rejects(withRightsOperator(database, () => database.query(`DELETE FROM app."${table}"`)), { code: '42501' });
  }
  for (const table of ['PointsEntry', 'Redemption', 'RedemptionEvent', 'SubmissionReviewEvent', 'AdminAction', 'SecurityAudit']) {
    await assert.rejects(withRightsOperator(database, () => database.query(`UPDATE app."${table}" SET id=id`)), { code: '42501' });
  }
  const allowedUpdates = { Profile: ['displayName'], AuthSession: ['revokedAt'], AdminGrant: ['revokedAt'],
    MediaCollection: ['id'], MediaAsset: ['state', 'removedAt', 'availableAt', 'leaseToken'] };
  for (const [table, columns] of Object.entries(allowedUpdates)) {
    const actual = (await database.query(`SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped
      AND has_column_privilege('meumimo_rights_operator',attrelid,attname,'UPDATE') ORDER BY attname`, [`app."${table}"`])).rows.map(row => row.attname);
    assert.deepEqual(actual, [...columns].sort(), `UPDATE de ${table} fica limitado às colunas operacionais.`);
  }
  const fixture = await rightsMigrationFixture(database, context);
  for (const options of [{ digest: 'inválido' }, { subjectId: randomUUID() }, { operatorId: randomUUID() },
    { verifiedAt: new Date(Date.now() + 86_400_000) }]) {
    await assert.rejects(withRightsOperator(database, () => registerRights(database, fixture, options)),
      { code: options.subjectId || options.operatorId ? '23503' : '23514' });
  }
  const exported = await withRightsOperator(database, () => registerRights(database, fixture, { kind: 'EXPORT' }));
  await withRightsOperator(database, () => appendRightsEvent(database, exported.id, 2, 'EXPORT_READY', { records: 0, files: 0 }));
  await withRightsOperator(database, () => appendRightsEvent(database, exported.id, 3, 'EXPIRED', { exports: 1 }));
  await assert.rejects(withRightsOperator(database, () => suppressRights(database, exported.id, fixture.subjectId)), { code: '23514' });
  await assert.rejects(withRightsOperator(database, () => applyDataErasure(database, exported.id)), { code: 'M1400' });
  const protocol = await withRightsOperator(database, () => registerRights(database, fixture));
  for (const options of [{}, { subjectId: context.profileId }, { kind: 'EXPORT' }, { digest: 'b'.repeat(64) }]) {
    await assert.rejects(withRightsOperator(database, () => registerRights(database, fixture, { id: protocol.id, ...options })), { code: '23505' });
  }
  for (const counts of [[], 'Texto livre', { profiles: -1 }, { profiles: 0.5 }, { profiles: '1' },
    { profiles: Number.MAX_SAFE_INTEGER + 1 }, { email: 1 }, { pending: { text: 'privado' } }]) {
    await assert.rejects(withRightsOperator(database, () => appendRightsEvent(database, protocol.id, 2, 'PARTIAL', counts)), { code: '23514' });
  }
  for (const [sequence, code] of [[0, 'PARTIAL'], [3, 'PARTIAL'], [2, 'REGISTERED'], [2, 'EXPORT_READY'], [2, 'EXPIRED']]) {
    await assert.rejects(withRightsOperator(database, () => appendRightsEvent(database, protocol.id, sequence, code)), { code: '23514' });
  }
  await assert.rejects(withRightsOperator(database, () => suppressRights(database, protocol.id, context.profileId)), { code: '23503' },
    'A FK composta impede suprimir uma pessoa usando o protocolo de outra.');
  await assert.rejects(withRightsOperator(database, () => applyDataErasure(database, protocol.id)), { code: 'M1400' });
  await withRightsOperator(database, () => suppressRights(database, protocol.id, fixture.subjectId, ['IDENTITY']));
  await assert.rejects(withRightsOperator(database, () => applyDataErasure(database, protocol.id)), { code: 'M1400' });
  await withRightsOperator(database, () => suppressRights(database, protocol.id, fixture.subjectId, ['AUTHORED_CONTENT']));
  await assert.rejects(withRightsOperator(database, () => suppressRights(database, protocol.id, fixture.subjectId)), { code: '23505' });
  for (const [sql, values, code] of [
    ['SELECT * FROM app."Profile"', [], '42501'],
    ['SELECT sha256 FROM app."MediaAsset"', [], '42501'],
    ['UPDATE app."Profile" SET "displayName"=$2 WHERE id=$1', [context.profileId, 'Conta removida'], '23514'],
    ['UPDATE app."Profile" SET "displayName"=$2 WHERE id=$1', [fixture.subjectId, 'Outro nome'], '23514'],
    ['UPDATE app."Profile" SET "securityVersion"=1 WHERE id=$1', [fixture.subjectId], '42501'],
    ['UPDATE app."MediaCollection" SET id=id WHERE id=$1', [fixture.memoryId], '42501'],
    ['UPDATE app."MediaCollection" SET "retentionHold"=false WHERE id=$1', [fixture.heldMemoryId], '42501'],
    ['UPDATE app."MediaAsset" SET "purgedAt"=now() WHERE id=$1', [fixture.ownAssetId], '42501'],
    [`UPDATE app."MediaAsset" SET state='REMOVING',"removedAt"=now(),"availableAt"=now(),"leaseToken"=NULL WHERE id=$1`, [fixture.heldAssetId], '23514'],
    [`UPDATE app."MediaAsset" SET state='REMOVING',"removedAt"=now(),"availableAt"=now(),"leaseToken"=NULL WHERE id=$1`, [fixture.foreignAssetId], '23514'],
    ['INSERT INTO app."DataRightsProtocol" (id,"createdAt") VALUES ($1,now())', [randomUUID()], '42501'],
  ]) await assert.rejects(withRightsOperator(database, () => database.query(sql, values)), { code });
  for (const table of rightsTables) {
    await assert.rejects(withRightsOperator(database, () => database.query(`UPDATE app."${table}" SET "createdAt"=now()`)), { code: '42501' });
    await assert.rejects(withRightsOperator(database, () => database.query(`DELETE FROM app."${table}"`)), { code: '42501' });
    await assert.rejects(database.query(`UPDATE app."${table}" SET "createdAt"=now()`), { code: '23514' });
  }
  const before = await rightsEvolutionSnapshot(database);
  await database.query(`CREATE FUNCTION app.fail_rights_proof() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Proof failure' USING ERRCODE='23514'; END; $$`);
  await database.query(`CREATE CONSTRAINT TRIGGER fail_rights_proof AFTER INSERT ON app."DataRightsEvent"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.fail_rights_proof()`);
  try {
    await assert.rejects(withRightsOperator(database, () => applyDataErasure(database, protocol.id)), { code: '23514' });
    assertRightsPreserved(before, await rightsEvolutionSnapshot(database));
    assert.equal((await runtime.query('SELECT id FROM app."DataRightsEvent" WHERE "protocolId"=$1', [protocol.id])).rowCount, 1,
      'Falha da auditoria reverte nome, sessões, grant, fila e evento juntos.');
  } finally {
    await database.query('DROP TRIGGER fail_rights_proof ON app."DataRightsEvent"');
    await database.query('DROP FUNCTION app.fail_rights_proof()');
  }
  const preserved = await rightsEvolutionSnapshot(database, fixture.subjectId);
  const counts = await withRightsOperator(database, () => applyDataErasure(database, protocol.id));
  assert.equal(counts.profiles, 1); assert.ok(counts.sessions >= 1); assert.equal(counts.grants, 1);
  assert.ok(counts.mediaQueued >= 2); assert.ok(counts.mediaHeld >= 1);
  assertRightsPreserved(preserved, await rightsEvolutionSnapshot(database, fixture.subjectId));
  const assets = (await runtime.query(`SELECT id,state,"removedAt","purgedAt","leaseToken","leaseUntil" FROM app."MediaAsset" WHERE id=ANY($1::uuid[])`,
    [[fixture.ownAssetId, fixture.foreignAssetId, fixture.memoryAssetId, fixture.heldAssetId]])).rows;
  for (const id of [fixture.ownAssetId, fixture.memoryAssetId]) {
    const asset = assets.find(row => row.id === id);
    assert.equal(asset.state, 'REMOVING'); assert.ok(asset.removedAt); assert.equal(asset.purgedAt, null);
    if (id === fixture.ownAssetId) { assert.equal(asset.leaseToken, null); assert.ok(asset.leaseUntil > new Date()); }
  }
  for (const id of [fixture.foreignAssetId, fixture.heldAssetId]) assert.equal(assets.find(row => row.id === id).removedAt, null);
  assert.equal((await runtime.query('SELECT "displayName" FROM app."Profile" WHERE id=$1', [fixture.subjectId])).rows[0].displayName, 'Conta removida');
  assert.equal((await runtime.query('SELECT id FROM app."AuthSession" WHERE "profileId"=$1 AND "revokedAt" IS NULL', [fixture.subjectId])).rowCount, 0);
  const appliedEvents = (await runtime.query(`SELECT sequence,code,"countsJson" FROM app."DataRightsEvent" WHERE "protocolId"=$1 ORDER BY sequence`, [protocol.id])).rows;
  assert.deepEqual(appliedEvents.map(row => row.code), ['REGISTERED', 'SUPPRESSION_APPLIED']);
  assert.deepEqual(appliedEvents[1].countsJson, counts);
  const replay = await withRightsOperator(database, () => applyDataErasure(database, protocol.id));
  assert.deepEqual(replay, { profiles: 0, sessions: 0, grants: 0, mediaQueued: 0, mediaHeld: counts.mediaHeld });
  assert.deepEqual((await runtime.query(`SELECT sequence,code,"countsJson" FROM app."DataRightsEvent" WHERE "protocolId"=$1 ORDER BY sequence`, [protocol.id])).rows, appliedEvents);
  for (const table of ['AuthSession', 'AdminGrant']) {
    await assert.rejects(withRightsOperator(database, () => database.query(`UPDATE app."${table}" SET "revokedAt"=NULL WHERE "profileId"=$1`, [fixture.subjectId])), { code: '23514' });
  }
  await withRightsOperator(database, () => appendRightsEvent(database, protocol.id, 3, 'PARTIAL', { pending: 1, bytes: Number.MAX_SAFE_INTEGER }));
  // Credencial privilegiada pode limpar apenas os IDs de fixture, respeitando FKs.
  await assert.rejects(database.query('DELETE FROM app."DataRightsProtocol" WHERE id=$1', [protocol.id]), { code: '23503' });
  await database.query('DELETE FROM app."DataSuppression" WHERE "protocolId"=$1', [protocol.id]);
  await database.query('DELETE FROM app."DataRightsEvent" WHERE "protocolId"=$1', [protocol.id]);
  await database.query('DELETE FROM app."DataRightsProtocol" WHERE id=$1', [protocol.id]);
  assert.equal((await runtime.query('SELECT id FROM app."DataRightsProtocol" WHERE id=$1', [protocol.id])).rowCount, 0);
}
