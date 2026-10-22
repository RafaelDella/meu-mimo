import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export { transaction } from './check-tickets-migration-helpers.mjs';

/** Emissão real com crédito T07/T08, somente no banco isolado da prova. */
export async function issueAlbumTicket(runtime, context) {
  const { storeId, merchantId, participantId, profileId } = context;
  const id = randomUUID();
  const rewardId = randomUUID();
  const fields = { name: 'Mimo do álbum', description: '', category: '', sticker: 'gift', cost: 1,
    note: '', instructions: '', available: true, stock: null, stockRevision: 1 };
  await runtime.query(`INSERT INTO app."Reward" (id,"storeId","createdByProfileId",name,cost)
    VALUES ($1,$2,$3,$4,1)`, [rewardId, storeId, merchantId, fields.name]);
  await runtime.query(`INSERT INTO app."RewardEvent"
    (id,"storeId","rewardId","actorProfileId",version,kind,"requestDigest",configuration)
    VALUES ($1,$2,$1,$3,1,'CREATE',$4,$5)`, [rewardId, storeId, merchantId, 'a'.repeat(64), fields]);
  const before = (await runtime.query(`SELECT COALESCE(sum(amount),0)::text AS balance FROM app."PointsEntry"
    WHERE "storeId"=$1 AND "participantMembershipId"=$2`, [storeId, participantId])).rows[0].balance;
  assert.ok(BigInt(before) >= 1n, 'Ticket do álbum usa somente saldo comprovado.');
  const now = (await runtime.query('SELECT clock_timestamp() AS now')).rows[0].now;
  const local = (await runtime.query(`SELECT timezone,to_char($2::timestamptz AT TIME ZONE timezone,'YYYY-MM-DD') AS date
    FROM app."Store" WHERE id=$1`, [storeId, now])).rows[0];
  await runtime.query(`INSERT INTO app."Redemption"
    (id,"storeId","rewardId","participantMembershipId","authorProfileId",code,"requestDigest","expectedBalance",
    "rewardVersion","rewardName","rewardDescription","rewardCategory","rewardSticker","rewardCost","rewardNote",
    "rewardInstructions","balanceBefore","balanceAfter",timezone,"localDate","createdAt")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,'','','gift',1,'','',$8,$10,$11,$12,$13)`,
  [id, storeId, rewardId, participantId, profileId, `MIMO-${id.toUpperCase()}`, 'b'.repeat(64), before,
    fields.name, String(BigInt(before) - 1n), local.timezone, local.date, now]);
  await runtime.query(`INSERT INTO app."RedemptionEvent" (id,"storeId","redemptionId","actorProfileId",kind,"createdAt")
    VALUES ($1,$2,$3,$4,'ISSUED',$5)`, [randomUUID(), storeId, id, profileId, now]);
  await runtime.query(`INSERT INTO app."PointsEntry"
    (id,"storeId","participantMembershipId","redemptionId","actorProfileId",kind,amount,"sourceKey","createdAt")
    VALUES ($1,$2,$3,$4,$5,'REDEMPTION_DEBIT',-1,$6,$7)`,
  [randomUUID(), storeId, participantId, id, profileId, `redemption.debit:${id}`, now]);
  await runtime.query(`INSERT INTO app."Conversation" (id,"storeId","participantMembershipId","subjectType","subjectId")
    VALUES ($1,$2,$3,'TICKET',$4)`, [randomUUID(), storeId, participantId, id]);
  await runtime.query(`INSERT INTO app."OutboxEvent"
    (id,key,kind,"storeId","participantMembershipId","actorProfileId","recipientMembershipId","redemptionId")
    SELECT $1,$2,'REDEMPTION_ISSUED',$3,$4,$5,id,$6 FROM app."Membership" WHERE "storeId"=$3 AND role='MERCHANT'`,
  [randomUUID(), `redemption.issued:${id}`, storeId, participantId, profileId, id]);
  return id;
}

export function albumOperations(runtime, context, ticketId) {
  const { storeId, merchantId, participantId } = context;
  const clock = async () => (await runtime.query('SELECT clock_timestamp() AS now')).rows[0].now;
  const read = async albumId => (await runtime.query('SELECT * FROM app."TicketAlbum" WHERE id=$1', [albumId])).rows[0];
  async function start({ subjectId = ticketId, sourceId = ticketId, authorId = merchantId,
    collectionStore = storeId, albumStore = storeId, version = 1, nextPosition = 1, omit = '' } = {}) {
    const id = randomUUID();
    const collectionId = randomUUID();
    await runtime.query(`INSERT INTO app."MediaCollection" (id,"storeId","participantMembershipId",purpose,"subjectId")
      VALUES ($1,$2,$3,'MEMORY',$4)`, [collectionId, collectionStore, participantId, subjectId]);
    if (omit !== 'album') await runtime.query(`INSERT INTO app."TicketAlbum"
      (id,"storeId","redemptionId","participantMembershipId","collectionId","createdByProfileId",version,"nextPosition")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, albumStore, sourceId, participantId, collectionId, authorId, version, nextPosition]);
    return { id, collectionId };
  }
  async function asset(collectionId, { authorId = merchantId, state = 'READY', publishedAt = null } = {}) {
    const id = randomUUID();
    await runtime.query(`INSERT INTO app."MediaAsset"
      (id,"collectionId","authorProfileId",revision,"mediaType","mimeType","byteLength",sha256,state,
      "uploadedBytes","outputVersion","processedAt",width,height,"displayBytes","thumbnailBytes","publishedAt")
      VALUES ($1,$2,$3,1,'PHOTO','image/jpeg',1,$4,$5,1,$6,clock_timestamp(),100,100,1,1,$7)`,
    [id, collectionId, authorId, 'c'.repeat(64), state, randomUUID(), publishedAt]);
    return id;
  }
  async function publish(albumId, assetIds, { omit = '', caption = '', positionOffset = 0,
    authorId = merchantId, sourceId = ticketId, recipientId = participantId, eventId = randomUUID() } = {}) {
    const album = await read(albumId);
    const now = await clock();
    await runtime.query(`INSERT INTO app."AlbumEvent"
      (id,"albumId","storeId","redemptionId","actorProfileId",version,kind,"requestDigest","createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,'PUBLISH',$7,$8)`,
    [eventId, albumId, storeId, sourceId, authorId, album.version + 1, 'd'.repeat(64), now]);
    if (omit !== 'items') for (const [index, id] of assetIds.entries()) {
      await runtime.query(`INSERT INTO app."AlbumItem" ("assetId","albumId","publicationId","storeId",position,caption,"createdAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, albumId, eventId, storeId, album.nextPosition + index + positionOffset, caption, now]);
    }
    if (omit !== 'published') for (const id of assetIds) {
      await runtime.query('UPDATE app."MediaAsset" SET "publishedAt"=$2 WHERE id=$1', [id, now]);
    }
    if (omit !== 'projection') await runtime.query('UPDATE app."TicketAlbum" SET version=version+1,"nextPosition"="nextPosition"+$2 WHERE id=$1',
      [albumId, assetIds.length]);
    if (omit !== 'outbox') await runtime.query(`INSERT INTO app."OutboxEvent"
      (id,key,kind,"storeId","participantMembershipId","actorProfileId","recipientMembershipId","redemptionId","albumEventId")
      VALUES ($1,$2,'ALBUM_PUBLISHED',$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), `album.published:${eventId}`, storeId, participantId, authorId, recipientId, sourceId, eventId]);
    return { eventId, now };
  }
  async function remove(albumId, assetId, { omit = '', authorId = merchantId } = {}) {
    const album = await read(albumId);
    const now = await clock();
    const eventId = randomUUID();
    if (omit !== 'event') await runtime.query(`INSERT INTO app."AlbumEvent"
      (id,"albumId","storeId","redemptionId","actorProfileId",version,kind,"requestDigest","removedAssetId","createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,'REMOVE',$7,$8,$9)`,
    [eventId, albumId, storeId, ticketId, authorId, album.version + 1, 'e'.repeat(64), assetId, now]);
    if (omit !== 'projection') await runtime.query('UPDATE app."TicketAlbum" SET version=version+1 WHERE id=$1', [albumId]);
    if (omit !== 'asset') await runtime.query(`UPDATE app."MediaAsset" SET state='REMOVING',"removedAt"=$2 WHERE id=$1`, [assetId, now]);
    return { eventId, now };
  }
  async function unchanged(albumId, work, code = '23514') {
    const before = await read(albumId);
    const items = (await runtime.query('SELECT * FROM app."AlbumItem" WHERE "albumId"=$1 ORDER BY position', [albumId])).rows;
    const events = (await runtime.query('SELECT * FROM app."AlbumEvent" WHERE "albumId"=$1 ORDER BY version', [albumId])).rows;
    await runtime.query('BEGIN');
    try { await assert.rejects((async () => { await work(); await runtime.query('COMMIT'); })(), { code }); }
    finally { await runtime.query('ROLLBACK'); }
    assert.deepEqual(await read(albumId), before);
    assert.deepEqual((await runtime.query('SELECT * FROM app."AlbumItem" WHERE "albumId"=$1 ORDER BY position', [albumId])).rows, items);
    assert.deepEqual((await runtime.query('SELECT * FROM app."AlbumEvent" WHERE "albumId"=$1 ORDER BY version', [albumId])).rows, events);
  }
  return { clock, read, start, asset, publish, remove, unchanged };
}
