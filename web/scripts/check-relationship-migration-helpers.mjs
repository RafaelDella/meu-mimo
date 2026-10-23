import { randomUUID } from 'node:crypto';

export async function transaction(client, operation) {
  await client.query('BEGIN');
  try { const result = await operation(); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
}

export function relationshipOperations(client, context) {
  const { storeId, participantId, merchantId, profileId } = context;
  const merchantMembershipId = context.merchantMembershipId;
  return {
    merchantMembershipId,
    async note(options = {}) {
      const noteId = randomUUID(); const versionId = randomUUID();
      if (options.omit !== 'projection') await client.query(`INSERT INTO app."PersonalNote" (id,"storeId","participantMembershipId",version)
        VALUES ($1,$2,$3,1)`, [noteId, storeId, participantId]);
      await client.query(`INSERT INTO app."NoteVersion" (id,"noteId","storeId","participantMembershipId","actorProfileId",version,text,"requestDigest")
        VALUES ($1,$2,$3,$4,$5,1,$6,$7)`, [versionId, noteId, storeId, participantId, options.actorId ?? merchantId,
        options.text ?? 'Um bilhete', 'a'.repeat(64)]);
      if (options.omit !== 'outbox') await client.query(`INSERT INTO app."OutboxEvent" (id,key,kind,"storeId","participantMembershipId","actorProfileId","recipientMembershipId","noteVersionId")
        VALUES ($1,$2,'NOTE_SENT',$3,$4,$5,$6,$7)`, [randomUUID(), `note.sent:${versionId}`, storeId, participantId,
        options.actorId ?? merchantId, options.recipientId ?? participantId, versionId]);
      return { noteId, versionId };
    },
    async reaction(conversationId, options = {}) {
      const id = options.id ?? randomUUID(); const eventId = randomUUID(); const version = options.version ?? 1;
      const emoji = options.emoji === undefined ? '❤️' : options.emoji;
      if (version === 1) await client.query(`INSERT INTO app."Reaction" (id,"storeId","conversationId","actorProfileId",version,emoji)
        VALUES ($1,$2,$3,$4,$5,$6)`, [id, storeId, conversationId, merchantId, version, emoji]);
      else await client.query('UPDATE app."Reaction" SET version=$2,emoji=$3 WHERE id=$1', [id, version, emoji]);
      if (options.omit !== 'event') await client.query(`INSERT INTO app."ReactionEvent" (id,"reactionId","storeId","conversationId","actorProfileId",version,"fromEmoji","toEmoji","requestDigest")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [eventId, id, storeId, conversationId, merchantId, version, options.fromEmoji ?? null, emoji, 'b'.repeat(64)]);
      if (options.omit !== 'outbox') await client.query(`INSERT INTO app."OutboxEvent" (id,key,kind,"storeId","participantMembershipId","actorProfileId","recipientMembershipId","reactionEventId")
        VALUES ($1,$2,'REACTION_CHANGED',$3,$4,$5,$4,$6)`, [randomUUID(), `reaction.changed:${eventId}`, storeId, participantId, merchantId, eventId]);
      return { id, eventId };
    },
    async preference(options = {}) {
      await client.query(`INSERT INTO app."NotificationPreference" ("membershipId","storeId",version,"socialMuted","automaticApprovalNotices")
        VALUES ($1,$2,1,true,true)`, [participantId, storeId]);
      if (options.omit !== 'event') await client.query(`INSERT INTO app."NotificationPreferenceEvent" (id,"membershipId","storeId","actorProfileId",version,"requestDigest","socialMuted","automaticApprovalNotices")
        VALUES ($1,$2,$3,$4,1,$5,true,true)`, [randomUUID(), participantId, storeId, options.actorId ?? profileId, 'c'.repeat(64)]);
    },
    async group(eventId, options = {}) {
      const id = randomUUID(); const notificationId = randomUUID();
      await client.query(`INSERT INTO app."Notification" (id,"eventId") VALUES ($1,$2)`, [notificationId, eventId]);
      await client.query(`INSERT INTO app."NotificationGroup" (id,key,"storeId","recipientMembershipId","actorProfileId",category,version,"lastDeliveredAt")
        VALUES ($1,$2,$3,$4,$5,'NOTES',1,clock_timestamp())`, [id, `event:${notificationId}`, storeId, options.recipientId ?? participantId, merchantId]);
      await client.query('UPDATE app."Notification" SET "groupId"=$2,"groupVersion"=1 WHERE id=$1', [notificationId, id]);
    },
  };
}
