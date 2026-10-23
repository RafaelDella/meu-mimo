import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { relationshipOperations, transaction } from './check-relationship-migration-helpers.mjs';

/** Invariantes T12 em banco exclusivo e descartável; não usa credenciais do Next. */
export async function checkRelationshipMigration(database, runtime, context) {
  const tables = ['PersonalNote', 'NoteVersion', 'NoteRead', 'Reaction', 'ReactionEvent',
    'NotificationGroup', 'NotificationPreference', 'NotificationPreferenceEvent'];
  for (const table of tables) {
    assert.ok((await database.query('SELECT to_regclass($1) AS relation', [`app."${table}"`])).rows[0].relation,
      `T12 requires ${table}: a projeção ainda não foi implementada.`);
    for (const role of ['anon', 'authenticated']) {
      await database.query('BEGIN');
      try {
        await database.query(`SET LOCAL ROLE ${role}`);
        await assert.rejects(database.query(`SELECT * FROM app."${table}"`), { code: '42501' });
      } finally { await database.query('ROLLBACK'); }
    }
    await assert.rejects(runtime.query(`DELETE FROM app."${table}"`), { code: '42501' });
  }
  assert.equal((await database.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='app' AND rowsecurity")).rows[0].n, 37);
  assert.equal((await runtime.query(`SELECT n.id FROM app."Notification" n JOIN app."OutboxEvent" e ON e.id=n."eventId"
    LEFT JOIN app."NotificationGroup" g ON g.id=n."groupId" WHERE g.id IS NULL OR n."groupVersion" IS NULL
    OR g.key IS DISTINCT FROM app.notification_group_key(e.id,n.id) OR g."storeId"<>e."storeId"
    OR g."recipientMembershipId"<>e."recipientMembershipId" OR g."actorProfileId"<>e."actorProfileId"`)).rowCount, 0,
  'Backfill mantém todos os avisos associados à audiência original.');
  const op = relationshipOperations(runtime, context);
  for (const omit of ['projection', 'outbox']) {
    await assert.rejects(transaction(runtime, () => op.note({ omit })), { code: omit === 'projection' ? '23503' : '23514' }, 'note_version_requires_projection_outbox');
  }
  await assert.rejects(transaction(runtime, () => op.note({ actorId: context.profileId })), { code: '23514' });
  await assert.rejects(transaction(runtime, () => op.note({ recipientId: op.merchantMembershipId })), { code: '23514' });
  for (const text of ['💜'.repeat(2001), '\t', '\u00a0', '\ufeff', ' Texto ', 'Inválido\u0001']) {
    await assert.rejects(transaction(runtime, () => op.note({ text })), { code: '23514' });
  }
  const note = await transaction(runtime, () => op.note({ text: '💜'.repeat(2000) }));
  await assert.rejects(runtime.query(`INSERT INTO app."NoteRead" ("noteVersionId","readerMembershipId","actorProfileId")
    VALUES ($1,$2,$3)`, [note.versionId, op.merchantMembershipId, context.merchantId]), { code: '23514' }, 'read_requires_exact_recipient');
  await assert.rejects(runtime.query(`INSERT INTO app."NoteRead" ("noteVersionId","readerMembershipId","actorProfileId")
    VALUES ($1,$2,$3)`, [note.versionId, context.participantId, context.merchantId]), { code: '23514' });
  await runtime.query(`INSERT INTO app."NoteRead" ("noteVersionId","readerMembershipId","actorProfileId") VALUES ($1,$2,$3)`,
    [note.versionId, context.participantId, context.profileId]);
  for (const table of ['NoteVersion', 'NoteRead', 'ReactionEvent', 'NotificationPreferenceEvent']) {
    const field = table === 'NoteRead' ? 'readAt' : 'createdAt';
    await assert.rejects(runtime.query(`UPDATE app."${table}" SET "${field}"=clock_timestamp()`), { code: '42501' });
  }
  await assert.rejects(transaction(runtime, () => runtime.query('UPDATE app."PersonalNote" SET version=version+1 WHERE id=$1', [note.noteId])), { code: '23514' });
  const conversationId = randomUUID();
  await runtime.query(`INSERT INTO app."Conversation" (id,"storeId","participantMembershipId","subjectType","subjectId")
    VALUES ($1,$2,$3,'TICKET',$4)`, [conversationId, context.storeId, context.participantId, randomUUID()]);
  for (const omit of ['event', 'outbox']) {
    await assert.rejects(transaction(runtime, () => op.reaction(conversationId, { omit })), { code: '23514' }, 'reaction_requires_event');
  }
  await assert.rejects(transaction(runtime, () => op.reaction(conversationId, { emoji: '💜' })), { code: '23514' });
  const reaction = await transaction(runtime, () => op.reaction(conversationId));
  await transaction(runtime, () => op.reaction(conversationId, { id: reaction.id, version: 2, fromEmoji: '❤️', emoji: null, omit: 'outbox' }));
  assert.equal((await runtime.query('SELECT emoji,version FROM app."Reaction" WHERE id=$1', [reaction.id])).rows[0].version, 2);
  await assert.rejects(transaction(runtime, () => op.preference({ omit: 'event' })), { code: '23514' }, 'preference_requires_audit');
  await assert.rejects(transaction(runtime, () => op.preference({ actorId: context.merchantId })), { code: '23503' });
  await transaction(runtime, () => op.preference());
  const source = (await runtime.query('SELECT id FROM app."OutboxEvent" WHERE "noteVersionId"=$1', [note.versionId])).rows[0];
  await assert.rejects(transaction(runtime, () => op.group(source.id, { recipientId: op.merchantMembershipId })), { code: '23514' }, 'group_cannot_mix_audience');
  await transaction(runtime, () => op.group(source.id));
  const notifications = await runtime.query(`SELECT n.id,n."readAt",n."groupVersion",g.version FROM app."Notification" n
    JOIN app."NotificationGroup" g ON g.id=n."groupId" WHERE n."eventId"=$1`, [source.id]);
  assert.equal(notifications.rows[0].groupVersion, 1);
  assert.equal(notifications.rows[0].version, 1);
  assert.equal(notifications.rows[0].readAt, null);
}
