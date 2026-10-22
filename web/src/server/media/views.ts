import '../only.ts';
import type { MediaAsset } from '../../generated/prisma/client.ts';
import type { MediaAssetView, MediaPage } from '../../contracts/media.ts';
import { AppError } from '../errors.ts';
import type { MediaScope } from './access.ts';
import { assertMediaUpload } from './access.ts';

export function mediaAssetView(asset: MediaAsset): MediaAssetView {
  return {
    id: asset.id, collectionId: asset.collectionId, revision: asset.revision,
    mediaType: asset.mediaType, mimeType: asset.mimeType, byteLength: asset.byteLength,
    uploadedBytes: asset.uploadedBytes, state: asset.state, createdAt: asset.createdAt.toISOString(),
    publishedAt: asset.publishedAt?.toISOString() ?? null, width: asset.width,
    height: asset.height, durationMs: asset.durationMs, failureCode: asset.failureCode,
  };
}

export function mediaCollectionView(scope: MediaScope): MediaPage['collection'] {
  let writable = true;
  try { assertMediaUpload(scope); }
  catch (error) {
    if (!(error instanceof AppError) || ![404, 409].includes(error.status)) throw error;
    writable = false;
  }
  return { id: scope.collection.id, storeId: scope.store.id, purpose: scope.collection.purpose,
    revision: scope.collection.revision, writable };
}
