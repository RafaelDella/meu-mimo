import assert from 'node:assert/strict';
import { illustrations } from '../src/contracts/illustrations.ts';

const tables = ['Activity', 'ActivitySubmission', 'Reward', 'Redemption'];

export async function illustrationSnapshot(database) {
  const snapshot = new Map();
  for (const table of [...tables, 'PointsEntry', 'RewardEvent', 'SubmissionEvent']) {
    snapshot.set(table, (await database.query(`SELECT to_jsonb(t) AS row FROM app."${table}" t ORDER BY id`)).rows);
  }
  snapshot.set('RLS', (await database.query("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='app' ORDER BY tablename")).rows);
  snapshot.set('policies', (await database.query("SELECT * FROM pg_policies WHERE schemaname='app' ORDER BY tablename,policyname")).rows);
  snapshot.set('grants', (await database.query(`SELECT table_name,grantee,privilege_type,is_grantable FROM information_schema.role_table_grants
    WHERE table_schema='app' ORDER BY table_name,grantee,privilege_type`)).rows);
  return snapshot;
}

/** Exercita as restrições reais em cópias temporárias, sem triggers ou mutação do domínio. */
export async function checkIllustrationsMigration(database, before) {
  assert.deepEqual(await illustrationSnapshot(database), before, 'A biblioteca não altera dados ou snapshots existentes.');
  for (const table of tables) {
    const target = `"illustration_${table}"`;
    const column = table === 'ActivitySubmission' ? 'activitySticker' : table === 'Redemption' ? 'rewardSticker' : 'sticker';
    await database.query(`CREATE TEMP TABLE ${target} (LIKE app."${table}" INCLUDING CONSTRAINTS)`);
    const row = await database.query(`INSERT INTO ${target} SELECT * FROM app."${table}" ${table === 'ActivitySubmission' ? "WHERE status::text<>'DRAFT'" : ''} LIMIT 1`);
    assert.equal(row.rowCount, 1, `A prova de ${table} exige uma origem preservada.`);
    for (const { value } of illustrations) {
      assert.equal((await database.query(`UPDATE ${target} SET "${column}"=$1`, [value])).rowCount, 1);
    }
    if (['Activity', 'ActivitySubmission'].includes(table)) await database.query(`UPDATE ${target} SET "${column}"=''`);
    else await assert.rejects(database.query(`UPDATE ${target} SET "${column}"=''`), { code: '23514' });
    for (const invalid of ['unknown', '../gift', 'https://example.test/icon.svg']) {
      await assert.rejects(database.query(`UPDATE ${target} SET "${column}"=$1`, [invalid]), { code: '23514' });
    }
    const amount = table === 'Activity' || table === 'ActivitySubmission' ? 'points' : table === 'Reward' ? 'cost' : 'rewardCost';
    await assert.rejects(database.query(`UPDATE ${target} SET "${amount}"=0`), { code: '23514' });
    await database.query(`DROP TABLE ${target}`);
  }
}
