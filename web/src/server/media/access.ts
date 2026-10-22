import '../only.ts';
import type { MediaAsset, MediaCollection } from '../../generated/prisma/client.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership, withStoreTransaction } from '../stores/transaction.ts';
import { resourceId, unavailable } from '../stores/validation.ts';

export type MediaScope = StoreScope & { collection: MediaCollection };
export type MediaAssetScope = MediaScope & { asset: MediaAsset };

export async function requireMediaCollection(scope: StoreScope, collectionId: string): Promise<MediaScope> {
  const id = resourceId(collectionId);
  const address = await scope.tx.mediaCollection.findFirst({ where: { id, storeId: scope.store.id } });
  if (!address) unavailable();
  await requireConversationAudience(scope, address.participantMembershipId);
  await scope.tx.$queryRaw`SELECT id FROM app."MediaCollection" WHERE id = ${id}::uuid FOR UPDATE`;
  const collection = await scope.tx.mediaCollection.findFirst({ where: { id, storeId: scope.store.id } });
  if (!collection) unavailable();
  if (collection.purpose === 'EVIDENCE') {
    const origin = await scope.tx.activitySubmission.findUnique({ where: { id: collection.subjectId },
      select: { status: true, authorProfileId: true } });
    if (origin?.status === 'DRAFT' && origin.authorProfileId !== scope.identity.userId) unavailable();
  }
  return { ...scope, collection };
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
    return operation({ ...context, asset });
  });
}

export function assertMediaUpload(scope: MediaScope, asset?: MediaAsset): void {
  const actor = requireMembership(scope);
  if (asset && asset.authorProfileId !== scope.identity.userId) unavailable();
  if ((scope.collection.purpose === 'EVIDENCE' && actor.id !== scope.collection.participantMembershipId) ||
      (scope.collection.purpose === 'MEMORY' && actor.role !== 'MERCHANT')) unavailable();
  if (scope.collection.uploadsClosedAt ||
      (scope.collection.purpose === 'EVIDENCE' && (actor.closedAt || scope.store.state !== 'ACTIVE')) ||
      (asset && (asset.revision !== scope.collection.revision || asset.removedAt))) {
    throw new AppError('media_read_only', 409, 'Este envio de mídia está fechado. O histórico continua disponível.');
  }
}

export function assertMediaRead(scope: MediaAssetScope): void {
  if (scope.asset.removedAt || ['REMOVING', 'REMOVED'].includes(scope.asset.state)) unavailable();
  if (!scope.asset.publishedAt && scope.asset.authorProfileId !== scope.identity.userId) unavailable();
}
