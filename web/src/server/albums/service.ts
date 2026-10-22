import '../only.ts';
import type { AlbumEvent, Redemption, TicketAlbum } from '../../generated/prisma/client.ts';
import type { AlbumPublicationLookup, AlbumPublicationMutation, TicketAlbumPage } from '../../contracts/albums.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import { assertMediaUpload, requireMediaCollection } from '../media/access.ts';
import { publishMedia, registerMediaCollection } from '../media/registration.ts';
import { enqueueAlbumPublished } from '../outbox/events.ts';
import { requireTicket } from '../redemptions/access.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow, withStoreTransaction } from '../stores/transaction.ts';
import { allowedFields, operationConflict, operationId, resourceId, unavailable } from '../stores/validation.ts';
import { requireAlbumAuthor } from './access.ts';
import { albumRetention, syncAlbumRetention } from './retention.ts';
import { publicationInput } from './validation.ts';
import { albumPage } from './views.ts';

function changed(): never {
  throw new AppError('album_changed', 409, 'O álbum mudou. Confira os momentos e a ordem antes de publicar.');
}

async function result(scope: StoreScope, ticket: Redemption, event: AlbumEvent): Promise<AlbumPublicationMutation> {
  const items = await scope.tx.albumItem.findMany({ where: { publicationId: event.id },
    orderBy: { position: 'asc' }, select: { assetId: true } });
  return { album: await albumPage(scope, ticket), appliedVersion: event.version,
    publication: { id: event.id, version: event.version, createdAt: event.createdAt.toISOString(),
      assetIds: items.map(item => item.assetId) } };
}

async function requireAlbum(scope: StoreScope, ticket: Redemption): Promise<TicketAlbum> {
  const album = await scope.tx.ticketAlbum.findUnique({ where: { redemptionId: ticket.id } });
  if (!album || album.storeId !== scope.store.id) unavailable();
  await requireMediaCollection(scope, album.collectionId);
  await scope.tx.$queryRaw`SELECT id FROM app."TicketAlbum" WHERE id=${album.id}::uuid FOR UPDATE`;
  return album;
}

export async function readTicketAlbum(identity: Identity, storeId: string, ticketId: string,
  query = new URLSearchParams()): Promise<TicketAlbumPage> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => albumPage(scope, await requireTicket(scope, ticketId), query));
}

export async function startTicketAlbum(identity: Identity, storeId: string, ticketId: string,
  body: Record<string, unknown>): Promise<{ album: TicketAlbumPage }> {
  allowedFields(body, ['operationId']);
  const id = operationId(body);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const ticket = await requireTicket(scope, ticketId);
    requireAlbumAuthor(scope);
    const key = `meumimo:t11:album-start:${id}`;
    await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const operation = await scope.tx.ticketAlbum.findUnique({ where: { id } });
    if (operation && (operation.redemptionId !== ticket.id || operation.storeId !== scope.store.id ||
        operation.createdByProfileId !== identity.userId)) operationConflict();
    const existing = await scope.tx.ticketAlbum.findUnique({ where: { redemptionId: ticket.id } });
    if (existing) {
      requireAlbumAuthor(scope, existing);
      await requireMediaCollection(scope, existing.collectionId);
      return { album: await albumPage(scope, ticket) };
    }
    const policy = await albumRetention(scope, ticket, await databaseNow(scope.tx));
    if (ticket.status === 'CANCELLED' || policy.expired) {
      throw new AppError('media_read_only', 409, 'Este ticket não pode receber novos momentos.');
    }
    const participant = await scope.tx.membership.findUnique({ where: { id: ticket.participantMembershipId },
      select: { profile: { select: { suspendedAt: true } } } });
    if (!participant || participant.profile.suspendedAt) unavailable();
    const collection = await registerMediaCollection(scope, { purpose: 'MEMORY', subjectId: ticket.id,
      participantMembershipId: ticket.participantMembershipId });
    await scope.tx.ticketAlbum.create({ data: { id, storeId: scope.store.id, redemptionId: ticket.id,
      participantMembershipId: ticket.participantMembershipId, collectionId: collection.id,
      createdByProfileId: identity.userId, createdAt: await databaseNow(scope.tx) } });
    await syncAlbumRetention(scope, { ticketId: ticket.id });
    return { album: await albumPage(scope, ticket) };
  });
}

export async function publishTicketAlbum(identity: Identity, storeId: string, ticketId: string,
  body: Record<string, unknown>): Promise<AlbumPublicationMutation> {
  const { input, id, requestDigest } = publicationInput(body);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const ticket = await requireTicket(scope, ticketId);
    const album = await requireAlbum(scope, ticket);
    requireAlbumAuthor(scope, album);
    const key = `meumimo:t11:album-publication:${id}`;
    await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const previous = await scope.tx.albumEvent.findUnique({ where: { id } });
    if (previous) {
      if (previous.albumId !== album.id || previous.redemptionId !== ticket.id || previous.kind !== 'PUBLISH' ||
          previous.actorProfileId !== identity.userId || previous.requestDigest !== requestDigest) operationConflict();
      return result(scope, ticket, previous);
    }
    const context = await requireMediaCollection(scope, album.collectionId);
    assertMediaUpload(context);
    if (album.version !== input.expectedVersion || album.version >= 2_147_483_647 ||
        album.nextPosition > 2_147_483_647 - input.items.length) changed();
    const ids = input.items.map(item => item.assetId);
    for (const assetId of [...ids].sort()) {
      await scope.tx.$queryRaw`SELECT id FROM app."MediaAsset" WHERE id=${assetId}::uuid FOR UPDATE`;
    }
    const assets = await scope.tx.mediaAsset.findMany({ where: { id: { in: ids }, collectionId: album.collectionId } });
    if (assets.length !== ids.length) unavailable();
    for (const asset of assets) {
      if (asset.authorProfileId !== identity.userId) unavailable();
      if (asset.publishedAt || asset.removedAt) changed();
      if (asset.state !== 'READY' || !asset.outputVersion || !asset.width || !asset.height ||
          !asset.displayBytes || !asset.thumbnailBytes) {
        throw new AppError('media_not_ready', 409, 'Aguarde o processamento de todos os momentos escolhidos.');
      }
      assertMediaUpload(context, asset);
    }
    const occupied = await scope.tx.mediaAsset.count({ where: { collectionId: album.collectionId, removedAt: null } });
    if (occupied > 20) changed();
    const now = await databaseNow(scope.tx);
    const event = await scope.tx.albumEvent.create({ data: { id, albumId: album.id, storeId: scope.store.id,
      redemptionId: ticket.id, actorProfileId: identity.userId, version: album.version + 1,
      kind: 'PUBLISH', requestDigest, createdAt: now } });
    await scope.tx.albumItem.createMany({ data: input.items.map((item, index) => ({ assetId: item.assetId,
      albumId: album.id, publicationId: event.id, storeId: scope.store.id,
      position: album.nextPosition + index, caption: item.caption, createdAt: now })) });
    await publishMedia(scope, album.collectionId, ids, now);
    await scope.tx.ticketAlbum.update({ where: { id: album.id }, data: {
      version: { increment: 1 }, nextPosition: { increment: input.items.length } } });
    await syncAlbumRetention(scope, { ticketId: ticket.id });
    await enqueueAlbumPublished(scope.tx, event.id);
    return result(scope, ticket, event);
  });
}

export async function lookupAlbumPublication(identity: Identity, storeId: string, ticketId: string,
  operationId: string): Promise<AlbumPublicationLookup> {
  const id = resourceId(operationId);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const ticket = await requireTicket(scope, ticketId);
    const event = await scope.tx.albumEvent.findUnique({ where: { id } });
    if (!event) return { operation: null };
    if (event.redemptionId !== ticket.id || event.storeId !== scope.store.id ||
        event.actorProfileId !== identity.userId || event.kind !== 'PUBLISH') unavailable();
    const album = await requireAlbum(scope, ticket);
    requireAlbumAuthor(scope, album);
    return { operation: await result(scope, ticket, event) };
  });
}
