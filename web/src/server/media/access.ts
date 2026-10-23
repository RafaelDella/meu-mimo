import '../only.ts';
import type { MediaAsset, MediaCollection } from '../../generated/prisma/client.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { requireAlbumOrigin } from '../albums/access.ts';
import { albumRetention } from '../albums/retention.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow, requireMembership, withStoreTransaction } from '../stores/transaction.ts';
import { resourceId, unavailable } from '../stores/validation.ts';
import { suppressionFor } from '../privacy/suppression.ts';

export type MediaScope = StoreScope & { collection: MediaCollection; allowPausedEvidence: boolean; actorContentSuppressed: boolean;
  memoryPolicy?: { albumId: string; ticketId: string; authorProfileId: string;
    cancelled: boolean; expired: boolean; hold: boolean } };
export type MediaAssetScope = MediaScope & { asset: MediaAsset };

export async function requireMediaCollection(scope: StoreScope, collectionId: string): Promise<MediaScope> {
  const id = resourceId(collectionId);
  const address = await scope.tx.mediaCollection.findFirst({ where: { id, storeId: scope.store.id } });
  if (!address) unavailable();
  await requireConversationAudience(scope, address.participantMembershipId);
  await scope.tx.$queryRaw`SELECT id FROM app."MediaCollection" WHERE id = ${id}::uuid FOR UPDATE`;
  const collection = await scope.tx.mediaCollection.findFirst({ where: { id, storeId: scope.store.id } });
  if (!collection) unavailable();
  let allowPausedEvidence = false;
  let memoryPolicy: MediaScope['memoryPolicy'];
  if (collection.purpose === 'MEMORY') {
    const { album, ticket } = await requireAlbumOrigin(scope, collection);
    await scope.tx.$queryRaw`SELECT id FROM app."TicketAlbum" WHERE id=${album.id}::uuid FOR UPDATE`;
    const retention = await albumRetention(scope, ticket, await databaseNow(scope.tx));
    memoryPolicy = { albumId: album.id, ticketId: ticket.id, authorProfileId: album.createdByProfileId,
      cancelled: ticket.status === 'CANCELLED', expired: retention.expired, hold: retention.hold };
  }
  if (collection.purpose === 'EVIDENCE') {
    const origin = await scope.tx.activitySubmission.findUnique({ where: { id: collection.subjectId },
      select: { status: true, authorProfileId: true } });
    if (origin?.status === 'DRAFT' && origin.authorProfileId !== scope.identity.userId) unavailable();
    allowPausedEvidence = origin?.status === 'CONTESTED' && scope.store.state !== 'CLOSED' &&
      (scope.store.state === 'PAUSED' || scope.store.platformPausedAt !== null);
  }
  const suppression = (await suppressionFor(scope.tx, [scope.identity.userId])).get(scope.identity.userId);
  if (suppression?.identity) unavailable();
  return { ...scope, collection, allowPausedEvidence, memoryPolicy, actorContentSuppressed: !!suppression?.authoredContent };
}

export function withMediaCollection<T>(identity: Identity, storeId: string, collectionId: string,
  operation: (scope: MediaScope) => Promise<T>): Promise<T> {
  return withStoreTransaction(identity, storeId, async scope => operation(await requireMediaCollection(scope, collectionId)));
}

export function withMediaAsset<T>(identity: Identity, storeId: string, assetId: string,
  operation: (scope: MediaAssetScope) => Promise<T>): Promise<T> {
  const id = resourceId(assetId);
  return withStoreTransaction(identity, storeId, async scope => {
    const address = await scope.tx.mediaAsset.findFirst({
      where: { id, collection: { storeId: scope.store.id } }, select: { collectionId: true },
    });
    if (!address) unavailable();
    const context = await requireMediaCollection(scope, address.collectionId);
    await scope.tx.$queryRaw`SELECT id FROM app."MediaAsset" WHERE id = ${id}::uuid FOR UPDATE`;
    const asset = await scope.tx.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.collectionId !== context.collection.id) unavailable();
    const author = (await suppressionFor(scope.tx, [asset.authorProfileId])).get(asset.authorProfileId);
    if (author?.identity || author?.authoredContent) unavailable();
    if (context.memoryPolicy && asset.publishedAt && !await scope.tx.albumItem.findFirst({
      where: { assetId: asset.id, albumId: context.memoryPolicy.albumId }, select: { assetId: true },
    })) unavailable();
    return operation({ ...context, asset });
  });
}

export function assertMediaUpload(scope: MediaScope, asset?: MediaAsset): void {
  const actor = requireMembership(scope);
  if (scope.actorContentSuppressed) unavailable();
  if (asset && asset.authorProfileId !== scope.identity.userId) unavailable();
  if ((scope.collection.purpose === 'EVIDENCE' && actor.id !== scope.collection.participantMembershipId) ||
      (scope.collection.purpose === 'MEMORY' && (actor.role !== 'MERCHANT' || !scope.memoryPolicy ||
        scope.memoryPolicy.authorProfileId !== scope.identity.userId))) unavailable();
  if (scope.collection.uploadsClosedAt ||
      scope.memoryPolicy?.cancelled || scope.memoryPolicy?.expired ||
      (scope.collection.purpose === 'EVIDENCE' && (actor.closedAt || scope.store.state === 'CLOSED')) ||
      (asset && (asset.revision !== scope.collection.revision || asset.removedAt))) {
    throw new AppError('media_read_only', 409, 'Este envio de mídia está fechado. O histórico continua disponível.');
  }
  if (scope.collection.purpose === 'EVIDENCE' && !scope.allowPausedEvidence) {
    if (scope.store.platformPausedAt) {
      throw new AppError('store_platform_paused', 409, 'Novas ações desta lojinha estão pausadas pela plataforma.');
    }
    if (scope.store.state !== 'ACTIVE') {
      throw new AppError('media_read_only', 409, 'Este envio de mídia está fechado. O histórico continua disponível.');
    }
  }
}

export function assertMediaRead(scope: MediaAssetScope): void {
  if (scope.collection.purpose === 'MEMORY' && !scope.memoryPolicy) unavailable();
  if (scope.memoryPolicy?.expired && !scope.memoryPolicy.hold) unavailable();
  if (scope.asset.removedAt || ['REMOVING', 'REMOVED'].includes(scope.asset.state)) unavailable();
  if (!scope.asset.publishedAt && scope.asset.authorProfileId !== scope.identity.userId) unavailable();
}
