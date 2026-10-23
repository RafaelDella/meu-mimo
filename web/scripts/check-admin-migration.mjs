import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminCommand, adminMigrationFixture, adminTarget, applyAdminCommand } from './check-admin-migration-helpers.mjs';

/** Funções/privilégios reais e evolução somente no banco descartável de migrações. */
export async function checkAdminMigration(database, runtime, context) {
  assert.ok((await database.query('SELECT to_regclass($1) AS relation', ['app."AdminAction"'])).rows[0].relation,
    'T13 requires AdminAction: a evolução administrativa ainda não existe.');
  assert.equal((await database.query('SELECT count(*)::int AS n FROM app."Profile" WHERE "securityVersion"<>0')).rows[0].n, 0);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM app."Store" WHERE "platformVersion"<>0 OR "platformPausedAt" IS NOT NULL')).rows[0].n, 0);
  const functions = (await database.query(`SELECT p.proname,p.prosecdef,p.proconfig,r.rolname FROM pg_proc p
    JOIN pg_roles r ON r.oid=p.proowner WHERE p.pronamespace='app'::regnamespace AND p.proname=ANY($1::text[])`,
  [['apply_admin_action', 'lock_admin_access']])).rows;
  assert.equal(functions.length, 2);
  assert.ok(functions.every(fn => fn.prosecdef && fn.rolname === 'meumimo_admin_executor' &&
    fn.proconfig.some(setting => setting.replaceAll(' ', '') === 'search_path=pg_catalog,app,pg_temp')));
  const role = (await database.query(`SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles
    WHERE rolname='meumimo_admin_executor'`)).rows[0];
  assert.ok(role && Object.values(role).every(value => value === false));
  assert.equal((await runtime.query("SELECT pg_has_role(current_user,'meumimo_admin_executor','MEMBER') AS member")).rows[0].member, false);
  assert.equal((await database.query("SELECT has_schema_privilege('meumimo_admin_executor','app','CREATE') AS create")).rows[0].create, false);
  for (const table of ['PointsEntry', 'Redemption', 'NoteVersion', 'MediaAsset', 'Comment']) {
    assert.equal((await database.query('SELECT has_table_privilege($1,$2,$3) AS allowed',
      ['meumimo_admin_executor', `app."${table}"`, 'SELECT'])).rows[0].allowed, false);
  }
  await assert.rejects(runtime.query('SET ROLE meumimo_admin_executor'), { code: '42501' });
  await assert.rejects(runtime.query('CREATE OR REPLACE FUNCTION app.lock_admin_access(uuid,uuid) RETURNS void LANGUAGE sql AS $$ SELECT NULL $$'), { code: '42501' });
  for (const sql of ['INSERT INTO app."AdminAction" (id) VALUES ($1)',
    'UPDATE app."AdminAction" SET reason=reason', 'DELETE FROM app."AdminAction"']) {
    await assert.rejects(runtime.query(sql, sql.includes('$1') ? [randomUUID()] : []), { code: '42501' });
  }
  for (const name of ['anon', 'authenticated']) {
    for (const sql of ['SELECT * FROM app."AdminAction"', 'SELECT app.lock_admin_access(NULL,NULL)']) {
      await database.query('BEGIN');
      try {
        await database.query(`SET LOCAL ROLE ${name}`);
        await assert.rejects(database.query(sql), { code: '42501' });
      } finally { await database.query('ROLLBACK'); }
    }
  }
  const fixture = await adminMigrationFixture(database, context.storeId);
  for (const [pausedAt, version] of [[new Date(), 0], [null, 1], [new Date(), 1]]) {
    await assert.rejects(runtime.query(`INSERT INTO app."Store" (id,"createdByProfileId","platformPausedAt","platformVersion")
      VALUES ($1,$2,$3,$4)`, [randomUUID(), fixture.actorId, pausedAt, version]), { code: '23514' },
    'Store INSERT não pode introduzir restrição ou revisão administrativa fora dos defaults.');
  }
  for (const columns of ['', ',"platformPausedAt","platformVersion"']) {
    const id = randomUUID();
    await runtime.query(`INSERT INTO app."Store" (id,"createdByProfileId"${columns})
      VALUES ($1,$2${columns ? ',DEFAULT,DEFAULT' : ''})`, [id, fixture.actorId]);
    const initial = await adminTarget(database, 'STORE', id);
    assert.equal(initial.platformPausedAt, null); assert.equal(initial.platformVersion, 0);
  }
  for (const field of ['securityVersion', 'suspendedAt']) {
    await assert.rejects(runtime.query(`INSERT INTO app."Profile" (id,"${field}") VALUES ($1,$2)`,
      [randomUUID(), field === 'securityVersion' ? 1 : new Date()]), { code: '42501' },
    'Profile conserva INSERT restrito às colunas de bootstrap.');
  }
  const bootstrapId = randomUUID();
  await runtime.query('INSERT INTO app."Profile" (id,"displayName") VALUES ($1,$2)', [bootstrapId, 'Bootstrap fictício']);
  assert.deepEqual(await adminTarget(database, 'ACCOUNT', bootstrapId), { suspendedAt: null, securityVersion: 0 });
  for (const [table, field, id] of [['Profile', 'suspendedAt', fixture.targetId], ['Profile', 'securityVersion', fixture.targetId],
    ['Store', 'platformPausedAt', context.storeId], ['Store', 'platformVersion', context.storeId]]) {
    await assert.rejects(runtime.query(`UPDATE app."${table}" SET "${field}"="${field}" WHERE id=$1`, [id]), { code: '42501' });
  }
  await runtime.query('SELECT app.lock_admin_access($1,$2)', [fixture.actorId, fixture.actorSessionId]);
  const membershipQuery = `SELECT grantor,admin_option,inherit_option,set_option FROM pg_auth_members
    WHERE roleid='meumimo_admin_executor'::regrole AND member=current_user::regrole ORDER BY grantor`;
  const operatorMembership = (await database.query(membershipQuery)).rows;
  for (const [table, field, id] of [['AuthSession', 'id', fixture.actorSessionId], ['AdminGrant', 'profileId', fixture.actorId]]) {
    await database.query('BEGIN');
    try {
      // O operador de prova obtém SET somente nesta transação, revertida integralmente.
      await database.query('GRANT meumimo_admin_executor TO CURRENT_USER WITH SET TRUE GRANTED BY CURRENT_USER');
      await database.query('SET LOCAL ROLE meumimo_admin_executor');
      await assert.rejects(database.query(`UPDATE app."${table}" SET "${field}"="${field}" WHERE "${field}"=$1`, [id]), { code: '42501' });
    } finally { await database.query('ROLLBACK'); }
  }
  assert.deepEqual((await database.query(membershipQuery)).rows, operatorMembership,
    'As provas preservam exatamente ADMIN, INHERIT e SET preexistentes do operador.');
  const input = adminCommand(fixture, { reason: '💜'.repeat(500) });
  await runtime.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try {
    await runtime.query('SELECT app.lock_admin_access($1,$2)', [fixture.actorId, fixture.actorSessionId]);
    await assert.rejects(applyAdminCommand(runtime, input), { code: 'M1300' },
      'Comando rejeita snapshot antigo; lock de consulta continua disponível em RepeatableRead.');
  } finally { await runtime.query('ROLLBACK'); }
  const before = await adminTarget(database, 'STORE', context.storeId);
  await database.query(`CREATE FUNCTION app.fail_admin_proof() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Proof failure' USING ERRCODE='23514'; END; $$`);
  await database.query('CREATE CONSTRAINT TRIGGER fail_admin_proof AFTER INSERT ON app."AdminAction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.fail_admin_proof()');
  try {
    await assert.rejects(applyAdminCommand(runtime, input), { code: '23514' }, 'action_requires_audit');
    assert.deepEqual(await adminTarget(database, 'STORE', context.storeId), before);
  } finally {
    await database.query('DROP TRIGGER fail_admin_proof ON app."AdminAction"');
    await database.query('DROP FUNCTION app.fail_admin_proof()');
  }
  for (const options of [{ reason: '' }, { reason: ' ' }, { reason: '💜'.repeat(501) }, { reason: ' Motivo ' },
    { reason: 'e\u0301' }, { reason: 'Controle\u0001' }, { expectedVersion: -1 }, { expectedVersion: 2_147_483_647 },
    { targetKind: 'OTHER' }, { kind: 'BLOCK_ACCOUNT' }, { digest: 'inválido' }]) {
    await assert.rejects(applyAdminCommand(runtime, adminCommand(fixture, options)), { code: 'M1300' });
  }
  await assert.rejects(applyAdminCommand(runtime, adminCommand(fixture, { session: randomUUID() })), { code: 'M1301' }, 'invalid_or_revoked_session_denied');
  await database.query('UPDATE app."AuthSession" SET recovery=true WHERE id=$1', [fixture.actorSessionId]);
  await assert.rejects(applyAdminCommand(runtime, input), { code: 'M1303' });
  await database.query('UPDATE app."AuthSession" SET recovery=false,"revokedAt"=clock_timestamp() WHERE id=$1', [fixture.actorSessionId]);
  await assert.rejects(applyAdminCommand(runtime, input), { code: 'M1301' });
  await database.query('UPDATE app."AuthSession" SET "revokedAt"=NULL WHERE id=$1', [fixture.actorSessionId]);
  await database.query('UPDATE app."AdminGrant" SET "revokedAt"=clock_timestamp() WHERE "profileId"=$1', [fixture.actorId]);
  await assert.rejects(applyAdminCommand(runtime, input), { code: 'M1303' }, 'revoked_grant_denied');
  await database.query('UPDATE app."AdminGrant" SET "revokedAt"=NULL WHERE "profileId"=$1', [fixture.actorId]);
  for (const targetId of [fixture.actorId, fixture.otherAdminId]) {
    await assert.rejects(applyAdminCommand(runtime, adminCommand(fixture, { targetKind: 'ACCOUNT', targetId })), { code: 'M1303' }, 'self_and_active_admin_block_denied');
  }
  assert.equal(await applyAdminCommand(runtime, input), input.operation);
  assert.equal(await applyAdminCommand(runtime, input), input.operation);
  const paused = await adminTarget(database, 'STORE', context.storeId);
  assert.equal(paused.platformVersion, 1); assert.ok(paused.platformPausedAt);
  assert.equal(paused.state, before.state); assert.deepEqual(paused.pausedAt, before.pausedAt);
  for (const options of [{ targetId: context.otherStoreId }, { reason: 'Outro motivo' }, { expectedVersion: 1 },
    { kind: 'RESUME_STORE' }, { digest: 'f'.repeat(64) }, { actor: fixture.otherAdminId, session: fixture.otherAdminSessionId }]) {
    await assert.rejects(applyAdminCommand(runtime, { ...input, ...options }), { code: 'M1309' }, 'same_uuid_cannot_change_target_reason_actor');
  }
  await assert.rejects(applyAdminCommand(runtime, adminCommand(fixture)), { code: 'M1309' });
  await assert.rejects(applyAdminCommand(runtime, adminCommand(fixture, { expectedVersion: 1 })), { code: 'M1309' }, 'New satisfied intent is not another action');
  await assert.rejects(applyAdminCommand(runtime, adminCommand(fixture, { targetId: randomUUID() })), { code: 'M1304' });
  const resumed = adminCommand(fixture, { kind: 'RESUME_STORE', expectedVersion: 1 });
  await applyAdminCommand(runtime, resumed);
  assert.equal(await applyAdminCommand(runtime, input), input.operation);
  assert.equal((await adminTarget(database, 'STORE', context.storeId)).platformPausedAt, null);
  const block = adminCommand(fixture, { targetKind: 'ACCOUNT' });
  await applyAdminCommand(runtime, block);
  assert.equal((await adminTarget(database, 'ACCOUNT', fixture.targetId)).securityVersion, 1);
  await applyAdminCommand(runtime, adminCommand(fixture, { targetKind: 'ACCOUNT', kind: 'UNBLOCK_ACCOUNT', expectedVersion: 1 }));
  await database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [fixture.targetId]);
  assert.equal(await applyAdminCommand(runtime, block), block.operation, 'Replay precedes protection of a later grant and never reapplies blocking.');
  assert.equal((await adminTarget(database, 'ACCOUNT', fixture.targetId)).suspendedAt, null);
  await assert.rejects(database.query('UPDATE app."AdminAction" SET reason=$2 WHERE id=$1', [input.operation, 'Alterado']), { code: '23514' });
  const count = await database.query('SELECT count(*)::int AS n FROM app."AdminAction" WHERE id=$1', [input.operation]);
  assert.equal(count.rows[0].n, 1);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='app' AND rowsecurity")).rows[0].n, 38);
}
