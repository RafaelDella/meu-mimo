import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

export async function adminTransaction(client, operation) {
  await client.query('BEGIN');
  try { const result = await operation(); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
}

export const adminSnapshotTables = ['Profile', 'Store', 'Membership', 'AdminGrant', 'AuthSession', 'Invitation', 'StoreAudit',
  'Activity', 'ActivityEvent', 'ActivitySubmission', 'SubmissionEvent', 'SubmissionReviewEvent', 'PointsEntry',
  'Reward', 'RewardEvent', 'Redemption', 'RedemptionEvent', 'TicketAlbum', 'AlbumEvent', 'AlbumItem',
  'OutboxEvent', 'Notification', 'NotificationGroup', 'NotificationPreference', 'NotificationPreferenceEvent',
  'PersonalNote', 'NoteVersion', 'NoteRead', 'Reaction', 'ReactionEvent', 'Conversation', 'Comment', 'MediaCollection', 'MediaAsset', 'MediaPart'];

export async function adminEvolutionSnapshot(database, after = false) {
  const snapshot = new Map();
  for (const table of adminSnapshotTables) {
    const added = after ? table === 'Profile' ? ['securityVersion'] : table === 'Store' ? ['platformPausedAt', 'platformVersion'] : [] : [];
    snapshot.set(table, (await database.query(`SELECT to_jsonb(t)-$1::text[] AS row FROM app."${table}" t
      ORDER BY (to_jsonb(t)-$1::text[])::text`, [added])).rows);
  }
  return snapshot;
}

export function assertAdminPreserved(before, after) {
  for (const [table, rows] of before) assert.deepEqual(after.get(table), rows, `T13 deve preservar todas as colunas anteriores de ${table}.`);
}

export async function adminMigrationFixture(database, storeId) {
  const actorId = randomUUID(); const targetId = randomUUID(); const otherAdminId = randomUUID();
  const actorSessionId = randomUUID(); const targetSessionId = randomUUID(); const otherAdminSessionId = randomUUID();
  await database.query('INSERT INTO app."Profile" (id,"displayName") VALUES ($1,$2),($3,$4),($5,$6)',
    [actorId, 'Admin fictício', targetId, 'Alvo fictício', otherAdminId, 'Segundo admin fictício']);
  await database.query('INSERT INTO app."AuthSession" (id,"profileId") VALUES ($1,$2),($3,$4),($5,$6)',
    [actorSessionId, actorId, targetSessionId, targetId, otherAdminSessionId, otherAdminId]);
  await database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1),($2)', [actorId, otherAdminId]);
  return { actorId, targetId, otherAdminId, actorSessionId, targetSessionId, otherAdminSessionId, storeId };
}

export function adminCommand(fixture, options = {}) {
  const targetKind = options.targetKind ?? 'STORE';
  const input = { actor: fixture.actorId, session: fixture.actorSessionId, operation: randomUUID(),
    targetKind, targetId: targetKind === 'STORE' ? fixture.storeId : fixture.targetId,
    kind: targetKind === 'STORE' ? 'PAUSE_STORE' : 'BLOCK_ACCOUNT', expectedVersion: 0,
    reason: 'Motivo administrativo fictício', ...options };
  input.digest ??= createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return input;
}

export async function applyAdminCommand(client, input) {
  return (await client.query(`SELECT app.apply_admin_action($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::text,$7::integer,$8::text,$9::text) AS id`,
    [input.actor, input.session, input.operation, input.targetKind, input.targetId, input.kind, input.expectedVersion, input.reason, input.digest])).rows[0].id;
}

export async function adminTarget(client, targetKind, id) {
  const table = targetKind === 'STORE' ? 'Store' : 'Profile';
  const columns = targetKind === 'STORE' ? 'state,"pausedAt","closedAt","platformPausedAt","platformVersion"' : '"suspendedAt","securityVersion"';
  return (await client.query(`SELECT ${columns} FROM app."${table}" WHERE id=$1`, [id])).rows[0];
}
