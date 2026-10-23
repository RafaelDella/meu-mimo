import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { albumOperations, issueAlbumTicket, transaction } from './check-albums-migration-helpers.mjs';

/** Evolução T10→T11 sem reescrever históricos, somente no banco descartável. */
export async function checkAlbumsMigration(database, runtime, context) {
  const { storeId, merchantId, participantId, profileId, otherStoreId, legacyCollectionId } = context;
  assert.equal((await database.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='app' AND rowsecurity")).rows[0].n, 29);
  for (const table of ['TicketAlbum', 'AlbumEvent', 'AlbumItem']) {
    for (const role of ['anon', 'authenticated']) {
      await database.query('BEGIN');
      try {
        await database.query(`SET LOCAL ROLE ${role}`);
        await assert.rejects(database.query(`SELECT * FROM app."${table}"`), { code: '42501' });
      } finally { await database.query('ROLLBACK'); }
    }
    const privileges = await runtime.query(`SELECT has_table_privilege(current_user,$1,'SELECT') AS read,
      has_table_privilege(current_user,$1,'INSERT') AS create,
      has_table_privilege(current_user,$1,'DELETE') AS delete`, [`app."${table}"`]);
    assert.deepEqual(privileges.rows[0], { read: true, create: true, delete: false });
    await assert.rejects(runtime.query(`UPDATE app."${table}" SET "storeId"=$1`, [storeId]), { code: '42501' });
    await assert.rejects(runtime.query(`DELETE FROM app."${table}"`), { code: '42501' });
  }
  const constraints = (await database.query(`SELECT conname,convalidated FROM pg_constraint
    WHERE connamespace='app'::regnamespace AND conname=ANY($1::text[])`, [[
    'Album_ticket_context_fkey', 'Album_collection_context_fkey', 'Album_event_context_fkey',
    'Album_item_publication_context_fkey', 'AlbumItem_fields_check', 'AlbumEvent_fields_check',
    'Points_review_context_fkey', 'Points_compensation_context_fkey', 'Outbox_review_context_fkey',
    'Points_ticket_event_context_fkey', 'Outbox_ticket_event_context_fkey',
  ]])).rows;
  assert.equal(constraints.length, 11);
  assert.ok(constraints.every(row => row.convalidated));

  const ticketId = await transaction(runtime, () => issueAlbumTicket(runtime, context));
  const otherTicketId = await transaction(runtime, () => issueAlbumTicket(runtime, context));
  const op = albumOperations(runtime, context, ticketId);
  const other = albumOperations(runtime, context, otherTicketId);
  const merchantMembershipId = (await runtime.query(`SELECT id FROM app."Membership" WHERE "storeId"=$1 AND role='MERCHANT'`, [storeId])).rows[0].id;
  const financial = new Map();
  for (const table of ['Redemption', 'RedemptionEvent', 'PointsEntry', 'Reward', 'RewardEvent']) {
    financial.set(table, (await database.query(`SELECT to_jsonb(t) AS row FROM app."${table}" t ORDER BY id`)).rows);
  }
  for (const options of [{ omit: 'album' }, { subjectId: randomUUID() }, { authorId: profileId },
    { version: 2 }, { nextPosition: 2 }]) {
    await assert.rejects(transaction(runtime, () => op.start(options)), { code: '23514' });
  }
  const cancelledId = (await runtime.query(`SELECT id FROM app."Redemption" WHERE "storeId"=$1 AND status='CANCELLED'`, [storeId])).rows[0].id;
  await assert.rejects(transaction(runtime, () => op.start({ sourceId: cancelledId, subjectId: cancelledId })), { code: '23514' });
  await assert.rejects(transaction(runtime, () => op.start({ albumStore: otherStoreId })), { code: '23503' });
  await assert.rejects(transaction(runtime, () => op.asset(legacyCollectionId)), { code: '23514' });
  const album = await transaction(runtime, () => op.start());
  const otherAlbum = await transaction(runtime, () => other.start());
  const first = await op.asset(album.collectionId);
  const second = await op.asset(album.collectionId);
  const cross = await other.asset(otherAlbum.collectionId);
  await op.unchanged(album.id, () => op.asset(album.collectionId, { authorId: profileId }));
  await op.unchanged(album.id, () => op.asset(album.collectionId, { publishedAt: new Date() }));
  await op.unchanged(album.id, () => runtime.query('UPDATE app."TicketAlbum" SET version=version+1 WHERE id=$1', [album.id]));
  for (const omit of ['items', 'published', 'projection', 'outbox']) {
    await op.unchanged(album.id, () => op.publish(album.id, [first], { omit }));
  }
  await op.unchanged(album.id, () => op.publish(album.id, []));
  await op.unchanged(album.id, () => op.publish(album.id, [cross]));
  await op.unchanged(album.id, () => op.publish(album.id, [first], { sourceId: otherTicketId }), '23503');
  await op.unchanged(album.id, () => op.publish(album.id, [first], { recipientId: merchantMembershipId }));
  await op.unchanged(album.id, () => op.publish(album.id, [first], { authorId: profileId }));
  await op.unchanged(album.id, () => op.publish(album.id, [first], { positionOffset: 1 }));
  for (const caption of ['💜'.repeat(501), '\t', '\u00a0', '\ufeff', '\u0001', 'Legenda\u007f', ' legenda ']) {
    await op.unchanged(album.id, () => op.publish(album.id, [first], { caption }));
  }
  const notReady = await op.asset(album.collectionId, { state: 'PROCESSING' });
  await op.unchanged(album.id, () => op.publish(album.id, [notReady]));
  await op.unchanged(album.id, () => runtime.query('UPDATE app."MediaAsset" SET "publishedAt"=clock_timestamp() WHERE id=$1', [first]));

  const publication = await transaction(runtime, () => op.publish(album.id, [second, first], { caption: '💜'.repeat(500) }));
  assert.equal((await op.read(album.id)).version, 2);
  assert.equal((await op.read(album.id)).nextPosition, 3);
  const items = (await runtime.query('SELECT "assetId",position,caption FROM app."AlbumItem" WHERE "albumId"=$1 ORDER BY position', [album.id])).rows;
  assert.deepEqual(items.map(item => item.assetId), [second, first]);
  assert.deepEqual(items.map(item => item.position), [1, 2]);
  assert.ok(items.every(item => [...item.caption].length === 500));
  assert.equal((await runtime.query('SELECT id FROM app."OutboxEvent" WHERE "albumEventId"=$1', [publication.eventId])).rowCount, 1);
  await op.unchanged(album.id, () => op.publish(album.id, [first]), '23505');
  for (const sql of [
    'UPDATE app."AlbumItem" SET caption=\'Alterada\' WHERE "albumId"=$1',
    'UPDATE app."AlbumItem" SET position=position+10 WHERE "albumId"=$1',
    'UPDATE app."AlbumEvent" SET kind=\'REMOVE\' WHERE "albumId"=$1',
  ]) await assert.rejects(runtime.query(sql, [album.id]), { code: '42501' });
  await assert.rejects(database.query('UPDATE app."AlbumItem" SET caption=\'Alterada\' WHERE "albumId"=$1', [album.id]), { code: '23514' });
  await assert.rejects(database.query('UPDATE app."AlbumEvent" SET "requestDigest"=$2 WHERE "albumId"=$1', [album.id, 'f'.repeat(64)]), { code: '23514' });
  const later = await op.asset(album.collectionId);
  await op.unchanged(album.id, async () => {
    await runtime.query(`INSERT INTO app."AlbumItem" ("assetId","albumId","publicationId","storeId",position,"createdAt")
      VALUES ($1,$2,$3,$4,3,$5)`, [later, album.id, publication.eventId, storeId, publication.now]);
    await runtime.query('UPDATE app."MediaAsset" SET "publishedAt"=$2 WHERE id=$1', [later, publication.now]);
  });
  const next = await transaction(runtime, () => op.publish(album.id, [later]));
  assert.equal((await op.read(album.id)).nextPosition, 4);
  assert.equal((await runtime.query('SELECT position FROM app."AlbumItem" WHERE "assetId"=$1', [later])).rows[0].position, 3);
  assert.equal((await runtime.query('SELECT id FROM app."OutboxEvent" WHERE "albumEventId"=$1', [next.eventId])).rowCount, 1);

  for (const omit of ['event', 'projection', 'asset']) await op.unchanged(album.id, () => op.remove(album.id, first, { omit }));
  await op.unchanged(album.id, () => op.remove(album.id, first, { authorId: profileId }));
  await op.unchanged(album.id, () => op.remove(album.id, cross));
  await transaction(runtime, () => op.remove(album.id, first));
  assert.equal((await op.read(album.id)).version, 4);
  assert.equal((await op.read(album.id)).nextPosition, 4);
  assert.equal((await runtime.query('SELECT id FROM app."MediaAsset" WHERE id=$1 AND "removedAt" IS NOT NULL', [first])).rowCount, 1);
  assert.equal((await runtime.query('SELECT "assetId" FROM app."AlbumItem" WHERE "assetId"=$1', [first])).rowCount, 1);
  const draft = await op.asset(album.collectionId);
  await transaction(runtime, () => op.remove(album.id, draft));
  assert.equal((await op.read(album.id)).nextPosition, 4);
  const orphan = await op.asset(album.collectionId);
  await runtime.query('UPDATE app."MediaAsset" SET "lastActivityAt"=clock_timestamp()-interval \'25 hours\' WHERE id=$1', [orphan]);
  await runtime.query(`UPDATE app."MediaAsset" SET state='REMOVING',"removedAt"=clock_timestamp() WHERE id=$1`, [orphan]);
  assert.equal((await runtime.query('SELECT id FROM app."AlbumEvent" WHERE "removedAssetId"=$1', [orphan])).rowCount, 0);
  await op.unchanged(album.id, () => runtime.query('UPDATE app."MediaAsset" SET "removedAt"=NULL,state=\'READY\' WHERE id=$1', [first]));
  const ready = [];
  for (let index = 0; index < 17; index++) ready.push(await op.asset(album.collectionId));
  await op.unchanged(album.id, () => op.asset(album.collectionId));
  await op.unchanged(album.id, () => op.publish(album.id, ready.slice(0, 11)));

  for (const [table, rows] of financial) {
    assert.deepEqual((await database.query(`SELECT to_jsonb(t) AS row FROM app."${table}" t ORDER BY id`)).rows, rows,
      `Publicações e remoções não alteram ${table}.`);
  }
  assert.equal((await runtime.query('SELECT id FROM app."MediaCollection" WHERE id=$1', [legacyCollectionId])).rowCount, 1);
  assert.equal((await runtime.query('SELECT id FROM app."TicketAlbum" WHERE "collectionId"=$1', [legacyCollectionId])).rowCount, 0);
  assert.equal((await runtime.query('SELECT "createdByProfileId" FROM app."TicketAlbum" WHERE id=$1', [album.id])).rows[0].createdByProfileId, merchantId);
  assert.equal((await runtime.query('SELECT "participantMembershipId" FROM app."TicketAlbum" WHERE id=$1', [album.id])).rows[0].participantMembershipId, participantId);
}
