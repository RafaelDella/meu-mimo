import '../only.ts';
import type { MediaAsset, Prisma } from '../../generated/prisma/client.ts';
import type { MediaAssetView, MediaFileInput, MediaPage } from '../../contracts/media.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { databaseNow } from '../stores/transaction.ts';
import { operationConflict, pagination, unavailable } from '../stores/validation.ts';
import { assertMediaRead, assertMediaUpload, withMediaAsset, withMediaCollection } from './access.ts';
import { consumeMediaLimit } from './limits.ts';
import { mediaFiles } from './validation.ts';
import { mediaAssetView, mediaCollectionView } from './views.ts';

function sameReservation(asset: MediaAsset, file: MediaFileInput, collectionId: string, authorId: string): boolean {
  return asset.collectionId === collectionId && asset.authorProfileId === authorId &&
    asset.mediaType === file.mediaType && asset.mimeType === file.mimeType &&
    asset.byteLength === file.byteLength && asset.sha256 === file.sha256;
}

export async function listMedia(identity: Identity, storeId: string, collectionId: string,
  query = new URLSearchParams()): Promise<MediaPage> {
  const page = pagination(query);
  await consumeStoreLimit(identity, 'read');
  return withMediaCollection(identity, storeId, collectionId, async scope => {
    const where: Prisma.MediaAssetWhereInput = { collectionId: scope.collection.id, removedAt: null,
      state: { notIn: ['REMOVING', 'REMOVED'] },
      OR: [{ authorProfileId: identity.userId }, { publishedAt: { not: null } }] };
    const total = await scope.tx.mediaAsset.count({ where });
    const assets = await scope.tx.mediaAsset.findMany({ where,
      orderBy: [{ revision: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], skip: page.skip, take: page.pageSize });
    return { collection: mediaCollectionView(scope), items: assets.map(mediaAssetView),
      total, page: page.page, pageSize: page.pageSize };
  });
}

export async function reserveMedia(identity: Identity, storeId: string, collectionId: string,
  body: Record<string, unknown>): Promise<{ items: MediaAssetView[] }> {
  const files = mediaFiles(body);
  await consumeMediaLimit(identity, 'reserve', files.length);
  await consumeStoreLimit(identity, 'write');
  return withMediaCollection(identity, storeId, collectionId, async scope => {
    for (const id of files.map(file => file.operationId).sort()) {
      const key = `meumimo:t06:media-operation:${id}`;
      await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    }
    const existing = await scope.tx.mediaAsset.findMany({ where: { id: { in: files.map(file => file.operationId) } } });
    const reservations = new Map(existing.map(asset => [asset.id, asset]));
    for (const file of files) {
      const asset = reservations.get(file.operationId);
      if (asset && !sameReservation(asset, file, scope.collection.id, identity.userId)) operationConflict();
    }
    const pending = files.filter(file => !reservations.has(file.operationId));
    if (pending.length) {
      assertMediaUpload(scope);
      if (scope.collection.purpose === 'EVIDENCE' && pending.some(file => file.mediaType !== 'PHOTO')) {
        throw new AppError('media_format_invalid', 415, 'A evidência deste registro aceita somente uma foto.');
      }
      const occupied = await scope.tx.mediaAsset.count({ where: { collectionId: scope.collection.id, removedAt: null,
        ...(scope.collection.purpose === 'EVIDENCE' ? { revision: scope.collection.revision } : {}) } });
      const capacity = scope.collection.purpose === 'EVIDENCE' ? 1 : 20;
      if (occupied + pending.length > capacity) {
        throw new AppError('media_limit_reached', 409, 'Este envio já atingiu o limite de arquivos.');
      }
      const now = await databaseNow(scope.tx);
      for (const file of pending) {
        const asset = await scope.tx.mediaAsset.create({ data: {
          id: file.operationId, collectionId: scope.collection.id, authorProfileId: identity.userId,
          revision: scope.collection.revision, mediaType: file.mediaType, mimeType: file.mimeType,
          byteLength: file.byteLength, sha256: file.sha256, createdAt: now, lastActivityAt: now, availableAt: now,
        } });
        reservations.set(asset.id, asset);
      }
    }
    return { items: files.map(file => mediaAssetView(reservations.get(file.operationId)!)) };
  });
}

export async function getMediaAsset(identity: Identity, storeId: string, assetId: string): Promise<MediaAssetView> {
  await consumeStoreLimit(identity, 'read');
  return withMediaAsset(identity, storeId, assetId, async scope => {
    assertMediaRead(scope);
    return mediaAssetView(scope.asset);
  });
}

export async function completeMediaUpload(identity: Identity, storeId: string, assetId: string): Promise<MediaAssetView> {
  await consumeStoreLimit(identity, 'write');
  return withMediaAsset(identity, storeId, assetId, async scope => {
    const { asset } = scope;
    if (asset.authorProfileId !== identity.userId || asset.removedAt) unavailable();
    if (['QUEUED', 'PROCESSING', 'READY'].includes(asset.state) ||
        (asset.state === 'FAILED' && asset.failureCode === 'file_invalid')) return mediaAssetView(asset);
    assertMediaUpload(scope, asset);
    if (!['UPLOADING', 'FAILED'].includes(asset.state)) unavailable();
    if (asset.uploadedBytes !== asset.byteLength) {
      throw new AppError('media_incomplete', 409, 'Conclua o envio de todas as partes deste arquivo.');
    }
    const now = await databaseNow(scope.tx);
    const result = await scope.tx.mediaAsset.update({ where: { id: asset.id }, data: {
      state: 'QUEUED', failureCode: null, attempts: 0, lastActivityAt: now, availableAt: now,
    } });
    return mediaAssetView(result);
  });
}

export async function removeMedia(identity: Identity, storeId: string, assetId: string): Promise<MediaAssetView> {
  await consumeStoreLimit(identity, 'write');
  return withMediaAsset(identity, storeId, assetId, async scope => {
    if (scope.asset.authorProfileId !== identity.userId) unavailable();
    if (scope.asset.removedAt) return mediaAssetView(scope.asset);
    if (scope.collection.purpose === 'EVIDENCE' && scope.asset.publishedAt) {
      const origin = await scope.tx.activitySubmission.findFirst({
        where: { id: scope.collection.subjectId, receivedAt: { not: null } }, select: { id: true },
      });
      if (origin) throw new AppError('media_read_only', 409,
        'A foto deste registro já foi recebida e permanece no histórico.');
    }
    const now = await databaseNow(scope.tx);
    const result = await scope.tx.mediaAsset.update({ where: { id: scope.asset.id }, data: {
      state: 'REMOVING', removedAt: now, lastActivityAt: now, availableAt: now,
      leaseToken: null,
    } });
    return mediaAssetView(result);
  });
}
